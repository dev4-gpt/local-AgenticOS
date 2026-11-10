"""Canonical profile preparation preserves the buyer frame and source IDs."""

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("reviewed_profiles", ROOT / "scripts" / "prepare-mirofish-reviewed-profiles.py")
PREPARER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARER)


class ReviewedProfilesTest(unittest.TestCase):
    def setUp(self):
        self.brief = "AgentOS has a local client preview. Its current cloud journey is unverified."
        self.rows = [
            {"user_id": "0", "name": "P00001", "username": "buyer_1", "user_char": "invented age 42", "description": "generic"},
            {"user_id": "1", "name": "P00002", "username": "buyer_2", "user_char": "generic", "description": "generic"},
        ]
        self.cohort = {"personas": [
            {"id": "P00001", "firstWorkflow": "review a client handoff"},
            {"id": "P00002", "firstWorkflow": "audit an administrative intake"},
        ]}
        self.frame = [
            {"id": "P00001", "posture": "security reviewer", "field": "agency delivery", "orgSize": "solo", "region": "Europe", "aiLiteracy": "new to AI", "monthlyBudget": "under $50", "privacy": "strict"},
            {"id": "P00002", "posture": "budget holder", "field": "healthcare administration", "orgSize": "21-250", "region": "North America", "aiLiteracy": "expert", "monthlyBudget": "over $1000", "privacy": "standard"},
        ]

    def test_replaces_unsupported_biography_with_source_grounded_workflow(self):
        reviewed = PREPARER.review_profiles(self.rows, self.cohort, self.frame, self.brief)
        self.assertEqual([(row["user_id"], row["name"], row["username"]) for row in reviewed], [
            ("0", "P00001", "buyer_1"), ("1", "P00002", "buyer_2"),
        ])
        self.assertIn("review a client handoff", reviewed[0]["user_char"])
        self.assertIn("new to AI", reviewed[0]["user_char"])
        self.assertIn("audit an administrative intake", reviewed[1]["description"])
        self.assertIn("Monthly budget: over $1000", reviewed[1]["user_char"])
        self.assertIn("do not invent a more precise amount", reviewed[1]["user_char"])
        self.assertIn("Explicitly decline when the budget is below either required price", reviewed[1]["user_char"])
        self.assertIn("defer without implying purchase interest", reviewed[1]["user_char"])
        self.assertNotIn("age 42", reviewed[0]["user_char"])
        for row in reviewed:
            self.assertIn(self.brief, row["user_char"])
            self.assertIn("You have not used the product yourself", row["user_char"])

    def test_refuses_missing_or_duplicate_identities(self):
        with self.assertRaisesRegex(ValueError, "profile_identity_mismatch"):
            PREPARER.review_profiles(self.rows[:1], self.cohort, self.frame, self.brief)
        with self.assertRaisesRegex(ValueError, "profile_identity_mismatch"):
            PREPARER.review_profiles([self.rows[0], self.rows[0]], self.cohort, self.frame, self.brief)

    def test_refuses_missing_product_context(self):
        for brief in (None, " ", "x" * 16001):
            with self.subTest(brief_type=type(brief).__name__):
                with self.assertRaisesRegex(ValueError, "product_brief_invalid"):
                    PREPARER.review_profiles(self.rows, self.cohort, self.frame, brief)


if __name__ == "__main__":
    unittest.main()
