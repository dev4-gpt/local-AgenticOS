import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const DATA_PATH = "docs/research/www.shopify.com/content-dataset.json";
const OUT_DIR = "public/images/editions";
const CONCURRENCY = 4;

function filenameFor(url, idx) {
  const u = new URL(url);
  const base = path.basename(u.pathname).replace(/\.[a-z0-9]+$/i, "");
  const ext = /\.webp(\?|$)/i.test(url) ? "webp" : /\.png(\?|$)/i.test(url) ? "png" : "jpg";
  return `${String(idx).padStart(3, "0")}-${base}.${ext}`;
}

async function downloadOne(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return destPath;
}

async function run() {
  const raw = await readFile(DATA_PATH, "utf-8");
  const items = JSON.parse(raw).filter((d) => d.imgSrc);
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      const filename = filenameFor(item.imgSrc, idx);
      const dest = path.join(OUT_DIR, filename);
      try {
        await downloadOne(item.imgSrc, dest);
        manifest.push({ ...item, localPath: `/images/editions/${filename}` });
        console.log(`ok  ${filename}`);
      } catch (err) {
        console.error(`fail ${item.imgSrc}: ${err.message}`);
        manifest.push({ ...item, localPath: null });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const withMedia = JSON.parse(raw).filter((d) => !d.imgSrc);
  const full = [...manifest, ...withMedia.map((d) => ({ ...d, localPath: null }))];
  await writeFile(
    "docs/research/www.shopify.com/content-dataset-final.json",
    JSON.stringify(full, null, 1)
  );
  console.log(`Downloaded ${manifest.filter((m) => m.localPath).length}/${items.length} images.`);
}

run();
