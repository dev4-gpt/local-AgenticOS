FROM node:24-bookworm-slim

WORKDIR /app
COPY worker.mjs ./worker.mjs

ENV PORT=8080
USER 10001
CMD ["node", "worker.mjs"]
