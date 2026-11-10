#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
name="agentos-source-import-smoke-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run --detach --rm --name "$name" --network none \
  --tmpfs /var/lib/postgresql/data:rw,size=256m \
  --mount "type=bind,source=$PWD/product-experience,target=/migration,readonly" \
  --mount "type=bind,source=$PWD/tests/fixtures,target=/fixtures,readonly" \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null

ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if docker exec "$name" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo "Disposable PostgreSQL did not become ready" >&2; exit 1; }

docker exec "$name" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -f /fixtures/source-import-postgres-smoke.sql >/dev/null
echo "Source-import PostgreSQL smoke passed (disposable local container)."
