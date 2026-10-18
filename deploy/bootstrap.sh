#!/usr/bin/env bash
# One-time VPS bootstrap for Ubuntu 24.04. Run as root, by you, on the server:
#   sudo bash bootstrap.sh "ssh-ed25519 AAAA... you@laptop"
#   (or DEPLOY_PUBKEY="ssh-ed25519 ..." sudo -E bash bootstrap.sh)
# Idempotent: safe to re-run. Secrets are never printed.
set -euo pipefail

DEPLOY_USER="deploy"
PUBKEY="${1:-${DEPLOY_PUBKEY:-}}"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo bash bootstrap.sh <ssh-public-key>)." >&2
  exit 1
fi
if [[ -z "$PUBKEY" ]]; then
  echo "Usage: bootstrap.sh \"<ssh public key>\"  (or set DEPLOY_PUBKEY)" >&2
  exit 1
fi
case "$PUBKEY" in
  ssh-*|ecdsa-*|sk-*) ;;
  *) echo "That does not look like an SSH public key." >&2; exit 1 ;;
esac

export DEBIAN_FRONTEND=noninteractive

echo "==> Packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

echo "==> Timezone Asia/Karachi"
timedatectl set-timezone Asia/Karachi

echo "==> Docker Engine (official apt repo)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "==> Docker log rotation"
install -d /etc/docker
DAEMON_JSON='{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}'
if [[ ! -f /etc/docker/daemon.json ]] || [[ "$(cat /etc/docker/daemon.json)" != "$DAEMON_JSON" ]]; then
  [[ -f /etc/docker/daemon.json ]] && cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
  printf '%s\n' "$DAEMON_JSON" > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker

echo "==> User ${DEPLOY_USER}"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
# Docker group only: no general sudo.
gpasswd -d "$DEPLOY_USER" sudo >/dev/null 2>&1 || true
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "$AUTH_KEYS"
grep -qxF "$PUBKEY" "$AUTH_KEYS" || printf '%s\n' "$PUBKEY" >> "$AUTH_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /opt/deepkhata

echo "==> SSH hardening"
cat > /etc/ssh/sshd_config.d/99-deepkhata.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
SSHD
if sshd -t; then
  systemctl reload ssh || systemctl reload sshd
else
  rm -f /etc/ssh/sshd_config.d/99-deepkhata.conf
  echo "sshd config invalid; drop-in removed, SSH unchanged." >&2
  exit 1
fi

echo "==> Firewall"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban"
cat > /etc/fail2ban/jail.d/deepkhata.local <<'F2B'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
F2B
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> Unattended upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
systemctl enable --now unattended-upgrades

echo "==> Swap (2 GB if none)"
if [[ -z "$(swapon --show --noheadings)" ]]; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

cat <<NEXT

Bootstrap complete. Next steps (do NOT close this root session until step 1 works):
  1. In a NEW terminal verify: ssh ${DEPLOY_USER}@<this-server>   (root and password login are now disabled)
  2. Copy deploy/ to /opt/deepkhata (docker-compose.prod.yml, Caddyfile, backup/, .env.example).
  3. cp .env.example .env; edit it (DOMAIN, secrets, R2_*, COOKIE_DOMAIN); chmod 600 .env
  4. cd /opt/deepkhata && docker compose -f docker-compose.prod.yml up -d
  5. Point Cloudflare DNS (app/api/admin) at this server; see deploy/README.md and MIGRATION.md.
NEXT
