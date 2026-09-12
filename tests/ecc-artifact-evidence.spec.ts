import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { verifyEccArtifactBytes } from '../scripts/lib/ecc-artifact-evidence.mjs';

test('download evidence survives PostgreSQL JSON reordering but rejects modified content', async () => {
  const db = new PGlite();
  try {
    const artifact = { schemaVersion: 1, department: 'engineering', brief: 'Reviewed fixture', checklist: [{ action: 'Verify source', id: 'first' }] };
    const compact = JSON.stringify(artifact);
    const artifactHash = createHash('sha256').update(compact).digest('hex');
    const storedBytes = Buffer.from(JSON.stringify(artifact, null, 2));
    const row = (await db.query<{ value: unknown }>('select $1::jsonb as value', [compact])).rows[0].value;
    expect(JSON.stringify(row)).not.toBe(compact);
    const output = { artifact: row, artifactHash, evaluation: { artifactHash } };
    expect(verifyEccArtifactBytes(storedBytes, output)?.artifactHash).toBe(artifactHash);
    expect(verifyEccArtifactBytes(Buffer.from(JSON.stringify({ ...artifact, brief: 'Tampered' })), output)).toBeNull();
    expect(verifyEccArtifactBytes(storedBytes, { ...output, evaluation: { artifactHash: '0'.repeat(64) } })).toBeNull();
    expect(verifyEccArtifactBytes(storedBytes, { ...output, artifact: { ...artifact, department: 'other' } })).toBeNull();
  } finally { await db.close(); }
});
