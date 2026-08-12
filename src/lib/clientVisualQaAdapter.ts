import { Buffer } from "node:buffer";

export const CLIENT_VISUAL_QA_MAX_FRAMES = 120;
export const CLIENT_VISUAL_QA_MAX_FRAME_BYTES = 8 * 1024 * 1024;
export const CLIENT_VISUAL_QA_MAX_TOTAL_BYTES = 32 * 1024 * 1024;

export type ClientVisualQaFinding = {
  code: string;
  severity: "info" | "warning" | "error";
  frame: number;
  confidence: number;
  message: string;
};

export type ClientVisualQaResult = {
  contractVersion: "v96";
  tenantSlug: string;
  artifactId: string;
  worker: "contract-only";
  framesSampled: number;
  runtimeMs: number;
  findings: ClientVisualQaFinding[];
  warnings: string[];
  status: "passed" | "review" | "failed";
  errorCode?: string;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function failed(tenantSlug: string, artifactId: string, errorCode: string): ClientVisualQaResult {
  return {
    contractVersion: "v96",
    tenantSlug,
    artifactId,
    worker: "contract-only",
    framesSampled: 0,
    runtimeMs: 0,
    findings: [],
    warnings: [errorCode],
    status: "failed",
    errorCode,
  };
}

function inspectFrame(frame: Buffer, index: number): ClientVisualQaFinding[] {
  const findings: ClientVisualQaFinding[] = [];
  if (frame.length < 24 || !frame.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return [{ code: "frame_format_invalid", severity: "error", frame: index, confidence: 1, message: "Frame is not a bounded PNG image." }];
  }
  const width = frame.readUInt32BE(16);
  const height = frame.readUInt32BE(20);
  if (width < 16 || height < 16) {
    findings.push({ code: "frame_dimensions_too_small", severity: "warning", frame: index, confidence: 1, message: "Frame dimensions are below the review minimum." });
  }
  return findings;
}

export function validateClientVisualQaInput(input: Record<string, unknown>) {
  const tenantSlug = typeof input.tenantSlug === "string" ? input.tenantSlug.trim() : "";
  const artifactId = typeof input.artifactId === "string" ? input.artifactId.trim() : "";
  const frames = input.frames;
  const maxFrames = typeof input.maxFrames === "number" && Number.isInteger(input.maxFrames) ? input.maxFrames : 12;
  const errors: string[] = [];
  if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) errors.push("visual_qa_tenant_invalid");
  if (!/^[0-9a-f-]{36}$/i.test(artifactId)) errors.push("visual_qa_artifact_invalid");
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > CLIENT_VISUAL_QA_MAX_FRAMES) errors.push("visual_qa_bounds_invalid");
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > CLIENT_VISUAL_QA_MAX_FRAMES) errors.push("visual_qa_max_frames_invalid");
  if (typeof input.url === "string" || typeof input.path === "string" || typeof input.camera === "string") errors.push("visual_qa_external_input_rejected");
  if (Array.isArray(frames)) {
    let total = 0;
    for (const encoded of frames.slice(0, Math.max(0, maxFrames))) {
      if (typeof encoded !== "string" || encoded.length > CLIENT_VISUAL_QA_MAX_FRAME_BYTES * 2) {
        errors.push("visual_qa_frame_invalid");
        continue;
      }
      const normalized = encoded.replace(/=+$/, "");
      const base64ShapeValid = /^[A-Za-z0-9+/]*={0,2}$/.test(encoded) && encoded.length % 4 === 0;
      try {
        const frame = Buffer.from(encoded, "base64");
        if (!base64ShapeValid || frame.toString("base64").replace(/=+$/, "") !== normalized) {
          errors.push("visual_qa_frame_encoding_invalid");
        } else if (!frame.length || frame.length > CLIENT_VISUAL_QA_MAX_FRAME_BYTES) {
          errors.push("visual_qa_frame_too_large");
        }
        total += frame.length;
      } catch {
        errors.push("visual_qa_frame_encoding_invalid");
      }
    }
    if (total > CLIENT_VISUAL_QA_MAX_TOTAL_BYTES) errors.push("visual_qa_total_bytes_exceeded");
  }
  return [...new Set(errors)];
}

export function runClientVisualQaAdapter(input: Record<string, unknown>): ClientVisualQaResult {
  const tenantSlug = typeof input.tenantSlug === "string" ? input.tenantSlug.trim() : "";
  const artifactId = typeof input.artifactId === "string" ? input.artifactId.trim() : "";
  const frames = Array.isArray(input.frames) ? input.frames : [];
  const maxFrames = typeof input.maxFrames === "number" && Number.isInteger(input.maxFrames) ? input.maxFrames : 12;
  const validation = validateClientVisualQaInput(input);
  if (validation.length > 0) return failed(tenantSlug, artifactId, validation[0]);

  const started = Date.now();
  const findings: ClientVisualQaFinding[] = [];
  const sampled = frames.slice(0, maxFrames);
  for (const [index, encoded] of sampled.entries()) {
    findings.push(...inspectFrame(Buffer.from(encoded as string, "base64"), index));
  }
  return {
    contractVersion: "v96",
    tenantSlug,
    artifactId,
    worker: "contract-only",
    framesSampled: sampled.length,
    runtimeMs: Math.max(0, Date.now() - started),
    findings,
    warnings: ["Supervision detector is not enabled in this worker image."],
    status: findings.some((finding) => finding.severity === "error") ? "failed" : findings.length > 0 ? "review" : "passed",
  };
}
