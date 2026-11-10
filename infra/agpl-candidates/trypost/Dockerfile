# Empty infrastructure shell for the `trypost` AGPL adapter candidate (ADR-010, X-10).
#
# This Dockerfile builds no AGPL source. It exists only to prove out the isolation pattern — its own
# container, its own process, reached only over HTTP — before any `trypost` code is added. Do not add a
# COPY, git clone, or package install of trypostit/trypost (or any other AGPL project) to this file until
# the AGPL legal review (X-10) is signed off and recorded in docs/architecture/adr-010-agpl-candidate-adapter-separation.md.
FROM node:24.14.1-slim

WORKDIR /app

# Placeholder health server only. Replace with the real adapter's entrypoint after legal sign-off, at
# which point this file stops being a shell and `scripts/provision-agpl-candidate-shell.mjs` stops accepting it.
COPY health-server.mjs ./

EXPOSE 8080
CMD ["node", "health-server.mjs"]
