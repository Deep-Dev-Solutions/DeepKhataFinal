#!/usr/bin/env bash
# Nightly: pg_dump -Fc -> /backups/daily, upload to R2, Sunday copy to weekly/, prune (14 daily, 8 weekly).
set -euo pipefail

: "${POSTGRES_DB:?}" "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}" "${R2_BUCKET:?}"
export PGHOST="${PGHOST:-postgres}"
export PGUSER="${POSTGRES_USER:-deepkhata}"
export PGPASSWORD="${POSTGRES_PASSWORD:?}"

# rclone remote "r2" configured purely from env vars (no config file, no secrets on disk).
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACL=private

KEEP_DAILY=14
KEEP_WEEKLY=8
DAILY_DIR=/backups/daily
WEEKLY_DIR=/backups/weekly
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"

stamp="$(date +%Y%m%d-%H%M)"
file="deepkhata-${stamp}.dump"
tmp="${DAILY_DIR}/.${file}.partial"

echo "[backup] $(date -Is) dumping ${POSTGRES_DB}"
trap 'rm -f "$tmp"' EXIT
pg_dump -Fc -d "$POSTGRES_DB" -f "$tmp"
pg_restore -l "$tmp" >/dev/null   # sanity: archive is readable
mv "$tmp" "${DAILY_DIR}/${file}"
echo "[backup] wrote ${DAILY_DIR}/${file} ($(du -h "${DAILY_DIR}/${file}" | cut -f1))"

rclone copyto "${DAILY_DIR}/${file}" "r2:${R2_BUCKET}/daily/${file}"
echo "[backup] uploaded daily/${file}"

if [[ "$(date +%u)" == "7" ]]; then
  cp "${DAILY_DIR}/${file}" "${WEEKLY_DIR}/${file}"
  rclone copyto "${WEEKLY_DIR}/${file}" "r2:${R2_BUCKET}/weekly/${file}"
  echo "[backup] uploaded weekly/${file}"
fi

prune_local() { # dir keep
  local dir="$1" keep="$2"
  # shellcheck disable=SC2012
  ls -1t "$dir"/deepkhata-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
    echo "[backup] prune local ${old}"
    rm -f -- "$old"
  done
}
prune_remote() { # prefix keep
  local prefix="$1" keep="$2"
  rclone lsf "r2:${R2_BUCKET}/${prefix}/" --files-only | sort -r | tail -n +"$((keep + 1))" | while read -r old; do
    echo "[backup] prune remote ${prefix}/${old}"
    rclone deletefile "r2:${R2_BUCKET}/${prefix}/${old}"
  done
}
prune_local "$DAILY_DIR" "$KEEP_DAILY"
prune_local "$WEEKLY_DIR" "$KEEP_WEEKLY"
prune_remote daily "$KEEP_DAILY"
prune_remote weekly "$KEEP_WEEKLY"

echo "[backup] $(date -Is) done"
