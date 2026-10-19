#!/usr/bin/env bash
# DARKPOOL — Main VPS installer.
# Installs the DARKPOOL control plane on a fresh Ubuntu 22.04+ VPS.
#
# Usage:
#   curl -fsSL https://your-main-domain/install-main.sh | bash
#
# Or after cloning:
#   bash install-main.sh
#
# This installs:
#   - Node.js 20+ (LTS)
#   - PostgreSQL (or uses embedded SQLite for dev)
#   - The DARKPOOL Next.js app + Prisma + migrations
#   - Caddy (recommended) for TLS reverse proxy
#
# After install, edit .env (set JWT_SECRET, DATABASE_URL, etc.) and start with:
#   systemctl start darkpool

set -euo pipefail

YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[darkpool]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "this script must be run as root (use sudo)"
  exit 1
fi

INSTALL_DIR="${DARKPOOL_INSTALL_DIR:-/opt/darkpool}"
SERVICE_USER="${DARKPOOL_USER:-darkpool}"

log "DARKPOOL Main VPS installer starting..."
log "install dir: $INSTALL_DIR"
log "service user: $SERVICE_USER"

# ─── Dependencies ────────────────────────────────────────────────────────────
log "updating apt and installing base dependencies..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg lsb-release git build-essential >/dev/null

# Node.js 20 LTS
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  log "installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs >/dev/null
fi
log "node: $(node -v)"

# Bun (faster than npm for Next.js dev)
if ! command -v bun >/dev/null 2>&1; then
  log "installing bun..."
  curl -fsSL https://bun.sh/install | bash >/dev/null
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# PostgreSQL (optional — SQLite works for dev)
if [[ "${DARKPOOL_USE_POSTGRES:-0}" == "1" ]]; then
  log "installing PostgreSQL..."
  apt-get install -y -qq postgresql postgresql-contrib >/dev/null
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='darkpool'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE darkpool;"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='darkpool'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER darkpool WITH ENCRYPTED PASSWORD '${DARKPOOL_PG_PASSWORD:-changeme}';" && \
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE darkpool TO darkpool;"
fi

# Caddy for TLS reverse proxy
if ! command -v caddy >/dev/null 2>&1; then
  log "installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ─── Service user ───────────────────────────────────────────────────────────
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "creating service user: $SERVICE_USER"
  useradd --system --create-home --shell /bin/bash --home-dir "/home/$SERVICE_USER" "$SERVICE_USER"
fi

# ─── Clone or copy app ──────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "updating existing repo at $INSTALL_DIR..."
  cd "$INSTALL_DIR"
  git pull --ff-only || warn "git pull failed (continuing)"
else
  log "cloning DARKPOOL to $INSTALL_DIR..."
  if [[ -n "${DARKPOOL_REPO:-}" ]]; then
    git clone --depth 1 "${DARKPOOL_REPO}" "$INSTALL_DIR"
  else
    err "no DARKPOOL_REPO env set; either clone manually or set DARKPOOL_REPO"
    err "for dev, copy the project files manually into $INSTALL_DIR"
    exit 1
  fi
  cd "$INSTALL_DIR"
fi

# ─── Install deps ───────────────────────────────────────────────────────────
log "installing npm dependencies..."
if command -v bun >/dev/null 2>&1; then
  sudo -u "$SERVICE_USER" bun install --production
else
  sudo -u "$SERVICE_USER" npm ci --omit=dev
fi

# ─── .env ──────────────────────────────────────────────────────────────────
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  log "writing .env from .env.example..."
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$INSTALL_DIR/.env"
  warn "edit $INSTALL_DIR/.env to set DATABASE_URL, PUBLIC_URL, etc."
fi

# ─── Database migrations ────────────────────────────────────────────────────
log "running database migrations..."
sudo -u "$SERVICE_USER" npx prisma db push --accept-data-loss

# ─── Build ──────────────────────────────────────────────────────────────────
log "building Next.js app..."
sudo -u "$SERVICE_USER" npx next build

# ─── systemd service ───────────────────────────────────────────────────────
log "installing systemd service..."
cat > /etc/systemd/system/darkpool.service <<EOF
[Unit]
Description=DARKPOOL Main VPS Control Plane
After=network.target postgresql.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$(command -v node)/$(ls $INSTALL_DIR/.next/standalone/server.js 2>/dev/null && echo "$INSTALL_DIR/.next/standalone/server.js" || echo "node_modules/.bin/next start")
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable darkpool

# ─── Caddy config ───────────────────────────────────────────────────────────
if [[ -n "${DARKPOOL_DOMAIN:-}" ]]; then
  log "configuring Caddy for $DARKPOOL_DOMAIN..."
  cat > /etc/caddy/Caddyfile <<EOF
$DARKPOOL_DOMAIN {
  reverse_proxy localhost:3000
  encode gzip
}
EOF
  systemctl restart caddy || systemctl start caddy
fi

# ─── Done ───────────────────────────────────────────────────────────────────
log ""
log "═══════════════════════════════════════════════════════════════════"
log " DARKPOOL Main VPS installation complete!"
log "═══════════════════════════════════════════════════════════════════"
log ""
log "Next steps:"
log "  1. Edit $INSTALL_DIR/.env (set PUBLIC_URL, JWT_SECRET, etc.)"
log "  2. systemctl start darkpool"
log "  3. Open https://your-domain (or http://localhost:3000)"
log "  4. First login creates the bootstrap admin account"
log ""
if [[ -n "${DARKPOOL_DOMAIN:-}" ]]; then
  log "Caddy will auto-provision TLS for $DARKPOOL_DOMAIN"
fi
