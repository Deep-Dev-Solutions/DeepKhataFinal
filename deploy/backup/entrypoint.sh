#!/usr/bin/env bash
# Dump the container env (cron does not inherit it), install the crontab, run cron in the foreground.
set -euo pipefail
ln -sf "/usr/share/zoneinfo/${TZ:-Asia/Karachi}" /etc/localtime
echo "${TZ:-Asia/Karachi}" > /etc/timezone
: > /etc/deepkhata-env
while IFS='=' read -r k v; do
  case "$k" in
    POSTGRES_*|R2_*|PG*|TZ) printf 'export %s=%q\n' "$k" "$v" >> /etc/deepkhata-env ;;
  esac
done < <(env)
chmod 600 /etc/deepkhata-env
crontab /etc/deepkhata-crontab
echo "backup: cron started, TZ=${TZ:-Asia/Karachi}"
exec cron -f
