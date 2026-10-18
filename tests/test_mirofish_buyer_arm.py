"""Preflight checks for the bounded MiroFish buyer smoke schedule."""

import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("buyer_arm", ROOT / "scripts" / "arm-mirofish-buyer-smoke.py")
ARM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARM)


class BuyerArmTest(unittest.TestCase):
    def setUp(self):
        self.config = {
            "agent_configs": [{"entity_name": "P00001"}, {"entity_name": "P00002"}],
            "event_config": {"initial_posts": [{"poster_agent_id": 0, "content": "P00001 reviews AgentOS"}]},
        }

    def test_matching_post_is_accepted(self):
        ARM.validate_initial_post_attribution(self.config)

    def test_wrong_persona_is_rejected(self):
        self.config["event_config"]["initial_posts"][0]["content"] = "P00002 reviews AgentOS"
        with self.assertRaisesRegex(ValueError, "attribution mismatch"):
            ARM.validate_initial_post_attribution(self.config)

    def test_untagged_or_unknown_poster_is_rejected(self):
        self.config["event_config"]["initial_posts"][0]["content"] = "A generic announcement"
        with self.assertRaisesRegex(ValueError, "attribution mismatch"):
            ARM.validate_initial_post_attribution(self.config)
        self.config["event_config"]["initial_posts"][0]["poster_agent_id"] = 99
        with self.assertRaisesRegex(ValueError, "unknown poster_agent_id"):
            ARM.validate_initial_post_attribution(self.config)

    def test_valid_dry_run_sets_no_wait_without_writing(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "simulation_config.json"
            agents = [{"entity_name": name} for name in ["P00603", "P04949", *[f"P{i:05d}" for i in range(2, 10)]]]
            config = {
                "simulation_id": "sim-test",
                "agent_configs": agents,
                "event_config": {"initial_posts": [{"poster_agent_id": 0, "content": "P00603 considers AgentOS"}]},
                "reddit_config": None,
                "time_config": {},
                "generation_reasoning": "test",
            }
            original = json.dumps(config)
            path.write_text(original, encoding="utf-8")
            output = io.StringIO()
            with patch.object(sys, "argv", ["arm", "--config", str(path)]), redirect_stdout(output):
                ARM.main()
            self.assertEqual(path.read_text(encoding="utf-8"), original)
            self.assertFalse(json.loads(output.getvalue())["waitForCommands"])
