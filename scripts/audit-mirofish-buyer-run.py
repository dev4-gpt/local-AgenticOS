"""Audit an isolated MiroFish buyer run without provider calls or source text output."""

import argparse
import csv
import hashlib
import json
import os
import re
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path


PERSONA_ID = re.compile(r"\bP\d{5}\b")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalized_words(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def action_log_entries(simulation_dir: Path) -> tuple[list[dict], list[dict]]:
    actions = []
    events = []
    for path in (simulation_dir / "twitter" / "actions.jsonl", simulation_dir / "actions.jsonl"):
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                entry = json.loads(line)
                if entry.get("action_type"):
                    actions.append(entry)
                elif entry.get("event_type"):
                    events.append(entry)
    return actions, events


def read_posts(simulation_dir: Path) -> list[tuple]:
    database = sqlite3.connect(f"file:{(simulation_dir / 'twitter_simulation.db').resolve()}?mode=ro", uri=True)
    try:
        return database.execute(
            "SELECT p.post_id, u.agent_id, p.content, p.created_at "
            "FROM post AS p JOIN user AS u ON u.user_id = p.user_id ORDER BY p.post_id"
        ).fetchall()
    finally:
        database.close()


def prepare_review_template(simulation_dir: Path) -> Path:
    posts = [post for post in read_posts(simulation_dir) if str(post[3]) != "0"]
    if not posts:
        raise ValueError("buyer_review_no_dynamic_posts")
    template = {
        "schemaVersion": 1, "simulationId": simulation_dir.name,
        "reviewer": "", "reviewedAt": "",
        "posts": [{
            "postId": post_id, "agentId": agent_id, "content": content,
            "contentSha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
            "scenarioRelevant": False, "roleFaithful": False, "scopeSafe": False, "actionable": False,
        } for post_id, agent_id, content, _ in posts],
    }
    path = simulation_dir / "buyer_review.json"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(template, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return path


def review_covers_dynamic_posts(simulation_dir: Path, posts: list[tuple]) -> tuple[bool, int]:
    path = simulation_dir / "buyer_review.json"
    if not path.exists():
        return False, 0
    try:
        if path.stat().st_mode & 0o077:
            return False, 0
        review = load_json(path)
        reviewed_at = datetime.fromisoformat(review["reviewedAt"].replace("Z", "+00:00"))
        if (review.get("schemaVersion") != 1 or review.get("simulationId") != simulation_dir.name
                or not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip()
                or reviewed_at.tzinfo is None or reviewed_at.utcoffset() is None):
            return False, 0
        expected = {
            (post_id, agent_id, hashlib.sha256(content.encode("utf-8")).hexdigest()): content
            for post_id, agent_id, content, created_at in posts if str(created_at) != "0"
        }
        entries = review.get("posts")
        if not expected or not isinstance(entries, list) or len(entries) != len(expected):
            return False, 0
        reviewed = set()
        for entry in entries:
            identity = (entry.get("postId"), entry.get("agentId"), entry.get("contentSha256"))
            if (identity not in expected or identity in reviewed or entry.get("content") != expected[identity]
                    or any(entry.get(key) is not True for key in ("scenarioRelevant", "roleFaithful", "scopeSafe", "actionable"))):
                return False, len(reviewed)
            reviewed.add(identity)
        return reviewed == set(expected), len(reviewed)
    except (AttributeError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False, 0


def audit(simulation_dir: Path, cohort_path: Path) -> dict:
    cohort = load_json(cohort_path)
    expected_ids = {item["id"] for item in cohort["personas"]}
    if len(expected_ids) != len(cohort["personas"]):
        raise ValueError("cohort contains duplicate persona IDs")
    if any(not isinstance(item.get("firstWorkflow"), str) or not item["firstWorkflow"].strip() for item in cohort["personas"]):
        raise ValueError("cohort must specify each buyer's first workflow")

    config = load_json(simulation_dir / "simulation_config.json")
    run_state = load_json(simulation_dir / "run_state.json")
    with (simulation_dir / "twitter_profiles.csv").open(encoding="utf-8", newline="") as handle:
        profiles = list(csv.DictReader(handle))

    profile_by_agent = {}
    profile_by_name = {}
    for profile in profiles:
        agent_id = int(profile["user_id"])
        if agent_id in profile_by_agent:
            raise ValueError("profiles contain duplicate agent IDs")
        profile_by_agent[agent_id] = profile["name"]
        if profile["name"] in profile_by_name:
            raise ValueError("profiles contain duplicate persona IDs")
        profile_by_name[profile["name"]] = profile

    configured_by_agent = {
        index: agent.get("entity_name")
        for index, agent in enumerate(config.get("agent_configs", []))
    }
    profile_ids = set(profile_by_agent.values())
    configured_ids = set(configured_by_agent.values())
    missing_workflow_profiles = sorted(
        item["id"] for item in cohort["personas"]
        if normalized_words(item["firstWorkflow"])
        not in normalized_words(" ".join((profile_by_name.get(item["id"]) or {}).get(key, "") for key in ("user_char", "description")))
    )

    posts = read_posts(simulation_dir)

    initial_specs = config.get("event_config", {}).get("initial_posts", [])
    actual_initial = {(agent_id, content) for _, agent_id, content, created_at in posts if str(created_at) == "0"}
    attribution_errors = []
    missing_initial_posts = []
    for spec in initial_specs:
        agent_id = int(spec["poster_agent_id"])
        text = spec["content"]
        mentioned_ids = sorted(set(PERSONA_ID.findall(text)))
        assigned_id = profile_by_agent.get(agent_id)
        if mentioned_ids and mentioned_ids != [assigned_id]:
            attribution_errors.append({
                "agentId": agent_id,
                "assignedPersona": assigned_id,
                "mentionedPersonas": mentioned_ids,
            })
        if (agent_id, text) not in actual_initial:
            missing_initial_posts.append(agent_id)

    unknown_post_agents = sorted({agent_id for _, agent_id, _, _ in posts if agent_id not in profile_by_agent})
    dynamic_post_ids = [profile_by_agent.get(agent_id, "<unknown-agent>") for _, agent_id, _, created_at in posts if str(created_at) != "0"]
    post_counts = Counter(dynamic_post_ids)
    content_review_passed, reviewed_dynamic_posts = review_covers_dynamic_posts(simulation_dir, posts)
    active_buyers = {
        agent.get("entity_name")
        for agent in config.get("agent_configs", [])
        if agent.get("activity_level", 0) > 0 and agent.get("active_hours")
    }
    actions, events = action_log_entries(simulation_dir)
    action_rows = len(actions)
    committed_posts = Counter((post_id, agent_id, content) for post_id, agent_id, content, _ in posts)
    traced_posts = Counter(
        (action.get("post_id"), action.get("agent_id"), (action.get("action_args") or {}).get("content"))
        for action in actions if action.get("action_type") == "CREATE_POST"
    )
    completion_events = [event for event in events if event.get("event_type") == "simulation_end"]
    log_text = (simulation_dir / "simulation.log").read_text(encoding="utf-8") if (simulation_dir / "simulation.log").exists() else ""
    loop_completed = "模拟循环完成" in log_text
    status = run_state.get("runner_status")
    reported_actions = run_state.get("twitter_actions_count", 0)
    total_rounds = run_state.get("total_rounds")

    checks = {
        "runIdentity": config.get("simulation_id") == simulation_dir.name == run_state.get("simulation_id"),
        "personaCoverage": profile_ids == expected_ids and configured_ids == expected_ids and len(profiles) == len(expected_ids),
        "profileWorkflowCoverage": not missing_workflow_profiles,
        "profileAgentMapping": all(profile_by_agent.get(key) == value for key, value in configured_by_agent.items()),
        "postAgentMapping": not unknown_post_agents,
        "initialPostAttribution": not attribution_errors and not missing_initial_posts,
        "actionTelemetry": committed_posts == traced_posts and action_rows == reported_actions,
        "completionTelemetry": status == "completed" and type(total_rounds) is int and total_rounds > 0
        and run_state.get("current_round") == total_rounds
        and run_state.get("twitter_completed") is True and len(completion_events) == 1
        and completion_events[0].get("total_rounds") == total_rounds
        and completion_events[0].get("total_actions") == action_rows,
        "buyerActivity": bool(active_buyers) and all(post_counts.get(buyer, 0) > 0 for buyer in active_buyers),
        "buyerContentReview": content_review_passed,
    }
    return {
        "simulationId": config.get("simulation_id"),
        "expectedPersonas": len(expected_ids),
        "generatedProfiles": len(profiles),
        "configuredAgents": len(configured_by_agent),
        "missingPersonas": sorted(expected_ids - profile_ids),
        "unexpectedPersonas": sorted(profile_ids - expected_ids),
        "missingWorkflowProfiles": missing_workflow_profiles,
        "initialPosts": len(actual_initial),
        "dynamicPosts": sum(post_counts.values()),
        "reviewedDynamicPosts": reviewed_dynamic_posts,
        "dynamicPostPersonas": dict(sorted(post_counts.items())),
        "scheduledBuyers": sorted(active_buyers),
        "attributionErrors": attribution_errors,
        "missingInitialPostAgents": missing_initial_posts,
        "unknownPostAgents": unknown_post_agents,
        "actionLogRows": action_rows,
        "tracedPosts": sum(traced_posts.values()),
        "completionEvents": len(completion_events),
        "reportedTwitterActions": reported_actions,
        "loopCompletedInLog": loop_completed,
        "runnerStatus": status,
        "reportedRound": run_state.get("current_round"),
        "configuredRounds": run_state.get("total_rounds"),
        "checks": checks,
        "technicalEvidencePassed": all(value for key, value in checks.items() if key != "buyerContentReview"),
        "pilotEvidencePassed": all(checks.values()),
        "marketValidation": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulation-dir", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--prepare-review", action="store_true")
    args = parser.parse_args()
    result = audit(args.simulation_dir, args.cohort)
    if args.prepare_review:
        if not result["technicalEvidencePassed"]:
            raise SystemExit("technical_evidence_failed")
        try:
            path = prepare_review_template(args.simulation_dir)
        except FileExistsError:
            raise SystemExit("buyer_review_already_exists")
        print(json.dumps({"reviewTemplate": str(path), "dynamicPosts": result["dynamicPosts"]}, sort_keys=True))
        return
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["pilotEvidencePassed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
