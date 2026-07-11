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
printf "Writing music-only ElevenLabs key to: %s\n" "$ENV_FILE"
printf "Paste ELEVENLABS_MUSIC_API_KEY: "
IFS= read -r -s KEY
printf "\n"
if [[ -z "${KEY// }" ]]; then
  printf "No key entered. Nothing changed.\n" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
grep -v '^ELEVENLABS_MUSIC_API_KEY=' "$ENV_FILE" > "$TMP_FILE" || true
printf 'ELEVENLABS_MUSIC_API_KEY=%s\n' "$KEY" >> "$TMP_FILE"
mv "$TMP_FILE" "$ENV_FILE"
chmod 600 "$ENV_FILE"
printf "Music key saved locally. Restart AgentOS, then choose Eleven Music in the Music tab.\n"
