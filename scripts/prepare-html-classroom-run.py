#!/usr/bin/env python3
"""Convert one locally saved HTML page into a private ClassroomRun JSON file."""

import argparse
import hashlib
import html
import json
import os
import re
import stat
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urljoin, urlsplit, urlunsplit

MAX_HTML_BYTES = 20 * 1024 * 1024
SENSITIVE_QUERY_KEY = re.compile(
    r"^(?:api_?key|access_?token|refresh_?token|id_?token|token|secret|password|code|signature|sig|auth|authorization|jwt|session|session_?id|awsaccesskeyid|googleaccessid|key_pair_id|x_(?:amz|goog)_(?:algorithm|credential|date|expires|security_token|signature|signedheaders))$",
    re.IGNORECASE,
)
SECRET_LIKE = re.compile(
    r"(api[_ -]?key|secret|password|private[_ -]?key|access[_ -]?token)\s*[:=]\s*[^\s]{4,}|\b(?:sk|rk|ghp|xai)-[A-Za-z0-9_-]{16,}\b",
    re.IGNORECASE,
)
BLOCKED_TAGS = {"head", "script", "style", "title", "noscript", "template", "svg", "canvas"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
BLOCK_TAGS = {"address", "article", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "li", "main", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"}


def safe_http_url(raw: str, base: str) -> str | None:
    candidate = urljoin(base, raw.strip())
    parts = urlsplit(candidate)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
        return None
    if any(SENSITIVE_QUERY_KEY.match(key.replace("-", "_").replace(" ", "_")) for key, _ in parse_qsl(parts.query, keep_blank_values=True)):
        return None
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


class PageParser(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.stack: list[tuple[str, bool]] = []
        self.title_depth = 0
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[dict[str, str]] = []
        self.media: list[dict[str, str]] = []
        self.anchor_stack: list[dict[str, str]] = []
        self.skipped: list[str] = []
        self.metadata: dict[str, str] = {}

    @property
    def hidden(self) -> bool:
        return any(hidden for _, hidden in self.stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): value or "" for key, value in attrs}
        if tag == "title":
            self.title_depth += 1
        if tag == "meta":
            key = (attributes.get("property") or attributes.get("name") or "").lower()
            if key in {"og:title", "twitter:title"} and attributes.get("content"):
                self.metadata.setdefault("title", attributes["content"].strip())
        hidden = (
            tag in BLOCKED_TAGS
            or "hidden" in attributes
            or attributes.get("aria-hidden", "").lower() == "true"
            or bool(re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", attributes.get("style", ""), re.IGNORECASE))
        )
        inherited_hidden = self.hidden
        if tag not in VOID_TAGS:
            self.stack.append((tag, hidden or inherited_hidden))
        if self.hidden:
            return
        if tag in BLOCK_TAGS:
            self.text_parts.append("\n")
        if tag == "a" and attributes.get("href"):
            self.anchor_stack.append({"href": attributes["href"], "text": ""})
        if tag in {"video", "audio", "source", "iframe", "img", "embed"}:
            raw_url = attributes.get("src") or (attributes.get("poster") if tag == "video" else "")
            if raw_url:
                parent_tag = self.stack[-1][0] if self.stack else ""
                kind = "video" if tag == "video" or (tag == "source" and parent_tag == "video") else "audio" if tag == "audio" or (tag == "source" and parent_tag == "audio") else "image" if tag == "img" else "embed" if tag in {"iframe", "embed"} else "file"
                label = (attributes.get("title") or attributes.get("alt") or attributes.get("aria-label") or f"Saved-page {kind}").strip()
                self._record_media(raw_url, kind, label)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self.title_depth:
            self.title_depth -= 1
        if self.anchor_stack and tag == "a" and not self.hidden:
            anchor = self.anchor_stack.pop()
            self._record_link(anchor["href"], anchor["text"])
        if tag in BLOCK_TAGS:
            self.text_parts.append("\n")
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data: str) -> None:
        if self.title_depth:
            self.title_parts.append(data)
        if self.hidden:
            return
        text = data.strip()
        if not text:
            return
        self.text_parts.append(text)
        for anchor in self.anchor_stack:
            anchor["text"] += f" {text}"

    def _record_link(self, raw_url: str, label: str) -> None:
        url = safe_http_url(raw_url, self.page_url)
        if not url:
            self.skipped.append("A saved-page link was omitted because its URL was unsupported or contained credentials.")
            return
        self.links.append({"url": url, "text": re.sub(r"\s+", " ", label).strip()[:300] or "Saved-page link"})

    def _record_media(self, raw_url: str, kind: str, label: str) -> None:
        url = safe_http_url(raw_url, self.page_url)
        if not url:
            self.skipped.append("A saved-page media reference was omitted because its URL was unsupported or contained credentials.")
            return
        self.media.append({"url": url, "kind": kind, "title": re.sub(r"\s+", " ", label)[:280] or f"Saved-page {kind}"})


def normalize_text(parts: list[str]) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in " ".join(parts).splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(line for line in lines if line)).strip()


def render_safe_html(run: dict) -> str:
    source = run["sources"][0]
    lines = [
        "<!doctype html>",
        '<html lang="en"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{html.escape(source['title'])} - sanitized lesson copy</title></head><body>",
        f"<h1>{html.escape(source['title'])}</h1>",
        f'<p>Original lesson: <a href="{html.escape(source["url"], quote=True)}">{html.escape(source["url"])}</a></p>',
    ]
    if source.get("publishedAt"):
        lines.append(f"<p>Published: {html.escape(source['publishedAt'])}</p>")
    lines.append(f"<main><pre>{html.escape(source['text'])}</pre></main>")
    if source.get("links"):
        lines.append("<section><h2>Links</h2><ul>")
        for item in source["links"]:
            lines.append(f'<li><a href="{html.escape(item["url"], quote=True)}">{html.escape(item["text"])}</a></li>')
        lines.append("</ul></section>")
    if source.get("media"):
        lines.append("<section><h2>Media references</h2><ul>")
        for item in source["media"]:
            lines.append(f'<li>{html.escape(item["kind"])}: <a href="{html.escape(item["url"], quote=True)}">{html.escape(item["title"])}</a></li>')
        lines.append("</ul><p>References only; media bytes are not included.</p></section>")
    lines.append("</body></html>")
    return "\n".join(lines) + "\n"


def convert_html(path: Path, page_url: str, title: str | None, published_date: str | None) -> tuple[dict, dict]:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size < 1 or info.st_size > MAX_HTML_BYTES or path.suffix.lower() not in {".html", ".htm"}:
        raise ValueError("html_file_invalid")
    source = safe_http_url(page_url, page_url)
    if not source:
        raise ValueError("source_url_invalid")
    raw = path.read_bytes()
    decoded = raw.decode("utf-8-sig", errors="replace")
    parser = PageParser(source)
    parser.feed(decoded)
    parser.close()
    text = normalize_text(parser.text_parts)
    if not text:
        raise ValueError("html_text_unavailable")
    page_title = (title or parser.metadata.get("title") or " ".join(parser.title_parts) or path.stem).strip()
    if not page_title or len(page_title) > 240:
        raise ValueError("html_title_invalid")
    if SECRET_LIKE.search(f"{page_title}\n{text}"):
        raise ValueError("html_secret_like_content")
    source_item: dict = {
        "title": page_title,
        "tab": page_title,
        "url": source,
        "text": text,
        "links": parser.links,
        "media": parser.media,
        "collectedAt": datetime.now(timezone.utc).isoformat(),
    }
    if published_date:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", published_date):
            raise ValueError("published_date_invalid")
        source_item["publishedAt"] = published_date
    run = {"startUrl": source, "sources": [source_item], "skipped": parser.skipped}
    metadata = {
        "filename": path.name,
        "inputSha256": hashlib.sha256(raw).hexdigest(),
        "textCharacters": len(text),
        "links": len(parser.links),
        "mediaReferences": len(parser.media),
        "skippedReferences": len(parser.skipped),
        "title": page_title,
        "publishedDate": published_date,
        "coverage": "single saved page only; community inventory and remaining pages are unknown",
    }
    return run, metadata


def main() -> int:
    argument_parser = argparse.ArgumentParser(description=__doc__)
    argument_parser.add_argument("html", type=Path)
    argument_parser.add_argument("page_url")
    argument_parser.add_argument("output", type=Path)
    argument_parser.add_argument("--title")
    argument_parser.add_argument("--published-date")
    argument_parser.add_argument("--safe-html-output", type=Path)
    args = argument_parser.parse_args()
    try:
        if args.safe_html_output and args.safe_html_output == args.output:
            raise ValueError("output_paths_must_differ")
        if args.safe_html_output and args.safe_html_output.exists():
            raise ValueError("output_exists")
        run, metadata = convert_html(args.html, args.page_url, args.title, args.published_date)
        encoded = json.dumps(run, ensure_ascii=False, indent=2) + "\n"
        descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(encoded)
        if args.safe_html_output:
            descriptor = os.open(args.safe_html_output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                output.write(render_safe_html(run))
            metadata["safeHtmlOutput"] = str(args.safe_html_output)
        print(json.dumps({"output": str(args.output), **metadata}))
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print(str(error) if isinstance(error, ValueError) else "html_source_pack_failed", file=__import__("sys").stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
