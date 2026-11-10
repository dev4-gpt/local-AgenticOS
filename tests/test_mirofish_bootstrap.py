"""Offline contract checks for the MiroFish project bootstrap."""

import importlib.util
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "mirofish_bootstrap", ROOT / "scripts" / "bootstrap-mirofish-buyer-pilot.py"
)
BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOTSTRAP)


class MirofishBootstrapTest(unittest.TestCase):
    def setUp(self):
        self.ids = [f"P{index:05d}" for index in range(1, 11)]
        self.cohort = {"cohort": "test-v2", "personas": [{"id": item} for item in self.ids]}

    def test_focused_seed_selection_defaults_to_the_v2_private_artifact(self):
        self.assertEqual(
            BOOTSTRAP.select_seed_path(None, True),
            ROOT / "tmp/mirofish-buyer-seed-focused-v2.md",
        )
        self.assertEqual(
            BOOTSTRAP.select_seed_path(None, False),
            ROOT / "tmp/mirofish-buyer-seed-10.md",
        )
        explicit = Path("/private/tmp/reviewed-seed.md")
        self.assertEqual(BOOTSTRAP.select_seed_path(explicit, True), explicit)

    def test_seed_must_match_the_selected_cohort_and_all_ids_exactly(self):
        seed = "# Synthetic focused cohort\n" + "\n".join(
            f"## Fictional buyer {item}" for item in self.ids
        )
        self.assertEqual(BOOTSTRAP.validate_seed_cohort(seed, self.cohort, True), self.ids)

        with self.assertRaisesRegex(ValueError, "seed_cohort_mismatch"):
            BOOTSTRAP.validate_seed_cohort(seed, self.cohort, False)
        with self.assertRaisesRegex(ValueError, "seed_cohort_mismatch"):
            BOOTSTRAP.validate_seed_cohort(seed.replace(self.ids[0], "P99999"), self.cohort, True)
        with self.assertRaisesRegex(ValueError, "seed_cohort_mismatch"):
            BOOTSTRAP.validate_seed_cohort(seed + f"\n## Fictional buyer {self.ids[0]}", self.cohort, True)

    def test_mirofish_revision_pin_is_an_exact_commit(self):
        self.assertRegex(BOOTSTRAP.PINNED_COMMIT, re.compile(r"^[0-9a-f]{40}$"))
        self.assertEqual(BOOTSTRAP.DEFAULT_ROOT, ROOT.parents[1] / "MiroFish-Buyer-Pilot")


if __name__ == "__main__":
    unittest.main()
