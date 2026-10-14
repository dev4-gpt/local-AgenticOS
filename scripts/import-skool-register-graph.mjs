import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrivateAddress } from "../src/lib/clientPrivateAddress.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const CLASSROOM_PATH = "/ai-profit-lab-7462/classroom/9daf24e1";

function safePublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  if (isPrivateAddress(url.hostname)) return null;
  for (const key of url.searchParams.keys()) {
    if (/(token|secret|auth|session|api[_-]?key|password|signature|^sig$)/i.test(key)) return null;
  }
  url.hash = "";
  return url.toString();
}

function lessonIdentity(value) {
  const url = safePublicUrl(value);
  if (!url) throw new Error("lesson_url_invalid");
  const parsed = new URL(url);
  const ids = parsed.searchParams.getAll("md");
  if (parsed.origin !== "https://www.skool.com" || parsed.pathname !== CLASSROOM_PATH
      || ids.length !== 1 || !/^[0-9a-f]{32}$/i.test(ids[0])) {
    throw new Error("lesson_url_invalid");
  }
  return { url, lessonKey: ids[0].toLowerCase() };
}

export function buildSkoolRegisterGraph(markdown, registerId) {
  if (typeof markdown !== "string" || !markdown.trim()) throw new Error("register_empty");
  if (typeof registerId !== "string" || !/^[A-Za-z0-9_-]{10,}$/.test(registerId)) throw new Error("register_id_invalid");

  const lessons = [];
  const skippedLinks = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      if (current) lessons.push(current);
      current = { title: line.slice(3).trim(), lessonUrl: null, createdAt: null, updatedAt: null, video: null, links: [] };
      continue;
    }
    if (!current) continue;
    let match = line.match(/^- Lesson: (\S+)\s*$/);
    if (match) {
      if (current.lessonUrl) throw new Error("lesson_url_duplicate");
      current.lessonUrl = match[1];
      continue;
    }
    match = line.match(/^- Date: created (\d{4}-\d{2}-\d{2}), updated (\d{4}-\d{2}-\d{2})\s*$/);
    if (match) {
      if (current.createdAt) throw new Error("lesson_date_duplicate");
      current.createdAt = match[1];
      current.updatedAt = match[2];
      continue;
    }
    match = line.match(/^- Video: (.+?)\s*$/);
    if (match) {
      if (current.video) throw new Error("lesson_video_duplicate");
      const hosted = match[1].match(/^\(Skool-hosted ([0-9a-f]{32})\)$/i);
      if (hosted) current.video = { hostedId: hosted[1].toLowerCase() };
      else {
        const safeUrl = safePublicUrl(match[1]);
        if (!safeUrl) skippedLinks.push({ lesson: current.title, kind: "video", reason: "unsafe_or_invalid_url" });
        else current.video = { url: safeUrl };
      }
      continue;
    }
    match = line.match(/^- Link: (\S+)\s*$/);
    if (match) {
      const safeUrl = safePublicUrl(match[1]);
      if (safeUrl) current.links.push(safeUrl);
      else skippedLinks.push({ lesson: current.title, kind: "link", reason: "unsafe_or_invalid_url" });
    }
  }
  if (current) lessons.push(current);

  const records = lessons.filter((item) => item.lessonUrl);
  const seenLessonIds = new Set();
  for (const record of records) {
    if (!record.title || !record.createdAt || !record.updatedAt || !record.video) throw new Error("lesson_record_incomplete");
    const identity = lessonIdentity(record.lessonUrl);
    record.lessonUrl = identity.url;
    record.lessonKey = identity.lessonKey;
    if (seenLessonIds.has(identity.lessonKey)) throw new Error("lesson_id_duplicate");
    seenLessonIds.add(identity.lessonKey);
    for (const date of [record.createdAt, record.updatedAt]) {
      if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("lesson_date_invalid");
    }
  }
  if (!records.length || records.length !== lessons.length) throw new Error("lesson_register_incomplete");

  const nodes = new Map();
  const edges = [];
  const publicVideos = new Set();
  const hostedVideos = new Set();
  const outboundLinks = new Set();
  let publicVideoReferenceEdges = 0;
  let hostedVideoReferenceEdges = 0;
  let outboundLinkEdges = 0;
  for (const record of records) {
    const lessonId = `skool-lesson:${record.lessonKey}`;
    nodes.set(lessonId, {
      "@id": lessonId,
      "@type": "LearningResource",
      name: record.title,
      url: record.lessonUrl,
      identifier: record.lessonKey,
      dateCreated: record.createdAt,
      dateModified: record.updatedAt,
      contentStatus: "metadata_only",
      pageTextCaptured: false,
    });

    const videoKey = record.video.url ? `url:${sha256(record.video.url)}` : `skool-video:${record.video.hostedId}`;
    if (!nodes.has(videoKey)) {
      nodes.set(videoKey, record.video.url
        ? { "@id": videoKey, "@type": "VideoObject", url: record.video.url, mediaBytesCaptured: false }
        : { "@id": videoKey, "@type": "VideoObject", identifier: record.video.hostedId, provider: "Skool", mediaBytesCaptured: false });
    }
    if (record.video.url) {
      publicVideos.add(record.video.url);
      publicVideoReferenceEdges++;
    } else {
      hostedVideos.add(record.video.hostedId);
      hostedVideoReferenceEdges++;
    }
    edges.push({ "@type": "hasVideoReference", source: lessonId, target: videoKey, mediaBytesCaptured: false });

    for (const link of record.links) {
      const targetId = `url:${sha256(link)}`;
      if (!nodes.has(targetId)) nodes.set(targetId, { "@id": targetId, "@type": "URL", url: link });
      edges.push({ "@type": "links_to", source: lessonId, target: targetId });
      outboundLinks.add(link);
      outboundLinkEdges++;
    }
  }

  return {
    "@context": "https://schema.org",
    "@graph": [...nodes.values()].sort((a, b) => a["@id"].localeCompare(b["@id"])),
    edges,
    provenance: {
      sourceRegisterId: registerId,
      sourceRegisterSha256: sha256(markdown),
      format: "agentos-skool-register-graph-v1",
      lessonCount: records.length,
      videoReferenceEdges: publicVideoReferenceEdges + hostedVideoReferenceEdges,
      publicVideoReferenceEdges,
      uniquePublicVideoUrls: publicVideos.size,
      skoolHostedVideoReferenceEdges: hostedVideoReferenceEdges,
      uniqueSkoolHostedVideoIds: hostedVideos.size,
      outboundLinkEdges,
      uniqueOutboundLinkUrls: outboundLinks.size,
      skippedUnsafeLinks: skippedLinks.length,
      skippedLinks,
      pageTextIncluded: false,
      videoAssetsIncluded: false,
      complete: false,
    },
  };
}

