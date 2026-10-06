"""Fetch one authorized Skool classroom page through Firecrawl, on explicit opt-in."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_URL = "https://www.skool.com/ai-profit-lab-7462/classroom/9daf24e1?md=097eb41a59b74f06a6112351c07216fa"
DEFAULT_OUTPUT = Path(".private-client-kits/skool-classroom-page.json")
API_URL = "https://api.firecrawl.dev/v2/scrape"

CLASSROOM_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "lesson_text": {"type": "string"},
        "section_headings": {"type": "array", "items": {"type": "string"}},
        "visible_dates": {"type": "array", "items": {"type": "string"}},
        "resource_links": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"label": {"type": "string"}, "url": {"type": "string"}},
                "required": ["label", "url"],
            },
        },
        "video_page_links": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "lesson_text", "section_headings", "visible_dates", "resource_links", "video_page_links"],
}


def checked_url(value: str) -> str:
    url = urlparse(value)
    if (url.scheme != "https" or url.hostname != "www.skool.com" or url.username or url.password or url.port):
        raise ValueError("Only HTTPS www.skool.com classroom URLs are allowed")
    if not url.path.startswith("/ai-profit-lab-7462/classroom/"):
        raise ValueError("URL must belong to the approved classroom")
    return value


def checked_cookie(value: str) -> str:
    if not value or "\r" in value or "\n" in value or len(value) > 16_000:
        raise ValueError("SKOOL_COOKIE_HEADER is missing or malformed")
    return value


def fetch_page(url: str, api_key: str, cookie: str) -> dict:
    payload = {
        "url": url,
        "headers": {"Cookie": cookie},
        "formats": [
            "markdown",
            "links",
            {
                "type": "json",
                "schema": CLASSROOM_SCHEMA,
                "prompt": "Extract only visible classroom lesson text, dates, resource links, and video page links. Do not invent missing content.",
            },
        ],
        "onlyMainContent": True,
        "storeInCache": False,
        "maxAge": 0,
        "timeout": 90_000,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=100) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Firecrawl request failed with HTTP {error.code}") from None
    except urllib.error.URLError:
        raise RuntimeError("Firecrawl request failed; check network access") from None

    if result.get("success") is not True or not isinstance(result.get("data"), dict):
        raise RuntimeError("Firecrawl did not return a successful scrape")
    data = result["data"]
    status = data.get("metadata", {}).get("statusCode")
    if not isinstance(status, int) or not 200 <= status < 300:
        raise RuntimeError(f"Target page did not load successfully (status {status})")
    if not isinstance(data.get("markdown"), str) or not data["markdown"].strip():
        raise RuntimeError("No classroom text was returned; check authentication manually")
    if not isinstance(data.get("json"), dict):
        raise RuntimeError("Structured extraction is missing; check the page manually")
    return {
        "sourceUrl": url,
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "pageStatus": status,
        "markdown": data["markdown"],
        "links": data.get("links", []),
        "structured": data["json"],
    }


def write_private(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    encoded = json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as file:
        file.write(encoded)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--execute", action="store_true", help="Make the one-page Firecrawl request")
    parser.add_argument("--share-session-with-firecrawl", action="store_true", help="Acknowledge that Firecrawl receives the Skool session cookie")
    args = parser.parse_args()
    try:
        url = checked_url(args.url)
        if not args.execute:
            print(f"Dry run: one page {url}; output {args.output}. No request made.")
            return 0
        if not args.share_session_with_firecrawl:
            raise ValueError("Explicit --share-session-with-firecrawl is required")
        api_key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
        if not api_key:
            raise ValueError("FIRECRAWL_API_KEY is required")
        cookie = checked_cookie(os.environ.get("SKOOL_COOKIE_HEADER", ""))
        if args.output.exists():
            raise ValueError("Output already exists; choose a new private output path")
        document = fetch_page(url, api_key, cookie)
        write_private(args.output, document)
        print(f"Saved one page to {args.output}; review it before importing. No crawl was started.")
        return 0
    except (ValueError, RuntimeError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
