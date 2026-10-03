"""Prepare a pinned MiroFish project without LLM or Zep calls."""

import argparse
import hashlib
import json
import subprocess
import sys
from io import BytesIO
from pathlib import Path


PINNED_COMMIT = "39d849138ef254f6c737ab4c4705e5545dbe31d4"
DEFAULT_ROOT = Path("/private/tmp/agentos-mirofish-pilot-restored")
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SEED = REPO_ROOT / "tmp/mirofish-buyer-seed-10.md"
DEFAULT_ONTOLOGY = REPO_ROOT / "evaluations/mirofish-buyer-ontology-v1.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mirofish-root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--seed", type=Path, default=DEFAULT_SEED)
    parser.add_argument("--ontology", type=Path, default=DEFAULT_ONTOLOGY)
    parser.add_argument("--create", action="store_true", help="Persist the project in the isolated MiroFish checkout")
    args = parser.parse_args()

    root = args.mirofish_root.resolve()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if commit != PINNED_COMMIT:
        raise SystemExit(f"MiroFish commit mismatch: expected {PINNED_COMMIT}, got {commit}")
    seed = args.seed.read_bytes()
    if not seed or len(seed) > 100_000:
        raise SystemExit("Seed must be nonempty and at most 100 KB")
    seed_text = seed.decode("utf-8")
    ontology = json.loads(args.ontology.read_text(encoding="utf-8"))
    if seed_text.count("## Fictional buyer P") != 10:
        raise SystemExit("Seed must contain ten fictional buyer profiles")

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
        "seedSha256": hashlib.sha256(seed).hexdigest(),
        "ontologySha256": hashlib.sha256(args.ontology.read_bytes()).hexdigest(),
        "entityTypes": len(entities),
        "edgeTypes": len(edges),
        "networkCalls": 0,
        "created": False,
    }
    if args.create:
        project = ProjectManager.create_project(name="AgentOS synthetic buyer micro-pilot")
        stored = ProjectManager.save_file_to_project(
            project.project_id,
            FileStorage(stream=BytesIO(seed), filename=args.seed.name),
            args.seed.name,
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