export function mergeSkoolRegisterGraph(base, registerGraph) {
  if (!base || !Array.isArray(base["@graph"]) || !Array.isArray(base.edges)
      || !registerGraph || !Array.isArray(registerGraph["@graph"]) || !Array.isArray(registerGraph.edges)) {
    throw new Error("graph_merge_input_invalid");
  }
  const nodes = new Map();
  let omittedUnsafeUrls = 0;
  for (const node of [...base["@graph"], ...registerGraph["@graph"]]) {
    if (!node || typeof node["@id"] !== "string") throw new Error("graph_node_invalid");
    const merged = { ...nodes.get(node["@id"]), ...node };
    if (merged.url !== undefined && !safePublicUrl(merged.url)) {
      delete merged.url;
      merged.urlOmitted = true;
      merged.urlOmissionReason = "unsafe_or_invalid_url";
      omittedUnsafeUrls++;
    }
    nodes.set(node["@id"], merged);
  }
  const registerIndex = registerGraph.provenance && Object.keys(registerGraph.provenance).length > 0
    ? registerGraph.provenance
    : base.provenance?.registerIndex;
  return {
    ...base,
    "@context": base["@context"] ?? registerGraph["@context"],
    "@graph": [...nodes.values()].sort((a, b) => a["@id"].localeCompare(b["@id"])),
    edges: [...base.edges, ...registerGraph.edges],
    provenance: {
      ...(base.provenance ?? {}),
      ...(registerIndex ? { registerIndex } : {}),
      complete: false,
      videoAssetsIncluded: false,
      omittedUnsafeUrls,
    },
  };
}

export function privateGraphArtifactPath(candidate, projectRoot = process.cwd()) {
  if (typeof candidate !== "string" || path.isAbsolute(candidate)) throw new Error("private_graph_path_required");
  const base = path.resolve(projectRoot, "tmp/authorized-skool-import");
  const resolved = path.resolve(projectRoot, candidate);
  if (path.dirname(resolved) !== base || !/^[A-Za-z0-9._-]+\.jsonld$/.test(path.basename(resolved))) {
    throw new Error("private_graph_path_required");
  }
  return resolved;
}

function writePrivateFile(file, contents) {
  if (existsSync(file)) chmodSync(file, 0o600);
  writeFileSync(file, contents, { mode: 0o600 });
}

if (process.argv[1]?.endsWith("/import-skool-register-graph.mjs")) {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index < 0 ? null : args[index + 1];
  };
  const output = valueAfter("--output");
  const registerId = valueAfter("--register-id");
  const mergeCandidate = valueAfter("--merge-with");
  const flags = ["--output", "--register-id", "--merge-with"];
  if (!output || !registerId || args.some((arg) => arg.startsWith("--") && !flags.includes(arg))) {
    console.error("Usage: node scripts/import-skool-register-graph.mjs --register-id DRIVE_FILE_ID --output private.jsonld [--merge-with private-graph.jsonld] < register.md");
    process.exitCode = 2;
  } else {
    try {
      const outputPath = privateGraphArtifactPath(output);
      const mergeWith = mergeCandidate ? privateGraphArtifactPath(mergeCandidate) : null;
      const registerGraph = buildSkoolRegisterGraph(readFileSync(0, "utf8"), registerId);
      const graph = mergeWith
        ? mergeSkoolRegisterGraph(JSON.parse(readFileSync(mergeWith, "utf8")), registerGraph)
        : registerGraph;
      writePrivateFile(outputPath, JSON.stringify(graph));
      console.log(JSON.stringify({ output: outputPath, nodes: graph["@graph"].length, edges: graph.edges.length, registerIndex: graph.provenance.registerIndex ?? graph.provenance }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "private_graph_path_required");
      process.exitCode = 2;
    }
  }
}
