"""Local-only fixture checks for the MiroFish run artifact auditor."""

import csv
import hashlib
import importlib.util
import json
import os
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
            "agent_configs": [{"entity_name": "P00001"}, {"entity_name": "P00002", "activity_level": 1, "active_hours": [9]}],
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
            "CREATE TABLE post(post_id INTEGER, user_id INTEGER, content TEXT, created_at INTEGER, quote_content TEXT, original_post_id INTEGER);"
            "INSERT INTO user VALUES (1,0),(2,1);"
            "INSERT INTO post(post_id,user_id,content,created_at,quote_content,original_post_id) VALUES "
            "(1,1,'P00001 evaluates this tool',0,NULL,NULL),"
            "(2,2,'P00001 evaluates this tool',1,'A skeptical response',1);"
        )
        database.commit()
        database.close()
        actions = self.simulation / "twitter" / "actions.jsonl"
        actions.parent.mkdir()
        actions.write_text(
            '{"action_type":"CREATE_POST","post_id":1,"agent_id":0,"action_args":{"content":"P00001 evaluates this tool"}}\n'
            '{"action_type":"CREATE_POST","post_id":2,"agent_id":1,"action_args":{"content":"P00001 evaluates this tool"}}\n'
            '{"event_type":"simulation_end","total_rounds":1,"total_actions":2}\n',
            encoding="utf-8",
        )
        self._write("buyer_review.json", {
            "schemaVersion": 2,
            "simulationId": "sim_test",
            "reviewer": "pilot-reviewer",
            "reviewedAt": "2026-10-07T12:00:00Z",
            "posts": [{
                "postId": 2, "agentId": 1,
                "content": "A skeptical response",
                "contentSha256": hashlib.sha256(b"A skeptical response").hexdigest(),
                "quotedPostId": 1,
                "quotedContent": "P00001 evaluates this tool",
                "quotedContentSha256": hashlib.sha256(b"P00001 evaluates this tool").hexdigest(),
                "scenarioRelevant": True, "roleFaithful": True, "scopeSafe": True, "actionable": True,
            }],
        })
        (self.simulation / "buyer_review.json").chmod(0o600)

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
        self.assertTrue(result["checks"]["buyerContentReview"])
        self.assertTrue(result["checks"]["dynamicPostNovelty"])
        self.assertTrue(result["checks"]["dynamicPostPersonaIdentity"])
        self.assertTrue(result["checks"]["crossBuyerInteraction"])
        self.assertEqual(result["reviewedDynamicPosts"], 1)

    def test_copied_or_wrong_persona_dynamic_post_fails_without_content_review(self):
        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.execute("UPDATE post SET quote_content = 'P00001 evaluates this tool' WHERE post_id = 2")
        database.commit()
        database.close()
        copied = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(copied["checks"]["dynamicPostNovelty"])
        self.assertFalse(copied["checks"]["dynamicPostPersonaIdentity"])
        self.assertEqual(copied["duplicateDynamicPostIds"], [2])
        self.assertEqual(copied["dynamicIdentityErrors"][0]["assignedPersona"], "P00002")
        self.assertFalse(copied["technicalEvidencePassed"])

        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.execute("UPDATE post SET quote_content = 'P00001 asks a different question' WHERE post_id = 2")
        database.commit()
        database.close()
        wrong_persona = AUDITOR.audit(self.simulation, self.cohort)
        self.assertTrue(wrong_persona["checks"]["dynamicPostNovelty"])
        self.assertFalse(wrong_persona["checks"]["dynamicPostPersonaIdentity"])

    def test_quote_review_uses_generated_commentary_not_copied_source(self):
        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.execute(
            "UPDATE post SET content = 'P00001 evaluates this tool', quote_content = 'A skeptical response', original_post_id = 1 WHERE post_id = 2"
        )
        database.commit()
        database.close()
        review_path = self.simulation / "buyer_review.json"
        review = json.loads(review_path.read_text(encoding="utf-8"))
        review["posts"][0]["quotedPostId"] = 1
        review["posts"][0]["quotedContent"] = "P00001 evaluates this tool"
        review["posts"][0]["quotedContentSha256"] = hashlib.sha256(b"P00001 evaluates this tool").hexdigest()
        self._write("buyer_review.json", review)
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertTrue(result["pilotEvidencePassed"])
        self.assertEqual(result["duplicateDynamicPostIds"], [])

        review["posts"][0]["quotedContentSha256"] = "0" * 64
        self._write("buyer_review.json", review)
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerContentReview"])

        review["posts"][0]["quotedContentSha256"] = hashlib.sha256(b"P00001 evaluates this tool").hexdigest()
        review["posts"][0]["quotedContent"] = "Edited quoted context"
        self._write("buyer_review.json", review)
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerContentReview"])

    def test_self_quotes_do_not_count_as_buyer_interaction(self):
        database = sqlite3.connect(self.simulation / "twitter_simulation.db")
        database.executescript(
            "INSERT INTO user VALUES (3,1);"
            "INSERT INTO post(post_id,user_id,content,created_at) VALUES (3,3,'P00002 first post',0);"
            "UPDATE post SET content='P00002 first post', original_post_id=3 WHERE post_id=2;"
        )
        database.commit()
        database.close()
        result = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(result["checks"]["crossBuyerInteraction"])
        self.assertEqual(result["selfQuotePostIds"], [2])
        self.assertEqual(result["missingBuyerInteractions"], ["P00002"])

    def test_partial_content_review_counts_only_approved_posts(self):
        posts = [
            AUDITOR.Post(2, 1, "First response", 1, None, None),
            AUDITOR.Post(3, 1, "Second response", 1, None, None),
        ]
        self._write("buyer_review.json", {
            "schemaVersion": 2, "simulationId": "sim_test", "reviewer": "pilot-reviewer",
            "reviewedAt": "2026-10-10T14:39:17Z",
            "posts": [
                {
                    "postId": post.post_id, "agentId": post.agent_id, "content": post.content,
                    "contentSha256": hashlib.sha256(post.content.encode()).hexdigest(),
                    "scenarioRelevant": True, "roleFaithful": index == 0,
                    "scopeSafe": True, "actionable": True,
                }
                for index, post in enumerate(posts)
            ],
        })
        self.assertEqual(AUDITOR.review_covers_dynamic_posts(self.simulation, posts), (False, 1))

    def test_unrestricted_review_or_unscheduled_activity_does_not_pass(self):
        path = self.simulation / "buyer_review.json"
        path.chmod(0o644)
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerContentReview"])
        path.chmod(0o600)
        self.assertTrue(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerContentReview"])
        self.config["agent_configs"][1].update({"activity_level": 0, "active_hours": []})
        self._write("simulation_config.json", self.config)
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerActivity"])

    def test_missing_or_stale_content_review_blocks_pilot_acceptance(self):
        (self.simulation / "buyer_review.json").unlink()
        missing = AUDITOR.audit(self.simulation, self.cohort)
        self.assertTrue(missing["technicalEvidencePassed"])
        self.assertFalse(missing["checks"]["buyerContentReview"])
        self.assertFalse(missing["pilotEvidencePassed"])

        review = {
            "schemaVersion": 2, "simulationId": "sim_test", "reviewer": "pilot-reviewer",
            "reviewedAt": "2026-10-07T12:00:00Z",
            "posts": [{"postId": 2, "agentId": 1, "content": "A skeptical response", "contentSha256": "0" * 64,
                       "scenarioRelevant": True, "roleFaithful": True, "scopeSafe": True, "actionable": True}],
        }
        self._write("buyer_review.json", review)
        stale = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(stale["pilotEvidencePassed"])
        self.assertEqual(stale["reviewedDynamicPosts"], 0)

        review["posts"][0]["contentSha256"] = hashlib.sha256(b"A skeptical response").hexdigest()
        review["posts"][0]["scenarioRelevant"] = False
        self._write("buyer_review.json", review)
        irrelevant = AUDITOR.audit(self.simulation, self.cohort)
        self.assertFalse(irrelevant["checks"]["buyerContentReview"])
        self.assertFalse(irrelevant["pilotEvidencePassed"])

        review["posts"][0]["scenarioRelevant"] = True
        review["posts"][0]["content"] = "Edited after review"
        self._write("buyer_review.json", review)
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerContentReview"])

    def test_review_template_is_private_and_fails_closed(self):
        path = self.simulation / "buyer_review.json"
        path.unlink()
        created = AUDITOR.prepare_review_template(self.simulation)
        self.assertEqual(created, path)
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
        review = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(review["posts"][0]["content"], "A skeptical response")
        self.assertEqual(review["posts"][0]["quotedContent"], "P00001 evaluates this tool")
        self.assertFalse(review["posts"][0]["scenarioRelevant"])
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["pilotEvidencePassed"])
        with self.assertRaises(FileExistsError):
            AUDITOR.prepare_review_template(self.simulation)
        path.chmod(0o644)
        self.assertFalse(AUDITOR.audit(self.simulation, self.cohort)["checks"]["buyerContentReview"])

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
        database.executescript("INSERT INTO user VALUES (3,99); INSERT INTO post(post_id,user_id,content,created_at) VALUES (3,3,'Other post',1);")
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
