#!/usr/bin/env bash
# Starts api, client and agency-admin from their production builds (npm run build
# must have already been run). Client and agency-admin use Next's
# output: "standalone", so their .next/static and public assets are copied into
# the standalone bundle first (next start can't serve them on its own), then all
# three run together via concurrently.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

prep_standalone() {
  local app="$1"
  local dir="$ROOT/apps/$app"
  local standalone_app_dir="$dir/.next/standalone/apps/$app"

  if [ ! -f "$standalone_app_dir/server.js" ]; then
    echo "error: $app has no production build (.next/standalone/apps/$app/server.js missing)." >&2
    echo "Run 'npm run build' first." >&2
    exit 1
  fi

  mkdir -p "$standalone_app_dir/.next"
  rm -rf "$standalone_app_dir/.next/static"
  cp -r "$dir/.next/static" "$standalone_app_dir/.next/static"

  if [ -d "$dir/public" ]; then
    rm -rf "$standalone_app_dir/public"
    cp -r "$dir/public" "$standalone_app_dir/public"
  fi
}

if [ ! -f "$ROOT/apps/server/dist/main.js" ]; then
  echo "error: server has no production build (apps/server/dist/main.js missing)." >&2
  echo "Run 'npm run build' first." >&2
  exit 1
fi

prep_standalone client
prep_standalone agency-admin

exec npx concurrently \
  --names api,web,admin \
  --prefix-colors cyan,blue,magenta \
  --kill-others-on-fail \
  "npm run start:prod -w server" \
  "PORT=3000 node apps/client/.next/standalone/apps/client/server.js" \
  "PORT=3001 node apps/agency-admin/.next/standalone/apps/agency-admin/server.js"
