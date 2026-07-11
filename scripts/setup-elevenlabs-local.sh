#!/usr/bin/env bash
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ACTIVE_PROFILE="${HERMES_PROFILE:-main}"

if [[ -f "$HERMES_HOME/active_profile" ]]; then
  ACTIVE_PROFILE="$(tr -d '[:space:]' < "$HERMES_HOME/active_profile")"
fi

PROFILE_DIR="$HERMES_HOME/profiles/$ACTIVE_PROFILE"
ENV_FILE="$PROFILE_DIR/.env"

mkdir -p "$PROFILE_DIR"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

printf "Active Hermes profile: %s\n" "$ACTIVE_PROFILE"
printf "Writing ElevenLabs key to: %s\n" "$ENV_FILE"
printf "Paste ELEVENLABS_API_KEY: "
IFS= read -r -s ELEVENLABS_API_KEY
printf "\n"

if [[ -z "${ELEVENLABS_API_KEY// }" ]]; then
  printf "No key entered. Nothing changed.\n" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
if [[ -s "$ENV_FILE" ]]; then
  grep -v '^ELEVENLABS_API_KEY=' "$ENV_FILE" > "$TMP_FILE" || true
fi
printf 'ELEVENLABS_API_KEY=%s\n' "$ELEVENLABS_API_KEY" >> "$TMP_FILE"
mv "$TMP_FILE" "$ENV_FILE"
chmod 600 "$ENV_FILE"

printf "ElevenLabs key saved locally. Restart AgentOS or wait for the next server refresh, then check /api/video/voices.\n"
