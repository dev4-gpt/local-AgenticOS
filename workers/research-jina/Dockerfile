FROM node:24.14.1-slim
WORKDIR /app
COPY worker.mjs ./worker.mjs
ENV NODE_ENV=production
USER node
CMD ["node", "worker.mjs"]
