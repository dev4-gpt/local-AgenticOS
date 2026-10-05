"""Replace generated MiroFish buyer biographies with canonical synthetic scenarios."""

import argparse
import csv
import hashlib
import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIELDS = ["user_id", "name", "username", "user_char", "description"]


def frame_for_seed(seed: str) -> list[dict]:
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "generate-buyer-persona-frame.mjs"), "--pilot", f"--seed={seed}"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def review_profiles(rows: list[dict], cohort: dict, frame: list[dict], product_brief: str) -> list[dict]:
    if not isinstance(product_brief, str) or not product_brief.strip() or len(product_brief.encode("utf-8")) > 16000:
        raise ValueError("product_brief_invalid")
    personas = cohort.get("personas")
    if not isinstance(personas, list) or not personas:
        raise ValueError("cohort_invalid")
    frame_by_id = {item["id"]: item for item in frame}
    source_by_id = {row.get("name"): row for row in rows}
    requested = {item.get("id") for item in personas}
    if len(requested) != len(personas) or len(source_by_id) != len(rows) or set(source_by_id) != requested:
        raise ValueError("profile_identity_mismatch")
    if len({row.get("user_id") for row in rows}) != len(rows):
        raise ValueError("profile_agent_id_duplicate")
    workflows = {}
    for item in personas:
        workflow = item.get("firstWorkflow")
        if item["id"] not in frame_by_id or not isinstance(workflow, str) or not workflow.strip() or len(workflow) > 160:
            raise ValueError("profile_scenario_invalid")
        workflows[item["id"]] = workflow.strip()
    reviewed = []
    for row in rows:
        if set(row) != set(FIELDS) or not str(row["user_id"]).isdigit() or not row["username"]:
            raise ValueError("profile_columns_invalid")
        buyer = frame_by_id[row["name"]]
        workflow = workflows[row["name"]]
        organization = "working solo" if buyer["orgSize"] == "solo" else f'at an organization with {buyer["orgSize"]} people'
        summary = (
            f'{buyer["id"]} is a fictional {buyer["posture"]} in {buyer["field"]}, {organization}, '
            f'in {buyer["region"]}. AI literacy: {buyer["aiLiteracy"]}. '
            f'Monthly budget: {buyer["monthlyBudget"]}. Privacy posture: {buyer["privacy"]}. '
            f'First workflow to assess: {workflow}. Evaluate AgentOS for this workflow specifically; '
            "ask for evidence and reject it when privacy, setup effort, cost, or controls are inadequate. "
            "Do not invent age, gender, nationality, clinical outcomes, or regulated advice."
            f"\n\nAgentOS evaluation context:\n{product_brief.strip()}\n\n"
            "When participating, evaluate AgentOS against your own first workflow and constraints. "
            "Explain what evidence supports your reaction and what you would still need to see. "
            "You may accept, defer, or reject a scoped pilot. You have not used the product yourself."
        )
        reviewed.append({
            "user_id": row["user_id"], "name": row["name"], "username": row["username"],
            "user_char": summary,
            "description": f'{buyer["id"]}: {buyer["posture"]} in {buyer["field"]}. First workflow to assess: {workflow}.',
        })
    return reviewed


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cohort = json.loads(args.cohort.read_text(encoding="utf-8"))
    with args.source.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    product_brief_path = ROOT / "docs" / "mirofish-buyer-pilot-seed.md"
    reviewed = review_profiles(rows, cohort, frame_for_seed(cohort["frameSeed"]), product_brief_path.read_text(encoding="utf-8"))
    manifest_path = args.output.with_name(args.output.name + ".manifest.json")
    if args.output.exists() or manifest_path.exists():
        raise FileExistsError("reviewed_profile_output_exists")
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(reviewed)
    manifest = {
        "schemaVersion": 2, "preparation": "canonical-buyer-scenarios-v2", "file": args.output.name,
        "sourceSha256": digest(args.source), "reviewedSha256": digest(args.output),
        "cohortSha256": digest(args.cohort), "profileCount": len(reviewed), "providerCalls": 0,
        "productBriefSha256": digest(product_brief_path),
    }
    descriptor = os.open(manifest_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps({"manifest": str(manifest_path), **manifest}, sort_keys=True))


if __name__ == "__main__":
    main()
