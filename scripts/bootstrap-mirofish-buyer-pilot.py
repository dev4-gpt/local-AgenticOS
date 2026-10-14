"""Prepare a pinned MiroFish project without LLM or Zep calls."""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from io import BytesIO
from pathlib import Path


PINNED_COMMIT = "67e284ce7244258c054a1ee9db9b8107c5a38b3e"
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = REPO_ROOT.parents[1] / "MiroFish-Buyer-Pilot"
DEFAULT_SEED = REPO_ROOT / "tmp/mirofish-buyer-seed-10.md"
DEFAULT_FOCUSED_SEED = REPO_ROOT / "tmp/mirofish-buyer-seed-focused-v2.md"
DEFAULT_ONTOLOGY = REPO_ROOT / "evaluations/mirofish-buyer-ontology-v1.json"


def validate_seed_cohort(seed_text: str, cohort: dict, focused_v2: bool) -> list[str]:
    expected_heading = "# Synthetic focused cohort" if focused_v2 else "# Synthetic micro-cohort for the first pilot"
    personas = cohort.get("personas")
    expected_ids = [item.get("id") for item in personas] if isinstance(personas, list) else []
    found_ids = re.findall(r"^## Fictional buyer (P\d{5})$", seed_text, re.MULTILINE)
    if (not isinstance(cohort.get("cohort"), str)
            or expected_heading not in seed_text
            or len(expected_ids) != 10
            or len(set(expected_ids)) != 10
            or len(found_ids) != 10
            or set(found_ids) != set(expected_ids)):
        raise ValueError("seed_cohort_mismatch")
    return expected_ids


def select_seed_path(explicit_seed: Path | None, focused_v2: bool) -> Path:
    if explicit_seed is not None:
        return explicit_seed
    return DEFAULT_FOCUSED_SEED if focused_v2 else DEFAULT_SEED


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mirofish-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--ontology", type=Path, default=DEFAULT_ONTOLOGY)
    parser.add_argument("--focused-v2", action="store_true", help="Use the focused consultancy cohort v2")
    parser.add_argument("--create", action="store_true", help="Persist the project in the selected local MiroFish checkout")
    args = parser.parse_args()

    root = args.mirofish_root.resolve()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if commit != PINNED_COMMIT:
        raise SystemExit(f"MiroFish commit mismatch: expected {PINNED_COMMIT}, got {commit}")
    seed_path = select_seed_path(args.seed, args.focused_v2)
    cohort_path = REPO_ROOT / (
        "evaluations/mirofish-buyer-micro-v2.json" if args.focused_v2
        else "evaluations/mirofish-buyer-micro-v1.json"
    )
    cohort = json.loads(cohort_path.read_text(encoding="utf-8"))
    seed = seed_path.read_bytes()
    if not seed or len(seed) > 100_000:
        raise SystemExit("Seed must be nonempty and at most 100 KB")
    seed_text = seed.decode("utf-8")
    try:
        validate_seed_cohort(seed_text, cohort, args.focused_v2)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    ontology_bytes = args.ontology.read_bytes()
    ontology = json.loads(ontology_bytes)

    sys.path.insert(0, str(root / "backend"))
    from app.models.project import ProjectManager, ProjectStatus
    from app.services.ontology_generator import OntologyGenerator
    from werkzeug.datastructures import FileStorage

    normalized = OntologyGenerator.__new__(OntologyGenerator)._validate_and_process(ontology)
    entities = normalized["entity_types"]
    edges = normalized["edge_types"]
    names = {entity["name"] for entity in entities}
    if len(entities) != 3 or len(names) != 3 or len(edges) != 4:
        raise SystemExit("Ontology must retain three entity types and four relationships")
    if len(entities) > 5 or len(edges) > 5:
        raise SystemExit("Ontology exceeds Zep Free custom-type limits")
    if "Buyer" not in names:
        raise SystemExit("Ontology must retain the Buyer type")
    if {"Person", "Organization"} != {entity["name"] for entity in entities[-2:]}:
        raise SystemExit("Fallback entity types must be last")
    if any(not edge["source_targets"] for edge in edges):
        raise SystemExit("Every relationship needs valid source and target types")

    receipt = {
        "upstreamCommit": commit,
        "cohort": cohort["cohort"],
        "seedSha256": hashlib.sha256(seed).hexdigest(),
        "ontologySha256": hashlib.sha256(ontology_bytes).hexdigest(),
        "entityTypes": len(entities),
        "edgeTypes": len(edges),
        "networkCalls": 0,
        "created": False,
    }
    if args.create:
        project_name = (
            "AgentOS focused synthetic buyer micro-pilot"
            if args.focused_v2 else "AgentOS synthetic buyer micro-pilot"
        )
        project = ProjectManager.create_project(name=project_name)
        stored = ProjectManager.save_file_to_project(
            project.project_id,
            FileStorage(stream=BytesIO(seed), filename=seed_path.name),
            seed_path.name,
        )
        ProjectManager.save_extracted_text(project.project_id, seed_text)
        project.files = [{"filename": stored["original_filename"], "size": stored["size"]}]
        project.total_text_length = len(seed_text)
        project.simulation_requirement = (
            "Evaluate AgentOS with the ten fictional buyer profiles in the seed. "
            "Preserve their AI-literacy, field, budget, and privacy differences; allow nonbuyers. "
            "Do not invent production proof, customer data, or regulated advice."
        )
        project.ontology = {"entity_types": entities, "edge_types": edges}
        project.analysis_summary = normalized["analysis_summary"]
        project.status = ProjectStatus.ONTOLOGY_GENERATED
        ProjectManager.save_project(project)
        receipt["projectId"] = project.project_id
        receipt["created"] = True
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
