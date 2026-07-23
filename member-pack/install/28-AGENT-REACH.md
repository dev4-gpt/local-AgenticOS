# AgentReach Research

AgentReach is the reviewed discovery layer for Veloce AgenticOS. It installs and diagnoses upstream research tools; agents then use only the approved read-only commands for each source.

## Product boundary

- Use public material and content the operator is already authorized to access.
- Preserve the source URL, platform, retrieval time, and active backend in research notes.
- Do not bypass paywalls, authentication, robots controls, or platform restrictions.
- Do not expose arbitrary shell execution through the dashboard.
- Do not enable posting, liking, commenting, messaging, or account changes.
- Use dedicated research accounts for cookie-backed platforms. Never use a primary personal or client account.
- Keep credentials in `~/.agent-reach/config.yaml` with mode `0600`; never place them in Git, prompts, screenshots, or the Obsidian vault.

## Reviewed installation

The local installation was audited from `Panniantong/Agent-Reach` at version `1.5.0` and installed with `uv tool`. For a fresh machine:

```bash
uv tool install https://github.com/Panniantong/Agent-Reach.git
agent-reach install --env=local --safe
agent-reach doctor --json
```

Safe mode registers the skill and reports missing dependencies without automatically installing optional social backends or importing browser cookies.

## Availability levels

1. **Public by default:** web pages through Jina Reader, GitHub, RSS, V2EX, and supported public video/search sources.
2. **Operator setup:** Twitter/X search, Reddit, and other login-backed channels. Configure only after reviewing account and platform risk.
3. **Public LinkedIn only:** public pages may be read when the source permits it. Full profile, company, and job automation requires a separately reviewed LinkedIn connector and authenticated operator session.
4. **Unavailable:** paid content or private material the user cannot normally access.

## Operations

```bash
agent-reach doctor
agent-reach check-update
```

### X research account

Use a dedicated research profile and copy only the `auth_token` and `ct0` cookie values from the browser's developer tools. Do not export the full cookie jar and do not allow an automated browser-cookie import.

Store both values through the hidden-input helper:

```bash
cd /Users/aryamandev/Documents/Codex/Projects/AgentOS/source
bash scripts/setup-agent-reach-x-local.sh
```

The helper writes only to `~/.agent-reach/config.yaml` and `~/.agent-reach/twitter.env`, both with mode `0600`. The AgentOS diagnostic loads an allowlist containing only `TWITTER_AUTH_TOKEN` and `TWITTER_CT0`; it never sources arbitrary shell content.

Install `twitter-cli` only after those credentials are stored, then test a read-only command. Do not enable posting, replying, liking, following, direct messages, or unattended account actions.

### Reddit and Instagram

Reddit and Instagram use OpenCLI's local browser bridge. OpenCLI is a broad tool and includes write-capable commands, so Veloce agents must not invoke its binary directly. Use the project gate instead:

```bash
bash scripts/agent-reach-social-read.sh reddit search "agentic AI" -f yaml
bash scripts/agent-reach-social-read.sh reddit subreddit LocalLLaMA -f yaml
bash scripts/agent-reach-social-read.sh instagram profile nasa -f yaml
bash scripts/agent-reach-social-read.sh instagram user nasa --limit 6 -f yaml
bash scripts/agent-reach-social-read.sh facebook profile zuck -f yaml
```

The gate allows only these command families:

- Reddit: `search`, `read`, `subreddit`, `hot`, `popular`, `subreddit-info`
- Instagram: `search`, `profile`, `user`, `explore`
- Facebook: `search`, `profile`

Posting, commenting, voting, messaging, following, liking, saving, downloading, account changes, and arbitrary OpenCLI commands are blocked by product policy. Keep the OpenCLI extension confined to a dedicated Chrome research profile containing no personal or client sessions.

Run the real read-only verification after connecting the extension and logging into both sites:

```bash
node scripts/verify-agent-reach-social.mjs
```

The verification performs one Reddit search and one public Instagram profile lookup, then records only pass/fail state in `~/.agentic-os/agent-reach-validated.json`. Veloce does not trust OpenCLI's generic extension status for authenticated channels: a channel must pass this real read within the last 24 hours before the dashboard counts it as working.

The Integrations page reads `agent-reach doctor --json` and reports the real number of working channels. A degraded or missing channel must be shown honestly; the OS must not silently substitute fabricated research.
