#!/usr/bin/env bash
# Weekly: restore the latest R2 dump into scratch DB restore_test, check counts + ledger balance, drop it.
set -euo pipefail

: "${POSTGRES_DB:?}" "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_BUCKET:?}"
export PGHOST="${PGHOST:-postgres}"
export PGUSER="${POSTGRES_USER:-deepkhata}"
export PGPASSWORD="${POSTGRES_PASSWORD:?}"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACL=private

SCRATCH=restore_test
work="$(mktemp -d)"
cleanup() {
  psql -d postgres -qc "DROP DATABASE IF EXISTS ${SCRATCH}" || true
  rm -rf "$work"
}
trap cleanup EXIT

latest="$(rclone lsf "r2:${R2_BUCKET}/daily/" --files-only | sort | tail -n 1)"
if [[ -z "$latest" ]]; then
  echo "[restore-test] FAIL: no dumps found in r2:${R2_BUCKET}/daily/" >&2
  exit 1
fi
echo "[restore-test] $(date -Is) downloading daily/${latest}"
rclone copyto "r2:${R2_BUCKET}/daily/${latest}" "${work}/${latest}"

psql -d postgres -qc "DROP DATABASE IF EXISTS ${SCRATCH}"
psql -d postgres -qc "CREATE DATABASE ${SCRATCH}"
pg_restore --no-owner --no-privileges -d "$SCRATCH" "${work}/${latest}"

for t in Business Order Transaction Posting ProductInstance; do
  n="$(psql -d "$SCRATCH" -Atc "select count(*) from \"${t}\"")"
  echo "[restore-test] rows ${t}: ${n}"
done

bad="$(psql -d "$SCRATCH" -Atc 'select count(*) from (select "transactionId" from "Posting" group by 1 having sum(amount) <> 0) x')"
echo "[restore-test] unbalanced transactions: ${bad}"
if [[ "$bad" -gt 0 ]]; then
  echo "[restore-test] FAIL: ledger does not balance in restored backup" >&2
  exit 1
fi
echo "[restore-test] $(date -Is) OK (${latest})"
