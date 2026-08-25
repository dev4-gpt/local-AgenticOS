FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && useradd --uid 10001 --create-home --shell /usr/sbin/nologin app \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY worker.mjs ./worker.mjs
COPY scripts/provision-gcp-client.mjs ./scripts/provision-gcp-client.mjs
COPY scripts/client-provider-policy.mjs ./scripts/client-provider-policy.mjs

ENV PORT=8080
ENV HOME=/home/app
USER app
CMD ["node", "worker.mjs"]
