# Scheduled retention job for one client (tracker item 9b). Build from the repository root:
#   docker build -f infra/retention-job/Dockerfile -t retention-job .
# It carries only the retention command and what that command imports, and no secrets: the database address and the
# service key are injected at run time from the secret manager (see job.yaml).
FROM node:24.14.1-slim

WORKDIR /app

COPY scripts/client-lifecycle.mjs scripts/run-scheduled-retention.mjs ./scripts/
COPY scripts/lib ./scripts/lib
COPY src/lib/clientStorageRetentionClock.mjs ./src/lib/clientStorageRetentionClock.mjs

USER node

ENTRYPOINT ["node", "scripts/run-scheduled-retention.mjs"]
