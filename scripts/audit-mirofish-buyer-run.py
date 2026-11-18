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
from decimal import Decimal
from pathlib import Path
from typing import NamedTuple


PERSONA_ID = re.compile(r"\bP\d{5}\b")
MONEY_AMOUNT = re.compile(r"(?<![\w.])\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)([kKmM])?(?:\+)?")


class Post(NamedTuple):
    post_id: int
    agent_id: int
    content: str
    created_at: str
    quote_content: str | None
    original_post_id: int | None
    original_post_agent_id: int | None = None


def generated_text(post: Post) -> str:
    return post.quote_content or post.content


def money_amounts(text: str) -> set[Decimal]:
    amounts = set()
    for raw_amount, scale in MONEY_AMOUNT.findall(text):
        amount = Decimal(raw_amount.replace(",", ""))
        if scale:
            amount *= Decimal("1000") if scale.lower() == "k" else Decimal("1000000")
        amounts.add(amount.normalize())
    return amounts


def is_dynamic(post: Post) -> bool:
    return str(post.created_at) != "0"


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


def read_posts(simulation_dir: Path) -> list[Post]:
    database = sqlite3.connect(f"file:{(simulation_dir / 'twitter_simulation.db').resolve()}?mode=ro", uri=True)
    try:
        return [Post(*row) for row in database.execute(
            "SELECT p.post_id, u.agent_id, p.content, p.created_at, p.quote_content, p.original_post_id "
            ", original_user.agent_id "
            "FROM post AS p JOIN user AS u ON u.user_id = p.user_id "
            "LEFT JOIN post AS original_post ON original_post.post_id = p.original_post_id "
            "LEFT JOIN user AS original_user ON original_user.user_id = original_post.user_id "
            "ORDER BY p.post_id"
        ).fetchall()]
    finally:
        database.close()


def review_file_path(simulation_dir: Path, review_file: Path | None = None) -> Path:
    path = review_file or Path("buyer_review.json")
    if not path.is_absolute():
        path = simulation_dir / path
    path = path.resolve()
    if path.parent != simulation_dir.resolve():
        raise ValueError("buyer_review_path_must_be_in_simulation_dir")
    return path


