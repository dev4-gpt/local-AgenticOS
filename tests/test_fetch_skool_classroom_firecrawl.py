"""Offline checks for the opt-in, single-page Firecrawl collector."""

import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/fetch-skool-classroom-firecrawl.py"
SPEC = importlib.util.spec_from_file_location("fetch_skool_classroom_firecrawl", SCRIPT)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def test_only_approved_classroom_url_is_allowed(self):
        self.assertEqual(collector.checked_url(collector.DEFAULT_URL), collector.DEFAULT_URL)
        for url in (
            "http://www.skool.com/ai-profit-lab-7462/classroom/one",
            "https://www.skool.com.evil.test/ai-profit-lab-7462/classroom/one",
            "https://www.skool.com/other-community/classroom/one",
            "https://user:password@www.skool.com/ai-profit-lab-7462/classroom/one",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                collector.checked_url(url)

    def test_request_is_one_uncached_page_with_cookie_only_in_body(self):
        captured = []
        response = {
            "success": True,
            "data": {
                "markdown": "# Synthetic lesson",
                "links": ["https://example.org/resource"],
                "json": {"title": "Synthetic lesson", "lesson_text": "Test"},
                "metadata": {"statusCode": 200},
            },
        }

        def fake_urlopen(request, timeout):
            captured.append((request, timeout))
            return io.BytesIO(json.dumps(response).encode("utf-8"))

        with patch.object(collector.urllib.request, "urlopen", side_effect=fake_urlopen):
            document = collector.fetch_page(collector.DEFAULT_URL, "synthetic-api-key", "session=synthetic-secret")
        self.assertEqual(len(captured), 1)
        request, timeout = captured[0]
        body = json.loads(request.data)
        self.assertEqual(request.full_url, collector.API_URL)
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(body["url"], collector.DEFAULT_URL)
        self.assertEqual(body["headers"], {"Cookie": "session=synthetic-secret"})
        self.assertIs(body["storeInCache"], False)
        self.assertEqual(timeout, 100)
        self.assertNotIn("synthetic-secret", repr(request.headers))
        self.assertNotIn("synthetic-secret", json.dumps(document))
        self.assertEqual(document["markdown"], "# Synthetic lesson")

    def test_private_output_is_exclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private" / "page.json"
            collector.write_private(path, {"markdown": "Synthetic"})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                collector.write_private(path, {"markdown": "Other"})


if __name__ == "__main__":
    unittest.main()
