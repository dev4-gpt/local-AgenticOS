# Security And Secret Handling

AgentOS is designed to run locally first. The public repository should contain source code, examples, docs, and non-secret assets only.

## Never Commit

- API keys or OAuth tokens
- `.env`, `.env.local`, `.env.*`
- `~/.agentic-os/config.json`
- `~/.hermes/.env`
- `~/.hermes/profiles/*/.env`
- Obsidian vault contents
- `.next`, `node_modules`, local build caches, logs, screenshots containing tokens

The repository `.gitignore` excludes common environment files and generated folders, but still run a secret scan before pushing.

## Local Key Locations

Use local private files for credentials:

```bash
~/.hermes/profiles/<active>/.env
~/.agentic-os/*.env
~/.fcc/.env
```

For ElevenLabs:

```bash
bash scripts/setup-elevenlabs-local.sh
```

That script writes `ELEVENLABS_API_KEY` into your active Hermes profile with `0600` permissions. The key is never written to the repo.

The optional `scripts/setup-elevenlabs-music-local.sh` helper writes a separate `ELEVENLABS_MUSIC_API_KEY` with the same permissions. Use a separately restricted key for Music Generation so revoking or rotating music access does not affect voice or OpenMontage.

## Pre-Push Checklist

```bash
git status --ignored --short
rg -n --hidden --glob '!node_modules/**' --glob '!.next/**' --glob '!package-lock.json' \
  '(sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY=|OPENROUTER_API_KEY=|ELEVENLABS_API_KEY=|HEYGEN_API_KEY=|SUNO_API_KEY=|FIRECRAWL_API_KEY=|HUNTER_API_KEY=|APOLLO_API_KEY=)' .
npm run build
```

If the scan finds a real secret, remove it from the file, rotate the key, and only then push.