def prepare_review_template(simulation_dir: Path, review_file: Path | None = None) -> Path:
    posts = [post for post in read_posts(simulation_dir) if is_dynamic(post)]
    if not posts:
        raise ValueError("buyer_review_no_dynamic_posts")
    template = {
        "schemaVersion": 2, "simulationId": simulation_dir.name,
        "reviewer": "", "reviewedAt": "",
        "posts": [{
            "postId": post.post_id, "agentId": post.agent_id, "content": generated_text(post),
            "contentSha256": hashlib.sha256(generated_text(post).encode("utf-8")).hexdigest(),
            "quotedPostId": post.original_post_id,
            "quotedContent": post.content if post.original_post_id is not None else None,
            "quotedContentSha256": hashlib.sha256(post.content.encode("utf-8")).hexdigest() if post.original_post_id is not None else None,
            "scenarioRelevant": False, "roleFaithful": False, "scopeSafe": False, "actionable": False,
        } for post in posts],
    }
    path = review_file_path(simulation_dir, review_file)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(template, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    return path


def review_covers_dynamic_posts(
    simulation_dir: Path, posts: list[Post], review_file: Path | None = None
) -> tuple[bool, bool, int, int]:
    path = review_file_path(simulation_dir, review_file)
    if not path.exists():
        return False, False, 0, 0
    try:
        if path.stat().st_mode & 0o077:
            return False, False, 0, 0
        review = load_json(path)
        reviewed_at = datetime.fromisoformat(review["reviewedAt"].replace("Z", "+00:00"))
        if (review.get("schemaVersion") != 2 or review.get("simulationId") != simulation_dir.name
                or not isinstance(review.get("reviewer"), str) or not review["reviewer"].strip()
                or reviewed_at.tzinfo is None or reviewed_at.utcoffset() is None):
            return False, False, 0, 0
        expected = {
            (post.post_id, post.agent_id, hashlib.sha256(generated_text(post).encode("utf-8")).hexdigest()): post
            for post in posts if is_dynamic(post)
        }
        entries = review.get("posts")
        if not expected or not isinstance(entries, list) or len(entries) != len(expected):
            return False, False, 0, 0
        reviewed = set()
        approved = 0
        all_approved = True
        for entry in entries:
            identity = (entry.get("postId"), entry.get("agentId"), entry.get("contentSha256"))
            post = expected.get(identity)
            if (post is None or identity in reviewed or entry.get("content") != generated_text(post)
                    or (post.original_post_id is not None and (
                        entry.get("quotedPostId") != post.original_post_id
                        or entry.get("quotedContent") != post.content
                        or entry.get("quotedContentSha256") != hashlib.sha256(post.content.encode("utf-8")).hexdigest()))):
                return False, False, 0, 0
            reviewed.add(identity)
            if all(entry.get(key) is True for key in ("scenarioRelevant", "roleFaithful", "scopeSafe", "actionable")):
                approved += 1
            else:
                all_approved = False
        review_complete = reviewed == set(expected)
        return review_complete, all_approved and review_complete, len(reviewed), approved
    except (AttributeError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False, False, 0, 0


def audit(simulation_dir: Path, cohort_path: Path, review_file: Path | None = None) -> dict:
    cohort = load_json(cohort_path)
    personas = cohort.get("personas")
    if not isinstance(personas, list) or not personas:
        raise ValueError("cohort must specify personas")
    if any(
        not isinstance(item, dict)
        or not isinstance(item.get("id"), str)
        or not item["id"].strip()
        for item in personas
    ):
        raise ValueError("cohort persona IDs must be non-empty strings")
    expected_ids = {item["id"] for item in personas}
    if len(expected_ids) != len(personas):
        raise ValueError("cohort contains duplicate persona IDs")
    shared_workflow = cohort.get("firstWorkflow")
    workflows = {
        item["id"]: item.get("firstWorkflow") or shared_workflow
        for item in personas
    }
    if any(not isinstance(workflow, str) or not workflow.strip() for workflow in workflows.values()):
        raise ValueError("cohort must specify each buyer's first workflow")

    config = load_json(simulation_dir / "simulation_config.json")
    run_state_path = simulation_dir / "run_state.json"
    run_state = load_json(run_state_path) if run_state_path.is_file() else {}
    with (simulation_dir / "twitter_profiles.csv").open(encoding="utf-8", newline="") as handle:
        profiles = list(csv.DictReader(handle))

    profile_by_agent = {}
    profile_by_name = {}
    profile_context_by_agent = {}
    for profile in profiles:
        agent_id = int(profile["user_id"])
        if agent_id in profile_by_agent:
            raise ValueError("profiles contain duplicate agent IDs")
        profile_by_agent[agent_id] = profile["name"]
        if profile["name"] in profile_by_name:
            raise ValueError("profiles contain duplicate persona IDs")
        profile_by_name[profile["name"]] = profile
        profile_context_by_agent[agent_id] = " ".join(
            profile.get(key, "") for key in ("user_char", "description")
        )

    configured_by_agent = {
        index: agent.get("entity_name")
        for index, agent in enumerate(config.get("agent_configs", []))
    }
    profile_ids = set(profile_by_agent.values())
    configured_ids = set(configured_by_agent.values())
    missing_workflow_profiles = sorted(
        persona_id for persona_id, workflow in workflows.items()
        if normalized_words(workflow)
        not in normalized_words(" ".join((profile_by_name.get(persona_id) or {}).get(key, "") for key in ("user_char", "description")))
    )

    posts = read_posts(simulation_dir)

    initial_specs = config.get("event_config", {}).get("initial_posts", [])
    actual_initial = {(post.agent_id, post.content) for post in posts if not is_dynamic(post)}
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

    unknown_post_agents = sorted({post.agent_id for post in posts if post.agent_id not in profile_by_agent})
    dynamic_posts = [post for post in posts if is_dynamic(post)]
    dynamic_post_ids = [profile_by_agent.get(post.agent_id, "<unknown-agent>") for post in dynamic_posts]
    post_counts = Counter(dynamic_post_ids)
    seen_content = {normalized_words(post.content) for post in posts if not is_dynamic(post)}
    duplicate_post_ids = []
    dynamic_identity_errors = []
    unsupported_numeric_claim_post_ids = []
    posts_by_id = {post.post_id: post for post in posts}
    for post in dynamic_posts:
        content = generated_text(post)
        normalized = normalized_words(content)
        if not normalized or normalized in seen_content:
            duplicate_post_ids.append(post.post_id)
        seen_content.add(normalized)
        assigned_id = profile_by_agent.get(post.agent_id)
        mentioned_ids = sorted(set(PERSONA_ID.findall(content)))
        if mentioned_ids and mentioned_ids != [assigned_id]:
            dynamic_identity_errors.append({
                "postId": post.post_id,
                "assignedPersona": assigned_id,
                "mentionedPersonas": mentioned_ids,
            })
        source_context = profile_context_by_agent.get(post.agent_id, "")
        quoted_source = posts_by_id.get(post.original_post_id)
        if quoted_source:
            source_context = f"{source_context} {quoted_source.content}"
        if not money_amounts(content).issubset(money_amounts(source_context)):
            unsupported_numeric_claim_post_ids.append(post.post_id)
    review_complete, content_review_passed, reviewed_dynamic_posts, approved_dynamic_posts = (
        review_covers_dynamic_posts(simulation_dir, posts, review_file)
    )
    active_buyers = {
        agent.get("entity_name")
        for agent in config.get("agent_configs", [])
        if agent.get("activity_level", 0) > 0 and agent.get("active_hours")
    }
    cross_buyer_quotes = [
        post for post in dynamic_posts
        if profile_by_agent.get(post.agent_id) in active_buyers
        and post.original_post_agent_id in profile_by_agent
        and post.agent_id != post.original_post_agent_id
    ]
    cross_engaged_buyers = {profile_by_agent[post.agent_id] for post in cross_buyer_quotes}
    active_buyer_personas = {
        agent.get("entity_name")
        for agent in config.get("agent_configs", [])
        if agent.get("activity_level", 0) > 0 and agent.get("active_hours")
    }
    missing_buyer_interactions = sorted(active_buyer_personas - cross_engaged_buyers)
    actions, events = action_log_entries(simulation_dir)
    action_rows = len(actions)
    committed_posts = Counter((post.post_id, post.agent_id, post.content) for post in posts)
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
        "dynamicPostNovelty": not duplicate_post_ids,
        "dynamicPostPersonaIdentity": not dynamic_identity_errors,
        "buyerNumericClaimsSupported": not unsupported_numeric_claim_post_ids,
        "actionTelemetry": committed_posts == traced_posts and action_rows == reported_actions,
        "completionTelemetry": status == "completed" and type(total_rounds) is int and total_rounds > 0
        and run_state.get("current_round") == total_rounds
        and run_state.get("twitter_completed") is True and len(completion_events) == 1
        and completion_events[0].get("total_rounds") == total_rounds
        and completion_events[0].get("total_actions") == action_rows,
        "buyerActivity": bool(active_buyers) and all(post_counts.get(buyer, 0) > 0 for buyer in active_buyers),
        "crossBuyerInteraction": bool(active_buyers) and not missing_buyer_interactions,
        "buyerReviewComplete": review_complete,
        "buyerContentReview": content_review_passed,
    }
    return {
        "simulationId": config.get("simulation_id"),
        "cohortSchemaVersion": cohort.get("schemaVersion"),
        "expectedPersonas": len(expected_ids),
        "generatedProfiles": len(profiles),
        "configuredAgents": len(configured_by_agent),
        "missingPersonas": sorted(expected_ids - profile_ids),
        "unexpectedPersonas": sorted(profile_ids - expected_ids),
        "missingWorkflowProfiles": missing_workflow_profiles,
        "initialPosts": len(actual_initial),
        "dynamicPosts": sum(post_counts.values()),
        "reviewedDynamicPosts": reviewed_dynamic_posts,
        "approvedDynamicPosts": approved_dynamic_posts,
        "dynamicPostPersonas": dict(sorted(post_counts.items())),
        "crossBuyerQuotePostIds": [post.post_id for post in cross_buyer_quotes],
        "selfQuotePostIds": [post.post_id for post in dynamic_posts if post.original_post_id is not None and post.agent_id == post.original_post_agent_id],
        "missingBuyerInteractions": missing_buyer_interactions,
        "scheduledBuyers": sorted(active_buyers),
        "attributionErrors": attribution_errors,
        "missingInitialPostAgents": missing_initial_posts,
        "unknownPostAgents": unknown_post_agents,
        "duplicateDynamicPostIds": duplicate_post_ids,
        "dynamicIdentityErrors": dynamic_identity_errors,
        "unsupportedNumericClaimPostIds": unsupported_numeric_claim_post_ids,
        "actionLogRows": action_rows,
        "tracedPosts": sum(traced_posts.values()),
        "completionEvents": len(completion_events),
        "reportedTwitterActions": reported_actions,
        "loopCompletedInLog": loop_completed,
        "runnerStatus": status,
        "runStatePresent": run_state_path.is_file(),
        "reportedRound": run_state.get("current_round"),
        "configuredRounds": run_state.get("total_rounds"),
        "checks": checks,
        "technicalEvidencePassed": all(value for key, value in checks.items() if key not in {"buyerContentReview", "buyerReviewComplete", "buyerNumericClaimsSupported", "crossBuyerInteraction"}),
        "pilotEvidencePassed": all(checks.values()),
        "marketValidation": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulation-dir", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--review-file", type=Path, help="Review JSON filename within the simulation directory")
    parser.add_argument("--prepare-review", action="store_true")
    args = parser.parse_args()
    result = audit(args.simulation_dir, args.cohort, args.review_file)
    if args.prepare_review:
        if not result["technicalEvidencePassed"]:
            raise SystemExit("technical_evidence_failed")
        try:
            path = prepare_review_template(args.simulation_dir, args.review_file)
        except FileExistsError:
            raise SystemExit("buyer_review_already_exists")
        print(json.dumps({"reviewTemplate": str(path), "dynamicPosts": result["dynamicPosts"]}, sort_keys=True))
        return
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["pilotEvidencePassed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
