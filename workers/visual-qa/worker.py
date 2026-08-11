#!/usr/bin/env python3
"""Bounded visual-QA worker protocol.

The worker reads one JSON request from stdin and writes one JSON report to
stdout. It intentionally accepts frame bytes rather than URLs or filesystem
paths, so the caller must first prove tenant ownership through the artifact
boundary. The current detector is dependency-free and checks frame structure;
Supervision can replace `inspect_frame` inside this isolated image later.
"""

from __future__ import annotations

import base64
import binascii
import json
import sys
import time
from typing import Any


MAX_FRAMES = 120
MAX_FRAME_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 32 * 1024 * 1024


def fail(code: str) -> dict[str, Any]:
    return {"status": "failed", "framesSampled": 0, "runtimeMs": 0, "findings": [], "warnings": [code]}


def inspect_frame(frame: bytes, index: int) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    if len(frame) < 24 or frame[:8] != b"\x89PNG\r\n\x1a\n":
        findings.append({"code": "frame_format_invalid", "severity": "error", "frame": index, "confidence": 1, "message": "Frame is not a bounded PNG image."})
        return findings
    width = int.from_bytes(frame[16:20], "big")
    height = int.from_bytes(frame[20:24], "big")
    if width < 16 or height < 16:
        findings.append({"code": "frame_dimensions_too_small", "severity": "warning", "frame": index, "confidence": 1, "message": "Frame dimensions are below the review minimum."})
    return findings


def run(payload: dict[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    tenant = payload.get("tenantSlug")
    artifact = payload.get("artifactId")
    frames = payload.get("frames")
    max_frames = payload.get("maxFrames", 12)
    if not isinstance(tenant, str) or not tenant or not isinstance(artifact, str) or not artifact:
        return fail("visual_qa_input_invalid")
    if not isinstance(frames, list) or not 1 <= len(frames) <= MAX_FRAMES or not isinstance(max_frames, int) or not 1 <= max_frames <= MAX_FRAMES:
        return fail("visual_qa_bounds_invalid")

    findings: list[dict[str, Any]] = []
    total = 0
    sampled = frames[:max_frames]
    for index, encoded in enumerate(sampled):
        if not isinstance(encoded, str) or len(encoded) > MAX_FRAME_BYTES * 2:
            return fail("visual_qa_frame_invalid")
        try:
            frame = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            return fail("visual_qa_frame_encoding_invalid")
        if not 1 <= len(frame) <= MAX_FRAME_BYTES:
            return fail("visual_qa_frame_too_large")
        total += len(frame)
        if total > MAX_TOTAL_BYTES:
            return fail("visual_qa_total_bytes_exceeded")
        findings.extend(inspect_frame(frame, index))

    runtime_ms = round((time.monotonic() - started) * 1000)
    status = "failed" if any(item["severity"] == "error" for item in findings) else "review" if findings else "passed"
    return {
        "contractVersion": "v96",
        "tenantSlug": tenant,
        "artifactId": artifact,
        "worker": "contract-only",
        "framesSampled": len(sampled),
        "runtimeMs": runtime_ms,
        "findings": findings,
        "warnings": ["Supervision detector is not enabled in this worker image."],
        "status": status,
    }


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read())
        result = run(payload if isinstance(payload, dict) else {})
    except (json.JSONDecodeError, UnicodeDecodeError):
        result = fail("visual_qa_json_invalid")
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
