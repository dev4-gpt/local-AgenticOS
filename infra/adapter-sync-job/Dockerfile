# Scheduled adapter sync job for one client and one adapter (Veloce phase 2 slice 2d, ADR-015). Build from the repository root:
#   docker build -f infra/adapter-sync-job/Dockerfile -t adapter-sync-job .
# The image carries the two adapter commands and the host libraries they need, already compiled, and no secrets: the
# database address, the service key and the token signing key are injected at run time from the secret manager (job.yaml).
# Only the first stage has the `typescript` package, to compile; the final stage does not.
FROM node:24.14.1-slim AS build
WORKDIR /app
RUN npm install --no-save --no-package-lock --ignore-scripts --no-audit --no-fund typescript@5.9.3
COPY scripts/build-adapter-sync.mjs ./scripts/build-adapter-sync.mjs
COPY scripts/lib/hostLibLoader.mjs ./scripts/lib/hostLibLoader.mjs
COPY src/lib ./src/lib
RUN node scripts/build-adapter-sync.mjs

FROM node:24.14.1-slim
WORKDIR /app
COPY --from=build /app/dist/adapter-sync ./dist/adapter-sync
COPY scripts/run-adapter-sync.mjs scripts/run-adapter-events-puller.mjs scripts/run-adapter-tombstones.mjs ./scripts/
COPY scripts/lib/hostLibLoader.mjs ./scripts/lib/hostLibLoader.mjs

USER node

ENTRYPOINT ["node", "scripts/run-adapter-sync.mjs"]
