"""Ensure the retired authenticated Skool collector fails before networking."""

import contextlib
import importlib.util
import io
import os
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/fetch-skool-classroom-firecrawl.py"
SPEC = importlib.util.spec_from_file_location("fetch_skool_classroom_firecrawl", SCRIPT)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class CollectorTests(unittest.TestCase):
    def test_execute_refuses_without_reading_or_echoing_credentials(self):
        output = io.StringIO()
        with patch.dict(os.environ, {
            "FIRECRAWL_API_KEY": "synthetic-api-secret",
            "SKOOL_COOKIE_HEADER": "session=synthetic-session-secret",
        }), patch("urllib.request.urlopen", side_effect=AssertionError("network must not be used")):
            with contextlib.redirect_stderr(output):
                result = collector.main(["--execute"])

        self.assertEqual(result, 2)
        self.assertIn("Automated Skool collection is disabled", output.getvalue())
        self.assertIn("platform-approved owner export", output.getvalue())
        self.assertNotIn("synthetic-api-secret", output.getvalue())
        self.assertNotIn("synthetic-session-secret", output.getvalue())

    def test_custom_url_cannot_reenable_the_retired_collector(self):
        output = io.StringIO()
        with patch("urllib.request.urlopen", side_effect=AssertionError("network must not be used")):
            with contextlib.redirect_stderr(output):
                result = collector.main(["--url", "https://example.org/lesson", "--execute"])

        self.assertEqual(result, 2)
        self.assertIn("Automated Skool collection is disabled", output.getvalue())


if __name__ == "__main__":
    unittest.main()
