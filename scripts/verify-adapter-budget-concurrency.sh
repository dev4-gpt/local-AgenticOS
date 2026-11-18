#!/bin/sh
set -eu

# Runs tests/adapter-budget-concurrency.spec.ts against a disposable local Postgres 17 container (no network,
# no real data). Needs Docker. The container is removed on exit, also when the test fails.
cd "$(dirname "$0")/.."
name="agentos-budget-concurrency-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run --detach --rm --name "$name" --network none \
  --tmpfs /var/lib/postgresql/data:rw,size=256m \
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
# pg_isready can answer during the image's init restart; give it a moment to settle.
sleep 3

ADAPTER_BUDGET_TEST_DB_CONTAINER="$name" npx playwright test tests/adapter-budget-concurrency.spec.ts \
  --config=playwright.unit.config.ts --reporter=line
echo "Adapter budget concurrency passed (disposable local container)."
