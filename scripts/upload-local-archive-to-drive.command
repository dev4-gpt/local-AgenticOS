#!/bin/zsh
set -euo pipefail

readonly DRIVE_FOLDER_ID="1LUC8vwFzQdo3Qh9EmMgELcTgB98dwWFc"
readonly DRIVE_REMOTE="schooltabs"

fail() {
  print -u2 -- "$1"
  print -u2 -- ""
  print -u2 -- "Press Return to close."
  read -r _
  exit 1
}

command -v rclone >/dev/null 2>&1 || fail "rclone is not installed. Install it with: brew install rclone"
rclone listremotes | grep -qx "${DRIVE_REMOTE}:" || fail "Set up the Google Drive remote once with: rclone config\nName it '${DRIVE_REMOTE}', choose Google Drive, sign in to the Google account that owns School Tabs Agent OS, and set its root folder ID to ${DRIVE_FOLDER_ID}. Then run this again."

SOURCE_DIR="$(/usr/bin/osascript -e 'POSIX path of (choose folder with prompt "Choose the folder containing files you already downloaded")' 2>/dev/null)" || exit 0
[[ -d "$SOURCE_DIR" ]] || fail "The selected source folder is unavailable."

print -- "Uploading PDFs and locally available media from: $SOURCE_DIR"
print -- "Destination: Google Drive / School Tabs Agent OS"
print -- "Existing files will not be overwritten; nothing will be deleted."
print -- ""

rclone copy "$SOURCE_DIR" "${DRIVE_REMOTE}:" \
  --drive-root-folder-id "$DRIVE_FOLDER_ID" \
  --immutable \
  --include '*.pdf' \
  --include '*.mp4' \
  --include '*.mov' \
  --include '*.m4v' \
  --include '*.webm' \
  --include '*.zip' \
  --include '*.md' \
  --include '*.txt' \
  --progress

print -- ""
print -- "Upload finished. Open the Drive folder to verify files and copy their Drive links:"
print -- "https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}"
print -- ""
print -- "This uploads local files only; it does not download or scrape Skool pages or videos."
print -- "Press Return to close."
read -r _
