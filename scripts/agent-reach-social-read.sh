#!/usr/bin/env bash
set -euo pipefail

OPENCLI_BIN="${OPENCLI_BIN:-$(command -v opencli || true)}"

if [[ -z "$OPENCLI_BIN" || ! -x "$OPENCLI_BIN" ]]; then
  printf "OpenCLI is not installed. Run the reviewed AgentReach OpenCLI setup first.\n" >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  printf "Usage: %s <reddit|instagram|facebook> <read-command> [arguments...]\n" "$0" >&2
  exit 2
fi

site="$1"
command_name="$2"
shift 2

case "$site:$command_name" in
  reddit:search|reddit:read|reddit:subreddit|reddit:hot|reddit:popular|reddit:subreddit-info)
    ;;
  instagram:search|instagram:profile|instagram:user|instagram:explore)
    ;;
  facebook:search|facebook:profile)
    ;;
  *)
    printf "Blocked: %s %s is not in the Veloce read-only social allowlist.\n" "$site" "$command_name" >&2
    exit 3
    ;;
esac

exec "$OPENCLI_BIN" "$site" "$command_name" "$@"
