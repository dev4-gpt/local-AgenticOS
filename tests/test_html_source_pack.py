import importlib.util
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare-html-classroom-run.py"
SPEC = importlib.util.spec_from_file_location("prepare_html_classroom_run", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HtmlSourcePackTests(unittest.TestCase):
    def convert(self, content: str):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        page = Path(directory.name) / "lesson.html"
        page.write_text(content, encoding="utf-8")
        return MODULE.convert_html(page, "https://www.skool.com/community/classroom/lesson", None, "2026-05-11")

    def test_extracts_readable_page_text_links_and_video_references_without_running_scripts(self):
        run, metadata = self.convert("""
            <!doctype html><html><head><title>Build a workflow</title>
            <meta property="og:title" content="Open Graph title"></head><body>
            <main><h1>Lesson objective</h1><p>Use the <a href="/resource">reference guide</a>.</p>
            <video title="Lesson recording"><source src="/lesson.mp4"></video>
            <script>window.injected = 'not lesson text';</script>
            <div hidden>Private collapsed content</div>
            </main></body></html>
        """)
        source = run["sources"][0]
        self.assertEqual(source["title"], "Open Graph title")
        self.assertEqual(source["publishedAt"], "2026-05-11")
        self.assertIn("Lesson objective", source["text"])
        self.assertIn("reference guide", source["text"])
        self.assertNotIn("injected", source["text"])
        self.assertNotIn("Private collapsed content", source["text"])
        self.assertEqual(source["links"], [{"url": "https://www.skool.com/resource", "text": "reference guide"}])
        self.assertEqual(source["media"], [{"url": "https://www.skool.com/lesson.mp4", "kind": "video", "title": "Saved-page video"}])
        self.assertEqual(metadata["coverage"], "single saved page only; community inventory and remaining pages are unknown")

    def test_drops_credential_bearing_links_without_recording_the_sensitive_url(self):
        run, metadata = self.convert('<html><body><main><p>Lesson text</p><a href="https://example.org/watch?token=secret-value">Video</a></main></body></html>')
        self.assertEqual(run["sources"][0]["links"], [])
        self.assertEqual(metadata["skippedReferences"], 1)
        self.assertNotIn("secret-value", str(run))

    def test_rejects_credential_shaped_page_text_before_any_run_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory) / "lesson.html"
            page.write_text("<main>API_KEY=abcdefghijklmnop</main>", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "html_secret_like_content"):
                MODULE.convert_html(page, "https://www.skool.com/community/lesson", None, None)

    def test_requires_a_real_html_file_and_valid_public_page_url(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "lesson.txt"
            file.write_text("<main>Lesson</main>", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "html_file_invalid"):
                MODULE.convert_html(file, "https://example.org/lesson", None, None)
            file = Path(directory) / "lesson.html"
            file.write_text("<main>Lesson</main>", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "source_url_invalid"):
                MODULE.convert_html(file, "file:///tmp/lesson.html", None, None)

    def test_cli_writes_private_run_and_existing_importer_pack(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            html = root / "lesson.html"
            run_file = root / "lesson-run.json"
            html.write_text('<html><body><main><h1>Lesson</h1><a href="/guide">Guide</a></main></body></html>', encoding="utf-8")
            subprocess.run([
                sys.executable, str(SCRIPT), str(html), "https://www.skool.com/community/lesson", str(run_file),
                "--safe-html-output", str(root / "lesson-sanitized.html"),
            ], check=True, capture_output=True, text=True)
            self.assertEqual(stat.S_IMODE(run_file.stat().st_mode), 0o600)
            safe_html = (root / "lesson-sanitized.html").read_text(encoding="utf-8")
            self.assertEqual(stat.S_IMODE((root / "lesson-sanitized.html").stat().st_mode), 0o600)
            self.assertNotIn("<script", safe_html)
            self.assertIn('href="https://www.skool.com/guide"', safe_html)
            self.assertIn("Lesson", safe_html)
            run = json.loads(run_file.read_text(encoding="utf-8"))
            self.assertEqual(run["sources"][0]["links"][0]["url"], "https://www.skool.com/guide")
            repo = SCRIPT.parents[1]
            subprocess.run([
                os.environ.get("NODE", "node"), str(repo / "scripts" / "prepare-classroom-source-pack.mjs"),
                str(run_file), str(root / "lesson-pack.json"),
            ], cwd=repo, check=True, capture_output=True, text=True)
            manifest = json.loads((root / "lesson-pack.manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["coverage"]["outputSources"], 1)
            self.assertEqual(manifest["coverage"]["outputLinks"], 1)
            self.assertIsNone(manifest["coverage"]["pendingPages"])
            self.assertFalse(manifest["coverage"]["discoveredQueueExhausted"])


if __name__ == "__main__":
    unittest.main()
