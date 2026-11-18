import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MAX_DIFF_BYTES = 256 * 1024 * 1024;
export const WORKING_TREE_FINGERPRINT_SCHEMA = "agentos-working-tree-v1";

export function workingTreeFingerprintSha256(root) {
  const diff = spawnSync("git", ["diff", "--binary", "HEAD", "--"], {
    cwd: root, encoding: "buffer", maxBuffer: MAX_DIFF_BYTES,
  });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root, encoding: "buffer", maxBuffer: MAX_DIFF_BYTES,
  });
  if (diff.error || diff.status !== 0 || untracked.error || untracked.status !== 0
    || !Buffer.isBuffer(diff.stdout) || !Buffer.isBuffer(untracked.stdout)) {
    throw new Error("working_tree_fingerprint_unavailable");
  }

  const hash = createHash("sha256");
  hash.update(`${WORKING_TREE_FINGERPRINT_SCHEMA}\0tracked-diff\0`);
  hash.update(diff.stdout);
  hash.update("\0untracked-files\0");
  for (const relativePath of splitNull(untracked.stdout).sort(Buffer.compare)) {
    const filePath = resolve(root, relativePath.toString("utf8"));
    const stat = lstatSync(filePath);
    hash.update(relativePath);
    hash.update(`\0${stat.mode & 0o777}\0`);
    if (stat.isSymbolicLink()) {
      hash.update("symlink\0");
      hash.update(readlinkSync(filePath));
    } else if (stat.isFile()) {
      hash.update("file\0");
      hash.update(readFileSync(filePath));
    } else {
      throw new Error("working_tree_fingerprint_unsupported_file_type");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

function splitNull(value) {
  const paths = [];
  let start = 0;
  for (let end = value.indexOf(0); end !== -1; end = value.indexOf(0, start)) {
    paths.push(value.subarray(start, end));
    start = end + 1;
  }
  return paths;
}
