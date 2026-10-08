"""Local-only fixture checks for the MiroFish run artifact auditor."""

import csv
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("buyer_run_audit", ROOT / "scripts" / "audit-mirofish-buyer-run.py")
AUDITOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDITOR)


class BuyerRunAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.simulation = self.root / "sim_test"
        self.simulation.mkdir()
        self.cohort = self.root / "cohort.json"
        self.cohort.write_text(json.dumps({"personas": [
            {"id": "P00001", "firstWorkflow": "review an intake handoff"},
            {"id": "P00002", "firstWorkflow": "compare approval evidence"},
        ]}), encoding="utf-8")
        self.config = {
            "simulation_id": "sim_test",
            "agent_configs": [{"entity_name": "P00001"}, {"entity_name": "P00002"}],
            "event_config": {"initial_posts": [{"poster_agent_id": 0, "content": "P00001 evaluates this tool"}]},
        }
        self._write("simulation_config.json", self.config)
        self._write("run_state.json", {
            "simulation_id": "sim_test", "runner_status": "completed", "current_round": 1, "total_rounds": 1,
            "twitter_completed": True, "twitter_actions_count": 2,
        })
        (self.simulation / "simulation.log").write_text("模拟循环完成", encoding="utf-8")
        with (self.simulation / "twitter_profiles.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["user_id", "name", "user_char", "description"])
            writer.writeheader()
            writer.writerows([
                {"user_id": 0, "name": "P00001", "user_char": "review an intake handoff", "description": ""},
                {"user_id": 1, "name": "P00002", "user_char": "compare approval evidence", "description": ""},
            ])
        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.executescript(
            "CREATE TABLE user(user_id INTEGER, agent_id INTEGER);"
            "CREATE TABLE post(post_id INTEGER, user_id INTEGER, content TEXT, created_at INTEGER);"
            "INSERT INTO user VALUES (1,0),(2,1);"
            "INSERT INTO post VALUES (1,1,'P00001 evaluates this tool',0),(2,2,'A skeptical response',1);"
        )
        database.commit()
        database.close()
        actions = self.simulation / "twitter" / "actions.jsonl"
        actions.parent.mkdir()
        actions.write_text(
            '{"action_type":"CREATE_POST","post_id":1,"agent_id":0,"action_args":{"content":"P00001 evaluates this tool"}}\n'
            '{"action_type":"CREATE_POST","post_id":2,"agent_id":1,"action_args":{"content":"A skeptical response"}}\n'
            '{"event_type":"simulation_end","total_rounds":1,"total_actions":2}\n',
            encoding="utf-8",
        )

    def _write(self, name, value):
        (self.simulation / name).write_text(json.dumps(value), encoding="utf-8")

    def test_complete_telemetry_and_attribution_pass(self):
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertTrue(result["pilotEvidencePassed"])
        self.assertFalse(result["marketValidation"])
        self.assertEqual(result["actionLogRows"], 2)
        self.assertEqual(result["tracedPosts"], 2)
        self.assertEqual(result["completionEvents"], 1)
        self.assertTrue(result["checks"]["profileWorkflowCoverage"])

    def test_missing_first_workflow_fails_even_with_complete_telemetry(self):
        profile_path = self.simulation / "twitter_profiles.csv"
        with profile_path.open(encoding="utf-8", newline="") as handle:
            profiles = list(csv.DictReader(handle))
        profiles[1]["user_char"] = "generic buyer profile"
        with profile_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=profiles[0].keys())
            writer.writeheader()
            writer.writerows(profiles)
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["pilotEvidencePassed"])
        self.assertEqual(result["missingWorkflowProfiles"], ["P00002"])
        self.assertFalse(result["checks"]["profileWorkflowCoverage"])

    def test_misattribution_and_missing_telemetry_fail(self):
        self.config["event_config"]["initial_posts"][0]["content"] = "P00002 evaluates this tool"
        self._write("simulation_config.json", self.config)
        self._write("run_state.json", {
            "simulation_id": "sim_test", "runner_status": "stopped", "current_round": 0, "total_rounds": 1,
            "twitter_completed": False, "twitter_actions_count": 0,
        })
        (self.simulation / "twitter" / "actions.jsonl").unlink()
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["pilotEvidencePassed"])
        self.assertFalse(result["checks"]["initialPostAttribution"])
        self.assertFalse(result["checks"]["actionTelemetry"])
        self.assertFalse(result["checks"]["completionTelemetry"])

    def test_unmapped_post_agent_fails_without_crashing(self):
        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.executescript("INSERT INTO user VALUES (3,99); INSERT INTO post VALUES (3,3,'Other post',1);")
        database.commit()
        database.close()
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["postAgentMapping"])
        self.assertEqual(result["unknownPostAgents"], [99])

    def test_completed_run_without_buyer_generated_posts_is_not_a_pilot_pass(self):
        self.config["agent_configs"][0].update({"activity_level": 1, "active_hours": [9]})
        self._write("simulation_config.json", self.config)
        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.execute("DELETE FROM post WHERE created_at != 0")
        database.commit()
        database.close()
        self._write("run_state.json", {
            "simulation_id": "sim_test", "runner_status": "completed", "current_round": 1, "total_rounds": 1,
            "twitter_completed": True, "twitter_actions_count": 1,
        })
        (self.simulation / "twitter" / "actions.jsonl").write_text(
            '{"action_type":"CREATE_POST","post_id":1,"agent_id":0,"action_args":{"content":"P00001 evaluates this tool"}}\n'
            '{"event_type":"simulation_end","total_rounds":1,"total_actions":1}\n',
            encoding="utf-8",
        )
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertTrue(result["checks"]["actionTelemetry"])
        self.assertTrue(result["checks"]["completionTelemetry"])
        self.assertFalse(result["checks"]["buyerActivity"])
        self.assertFalse(result["pilotEvidencePassed"])

    def test_stopped_run_without_text_log_marker_still_fails_completion(self):
        (self.simulation / "simulation.log").unlink()
        self._write("run_state.json", {
            "simulation_id": "sim_test", "runner_status": "stopped", "current_round": 1, "total_rounds": 1,
            "twitter_completed": False, "twitter_actions_count": 2,
        })
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["completionTelemetry"])
        self.assertFalse(result["pilotEvidencePassed"])

    def test_unrelated_actions_cannot_replace_committed_post_telemetry(self):
        (self.simulation / "twitter" / "actions.jsonl").write_text(
            '{"action_type":"FOLLOW","agent_id":0}\n'
            '{"action_type":"LIKE","agent_id":1}\n'
            '{"event_type":"simulation_end","total_rounds":1,"total_actions":2}\n',
            encoding="utf-8",
        )
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertEqual(result["actionLogRows"], 2)
        self.assertEqual(result["tracedPosts"], 0)
        self.assertFalse(result["checks"]["actionTelemetry"])
        self.assertFalse(result["pilotEvidencePassed"])

    def test_wrong_post_identity_and_duplicate_end_event_fail(self):
        path = self.simulation / "twitter" / "actions.jsonl"
        text = path.read_text(encoding="utf-8").replace('"post_id":2', '"post_id":99')
        path.write_text(text, encoding="utf-8")
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["actionTelemetry"])
        path.write_text(text + '{"event_type":"simulation_end","total_rounds":1,"total_actions":2}\n', encoding="utf-8")
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["completionTelemetry"])

    def test_copied_run_state_and_zero_rounds_fail(self):
        self._write("run_state.json", {
            "simulation_id": "sim_other", "runner_status": "completed", "current_round": 1,
            "total_rounds": 1, "twitter_completed": True, "twitter_actions_count": 2,
        })
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["runIdentity"])
        self.assertFalse(result["pilotEvidencePassed"])

        self._write("run_state.json", {
            "simulation_id": "sim_test", "runner_status": "completed", "current_round": 0,
            "total_rounds": 0, "twitter_completed": True, "twitter_actions_count": 2,
        })
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["completionTelemetry"])


if __name__ == "__main__":
    unittest.main()
