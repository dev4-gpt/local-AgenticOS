"""Audit an isolated MiroFish buyer run without provider calls or source text output."""

import argparse
import csv
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path


PERSONA_ID = re.compile(r"\bP\d{5}\b")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def action_log_count(simulation_dir: Path) -> int:
    count = 0
    for path in (simulation_dir / "twitter" / "actions.jsonl", simulation_dir / "actions.jsonl"):
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip() and json.loads(line).get("action_type"):
                    count += 1
    return count


def audit(simulation_dir: Path, cohort_path: Path) -> dict:
    cohort = load_json(cohort_path)
    expected_ids = {item["id"] for item in cohort["personas"]}
    if len(expected_ids) != len(cohort["personas"]):
        raise ValueError("cohort contains duplicate persona IDs")

    config = load_json(simulation_dir / "simulation_config.json")
    run_state = load_json(simulation_dir / "run_state.json")
    with (simulation_dir / "twitter_profiles.csv").open(encoding="utf-8", newline="") as handle:
        profiles = list(csv.DictReader(handle))

    profile_by_agent = {}
    for profile in profiles:
        agent_id = int(profile["user_id"])
        if agent_id in profile_by_agent:
            raise ValueError("profiles contain duplicate agent IDs")
        profile_by_agent[agent_id] = profile["name"]

    configured_by_agent = {
        index: agent.get("entity_name")
        for index, agent in enumerate(config.get("agent_configs", []))
    }
    profile_ids = set(profile_by_agent.values())
    configured_ids = set(configured_by_agent.values())

    database = sqlite3.connect(f"file:{(simulation_dir / 'twitter_simulation.db').resolve()}?mode=ro", uri=True)
    try:
        posts = database.execute(
            "SELECT p.post_id, u.agent_id, p.content, p.created_at "
            "FROM post AS p JOIN user AS u ON u.user_id = p.user_id ORDER BY p.post_id"
        ).fetchall()
    finally:
        database.close()

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
    action_rows = action_log_count(simulation_dir)
    log_text = (simulation_dir / "simulation.log").read_text(encoding="utf-8") if (simulation_dir / "simulation.log").exists() else ""
    loop_completed = "模拟循环完成" in log_text
    status = run_state.get("runner_status")
    reported_actions = run_state.get("twitter_actions_count", 0)

    checks = {
        "personaCoverage": profile_ids == expected_ids and configured_ids == expected_ids and len(profiles) == len(expected_ids),
        "profileAgentMapping": all(profile_by_agent.get(key) == value for key, value in configured_by_agent.items()),
        "postAgentMapping": not unknown_post_agents,
        "initialPostAttribution": not attribution_errors and not missing_initial_posts,
        "actionTelemetry": action_rows >= len(posts) and reported_actions >= len(posts),
        "completionTelemetry": not loop_completed or (status == "completed" and run_state.get("current_round") == run_state.get("total_rounds")),
    }
    return {
        "simulationId": config.get("simulation_id"),
        "expectedPersonas": len(expected_ids),
        "generatedProfiles": len(profiles),
        "configuredAgents": len(configured_by_agent),
        "missingPersonas": sorted(expected_ids - profile_ids),
        "unexpectedPersonas": sorted(profile_ids - expected_ids),
        "initialPosts": len(actual_initial),
        "dynamicPosts": sum(post_counts.values()),
        "dynamicPostPersonas": dict(sorted(post_counts.items())),
        "attributionErrors": attribution_errors,
        "missingInitialPostAgents": missing_initial_posts,
        "unknownPostAgents": unknown_post_agents,
        "actionLogRows": action_rows,
        "reportedTwitterActions": reported_actions,
        "loopCompletedInLog": loop_completed,
        "runnerStatus": status,
        "reportedRound": run_state.get("current_round"),
        "configuredRounds": run_state.get("total_rounds"),
        "checks": checks,
        "pilotEvidencePassed": all(checks.values()),
        "marketValidation": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulation-dir", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.simulation_dir, args.cohort)
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["pilotEvidencePassed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
