"""Limit an isolated MiroFish simulation to two buyers in one active round."""

import argparse
import json
import re
from pathlib import Path


SELECTED = {"P00603", "P04949"}
PERSONA_ID = re.compile(r"\bP\d{5}\b")


def validate_initial_post_attribution(config: dict) -> None:
    agents = config.get("agent_configs") or []
    for post in config.get("event_config", {}).get("initial_posts", []):
        agent_id = post.get("poster_agent_id")
        if not isinstance(agent_id, int) or not 0 <= agent_id < len(agents):
            raise ValueError("Initial post has an unknown poster_agent_id")
        assigned = agents[agent_id].get("entity_name")
        mentioned = set(PERSONA_ID.findall(post.get("content", "")))
        if mentioned != {assigned}:
            raise ValueError(
                f"Initial post attribution mismatch: agent {agent_id} is {assigned}, text names {sorted(mentioned)}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--apply", action="store_true", help="Save a backup and apply the bounded schedule")
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8"))
    agents = config.get("agent_configs") or []
    names = {agent.get("entity_name") for agent in agents}
    if len(agents) != 10 or len(names) != 10 or None in names:
        raise SystemExit("Expected ten named agent configurations")
    if not SELECTED.issubset(names) or config.get("reddit_config") is not None:
        raise SystemExit("Selected buyers missing or Reddit is enabled")
    try:
        validate_initial_post_attribution(config)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    time_config = config["time_config"]
    time_config.update({
        "total_simulation_hours": 10,
        "minutes_per_round": 60,
        "agents_per_hour_min": 2,
        "agents_per_hour_max": 2,
        "peak_hours": [9],
        "peak_activity_multiplier": 1.0,
        "off_peak_hours": [],
    })
    for agent in agents:
        selected = agent["entity_name"] in SELECTED
        agent["active_hours"] = [9] if selected else []
        agent["activity_level"] = 1.0 if selected else 0.0
    config["wait_for_commands"] = False
    config["generation_reasoning"] += " | Manual two-buyer 09:00 smoke schedule; no market inference."

    receipt = {
        "simulationId": config["simulation_id"],
        "selectedBuyers": sorted(SELECTED),
        "activeRound": 10,
        "configuredAgents": len(agents),
        "waitForCommands": False,
        "applied": False,
    }
    if args.apply:
        backup = args.config.with_name("simulation_config.pre-smoke.json")
        if backup.exists():
            raise SystemExit(f"Backup already exists: {backup}")
        backup.write_bytes(args.config.read_bytes())
        args.config.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        receipt["applied"] = True
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
