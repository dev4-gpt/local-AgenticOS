#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const pack = process.env.AGENTIC_OS_WORLDS_PACK_DIR?.trim();
const port = Number(process.env.PORT || 3945);
if (!pack || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
  console.error("Set AGENTIC_OS_WORLDS_PACK_DIR to the extracted add-on source folder; PORT defaults to 3945.");
  process.exit(1);
}

let root;
try {
  root = await realpath(pack);
  await Promise.all([
    stat(path.join(root, "public/worlds/index.html")),
    stat(path.join(root, "public/worlds/assets/tea-detailed.glb")),
    stat(path.join(root, "public/worlds/assets/glass-detailed.glb")),
    stat(path.join(root, "public/worlds/assets/snow-detailed.glb")),
  ]);
} catch {
  console.error("Worlds add-on is incomplete or unavailable.");
  process.exit(1);
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".hdr": "application/octet-stream",
  ".blend": "application/octet-stream",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

function segments(value) {
  try {
    const parts = value.split("/").filter(Boolean).map(decodeURIComponent);
    return parts.length && parts.every((part) => part !== "." && part !== ".." && !/[\\/\0]/.test(part)) ? parts : null;
  } catch { return null; }
}

async function fileFor(url) {
  if (url.pathname === "/api/worlds/source") {
    const world = url.searchParams.get("world");
    if (!world || !["tea", "glass", "snow"].includes(world)) return null;
    return { base: path.join(root, "world-sources"), parts: [`${world}-detailed.blend`], download: true };
  }
  if (url.pathname.startsWith("/worlds/")) {
    return { base: path.join(root, "public/worlds"), parts: segments(url.pathname.slice("/worlds/".length)), download: false };
  }
  if (url.pathname.startsWith("/guides/blender-worlds/")) {
    return { base: path.join(root, "public/guides/blender-worlds"), parts: segments(url.pathname.slice("/guides/blender-worlds/".length)), download: false };
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }
  const file = await fileFor(url);
  if (!file?.parts) { response.writeHead(404).end(); return; }
  try {
    const base = await realpath(file.base);
    const target = await realpath(path.join(base, ...file.parts));
    const type = mime[path.extname(target).toLowerCase()];
    const info = await stat(target);
    if (!target.startsWith(`${base}${path.sep}`) || !info.isFile() || !type) throw new Error("not_found");

    const headers = { "Content-Type": type, "Accept-Ranges": "bytes" };
    if (file.download) headers["Content-Disposition"] = `attachment; filename="${path.basename(target)}"`;
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
    let start = 0;
    let end = info.size - 1;
    if (request.headers.range) {
      if (!match || (!match[1] && !match[2])) throw new Error("invalid_range");
      if (match[1]) {
        start = Number(match[1]);
        if (match[2]) end = Number(match[2]);
      } else {
        start = Math.max(0, info.size - Number(match[2]));
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size || end >= info.size) throw new Error("invalid_range");
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = String(info.size === 0 ? 0 : end - start + 1);
    response.writeHead(request.headers.range ? 206 : 200, headers);
    if (request.method === "HEAD" || info.size === 0) { response.end(); return; }
    createReadStream(target, { start, end }).on("error", () => response.destroy()).pipe(response);
  } catch (error) {
    if (error?.message === "invalid_range") response.writeHead(416, { "Content-Range": "bytes */*" }).end();
    else response.writeHead(404).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`World Studio add-on ready at http://127.0.0.1:${port}/worlds/index.html`);
});
