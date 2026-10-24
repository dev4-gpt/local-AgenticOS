"""Check a synthetic MiroFish graph against the versioned buyer micro-cohort."""

import argparse
import json
import os
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = Path("/private/tmp/agentos-mirofish-pilot-restored")
DEFAULT_ENV = Path("/private/tmp/agentos-mirofish-pilot/.env")


def expected_buyers() -> dict[str, dict]:
    fixture = json.loads((REPO_ROOT / "evaluations/mirofish-buyer-micro-v1.json").read_text())
    selected = {persona["id"]: persona for persona in fixture["personas"]}
    frame = {
        persona["id"]: persona
        for persona in (
            json.loads(line)
            for line in (REPO_ROOT / "tmp/mirofish-buyer-pilot-50.jsonl").read_text().splitlines()
        )
    }
    return {persona_id: {**frame[persona_id], **persona} for persona_id, persona in selected.items()}


def audit(data: dict, expected: dict[str, dict]) -> dict:
    buyers = [node for node in data.get("nodes", []) if "Buyer" in (node.get("labels") or [])]
    by_name: dict[str, list[dict]] = {}
    for node in buyers:
        by_name.setdefault(node.get("name", ""), []).append(node)

    mismatches = []
    for persona_id, profile in sorted(expected.items()):
        matches = by_name.get(persona_id, [])
        if len(matches) != 1:
            mismatches.append({"personaId": persona_id, "field": "node_count"})
            continue
        attributes = matches[0].get("attributes") or {}
        fields = {
            "persona_id": persona_id,
            "decision_role": profile["posture"],
            "ai_literacy": profile["aiLiteracy"],
            "monthly_budget": profile["monthlyBudget"],
            "privacy_posture": profile["privacy"],
            "first_workflow": profile["firstWorkflow"],
        }
        for field, value in fields.items():
            if attributes.get(field) != value:
                mismatches.append({"personaId": persona_id, "field": field})

    unexpected = sorted(set(by_name) - set(expected))
    if unexpected:
        mismatches.extend({"personaId": persona_id, "field": "unexpected_node"} for persona_id in unexpected)
    return {
        "graphId": data.get("graph_id"),
        "buyerNodes": len(buyers),
        "expectedBuyers": len(expected),
        "nodeCount": data.get("node_count"),
        "edgeCount": data.get("edge_count"),
        "mismatches": mismatches,
        "readyForProfiles": len(buyers) == len(expected) and not mismatches,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph-id", required=True)
    parser.add_argument("--mirofish-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    args = parser.parse_args()
    if not re.fullmatch(r"mirofish_[0-9a-f]{16}", args.graph_id):
        raise SystemExit("Invalid pilot graph ID")

    from dotenv import load_dotenv

    load_dotenv(args.env_file, override=True)
    if not os.environ.get("ZEP_API_KEY"):
        raise SystemExit("ZEP_API_KEY missing from private pilot environment")
    sys.path.insert(0, str(args.mirofish_root.resolve() / "backend"))
    from app.services.graph_builder import GraphBuilderService

    data = GraphBuilderService(api_key=os.environ["ZEP_API_KEY"]).get_graph_data(args.graph_id)
    receipt = audit(data, expected_buyers())
    print(json.dumps(receipt, sort_keys=True))
    if not receipt["readyForProfiles"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
