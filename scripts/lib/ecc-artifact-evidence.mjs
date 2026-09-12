import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export function verifyEccArtifactBytes(bytes, output) {
  let artifact;
  try { artifact = JSON.parse(bytes.toString('utf8')); } catch { return null; }
  // The uploaded JSON preserves the worker's key order. PostgreSQL jsonb does
  // not, so compare its value structurally rather than hashing the DB encoding.
  const artifactHash = createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
  if (!isDeepStrictEqual(artifact, output?.artifact) || artifactHash !== output?.artifactHash || artifactHash !== output?.evaluation?.artifactHash) return null;
  return { artifactHash, storedBytesSha256: createHash('sha256').update(bytes).digest('hex'), storedBytes: bytes.length };
}
