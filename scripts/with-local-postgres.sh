#!/usr/bin/env bash
# Runs a test against a temporary local PostgreSQL that exists only for this run.
# Production credentials are never passed in: the test starts with an empty environment.
# Usage: scripts/with-local-postgres.sh scripts/published-store.test.mjs
set -euo pipefail
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/gt-pg-XXXXXX)"
PORT="$(( 20000 + RANDOM % 20000 ))"
RUN=()
if [ "$(id -u)" = "0" ]; then id postgres >/dev/null 2>&1 || useradd -r postgres; chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -U gt --auth=trust >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
env -i PATH="$PATH" HOME="$DIR" NODE_NO_WARNINGS=1 TEST_DATABASE_URL="postgres://gt@127.0.0.1:$PORT/postgres" \
  node --experimental-strip-types "$@"
