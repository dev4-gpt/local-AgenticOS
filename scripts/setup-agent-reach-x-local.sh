#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_REACH_PYTHON="$HOME/.local/share/uv/tools/agent-reach/bin/python"

if [[ ! -x "$AGENT_REACH_PYTHON" ]]; then
  printf "AgentReach is not installed in the expected uv tool environment.\n" >&2
  printf "Install it first, then run this helper again.\n" >&2
  exit 1
fi

exec "$AGENT_REACH_PYTHON" "$ROOT_DIR/scripts/setup-agent-reach-x-local.py"
