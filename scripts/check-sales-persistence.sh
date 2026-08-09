#!/usr/bin/env bash
#
# Feature 7 T2 check: a sale POSTed to the Express server is really persisted.
#
# The restart is the point. Before this feature the adapter's createSale echoed the payload back
# with a 200 and wrote nothing, so a check that only POSTs and GETs within one process could pass
# against a server that saves nothing. Only a restart distinguishes the two.
#
# Usage:
#   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/cornerpos scripts/check-sales-persistence.sh
#
# Needs a reachable Postgres and nothing else; it starts and stops the server itself.
set -uo pipefail

: "${DATABASE_URL:?set DATABASE_URL to a reachable Postgres}"
export DATABASE_URL
export NODE_ENV="${NODE_ENV:-development}"   # dev listens on 3001

BASE="${BASE_URL:-http://127.0.0.1:3001}"
LOG="$(mktemp -t storeone-sales-check)"
SALE_ID="sale_persistence_check"

cleanup() { pkill -f "tsx server/index.ts" 2>/dev/null; }
trap cleanup EXIT

fail() { echo "FAIL: $1"; echo "--- server log ---"; tail -20 "$LOG"; exit 1; }

start_server() { npx tsx server/index.ts >>"$LOG" 2>&1 & }

wait_up() {
  for _ in $(seq 1 60); do
    curl -fsS "$BASE/api/admin/products" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

wait_down() {
  for _ in $(seq 1 30); do
    curl -fsS "$BASE/api/admin/products" >/dev/null 2>&1 || return 0
    sleep 1
  done
  return 1
}

start_server
wait_up || fail "server did not start"

SALE="{\"id\":\"$SALE_ID\",\"createdAt\":1712234567890,\"subtotalCents\":1250,\"taxCents\":100,\"totalCents\":1350,\"paymentMethod\":\"card\",\"customerName\":\"Persistence Check\",\"linesJson\":[{\"variantId\":\"v1\",\"quantity\":2}]}"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/sales" \
  -H 'Content-Type: application/json' -d "$SALE")
[ "$code" = "200" ] || fail "POST /api/admin/sales returned $code"

body=$(curl -sS "$BASE/api/admin/sales/$SALE_ID")
echo "$body" | grep -q '"totalCents":1350' || fail "totals did not match after POST: $body"
echo "ok: sale posted and read back"

pkill -f "tsx server/index.ts" 2>/dev/null
wait_down || fail "server did not shut down"
start_server
wait_up || fail "server did not restart"
echo "ok: server restarted"

body=$(curl -sS "$BASE/api/admin/sales/$SALE_ID")
echo "$body" | grep -q '"totalCents":1350' || fail "sale did not survive the restart: $body"
echo "ok: sale survived the restart"

body=$(curl -sS -X PUT "$BASE/api/admin/sales/$SALE_ID" \
  -H 'Content-Type: application/json' -d '{"totalCents":1400,"status":"refunded"}')
echo "$body" | grep -q '"totalCents":1400' || fail "updateSale did not persist the total: $body"
echo "$body" | grep -q '"status":"refunded"' || fail "updateSale did not persist the status: $body"
echo "ok: updateSale persisted"

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/employees" \
  -H 'Content-Type: application/json' -d '{"id":"e1","name":"Sam"}')
[ "$code" = "501" ] || fail "employees should still answer 501, got $code"
echo "ok: employees still answer 501"

echo "ALL CHECKS PASSED"
