#!/usr/bin/env bash
# DARKPOOL — Supporter VPS agent installer.
# Installs the darkpool-agent on a worker VPS.
#
# Usage (one command from Main's dashboard):
#   export MAIN_URL=https://main.example.com
#   export REGISTRATION_TOKEN=<token-from-dashboard>
#   curl -fsSL https://main.example.com/install-agent.sh | bash
#
# This installs:
#   - Node.js 20+ (LTS)
#   - Docker (preferred runtime; agent falls back to subprocess if unavailable)
#   - The darkpool-agent binary
#   - systemd service darkpool-agent.service
#
# Required env vars:
#   MAIN_URL            - Main VPS URL (https://...)
#   REGISTRATION_TOKEN  - one-time token from Main dashboard
#
# Optional env vars:
#   AGENT_RUNTIME       - "auto" | "docker" | "process"
#   HEARTBEAT_INTERVAL  - milliseconds (default: 10000)
#   POLL_INTERVAL       - milliseconds (default: 5000)

set -euo pipefail

YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[agent-install]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }

if [[ $EUID -ne 0 ]]; then
  err "this script must be run as root (use sudo)"
  exit 1
fi

if [[ -z "${MAIN_URL:-}" ]]; then err "MAIN_URL env var required"; exit 1; fi
if [[ -z "${REGISTRATION_TOKEN:-}" ]]; then err "REGISTRATION_TOKEN env var required"; exit 1; fi

INSTALL_DIR="/opt/darkpool-agent"
SERVICE_USER="darkpool-agent"

log "DARKPOOL worker agent installer starting..."
log "Main URL: $MAIN_URL"
log "Install dir: $INSTALL_DIR"

# ─── Node.js ────────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  log "installing Node.js 20 LTS..."
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs >/dev/null
fi
log "node: $(node -v)"

# ─── Docker (preferred runtime) ────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
else
  log "docker already installed: $(docker --version)"
fi

# ─── Service user ──────────────────────────────────────────────────────────
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "creating service user: $SERVICE_USER"
  useradd --system --create-home --shell /bin/bash --home-dir "/home/$SERVICE_USER" "$SERVICE_USER"
fi

# Add to docker group so agent can spawn containers
if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$SERVICE_USER"
fi

# ─── Install agent ─────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent package from Main
log "downloading darkpool-agent package..."
AGENT_URL="${MAIN_URL%/}/download/agent/darkpool-agent.tar.gz"
if curl -fsSL "$AGENT_URL" -o /tmp/darkpool-agent.tar.gz; then
  tar xzf /tmp/darkpool-agent.tar.gz -C "$INSTALL_DIR"
  rm -f /tmp/darkpool-agent.tar.gz
else
  warn "could not download agent package; will create minimal install"
  # fallback: write agent.js directly
  mkdir -p "$INSTALL_DIR/src"
  curl -fsSL "${MAIN_URL%/}/download/agent/agent.js" -o "$INSTALL_DIR/src/agent.js"
  cat > "$INSTALL_DIR/package.json" <<'EOF'
{ "name": "darkpool-agent", "version": "1.0.0", "type": "module",
  "bin": { "darkpool-agent": "./src/agent.js" },
  "scripts": { "start": "node src/agent.js" } }
EOF
fi

# install npm deps
if [[ -f "$INSTALL_DIR/package.json" ]]; then
  cd "$INSTALL_DIR"
  npm install --omit=dev || warn "npm install failed (continuing)"
fi

# ─── Configure ──────────────────────────────────────────────────────────────
mkdir -p "/home/$SERVICE_USER/.darkpool/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "/home/$SERVICE_USER/.darkpool" "$INSTALL_DIR"

CONFIG_FILE="/etc/darkpool-agent.env"
cat > "$CONFIG_FILE" <<EOF
MAIN_URL=$MAIN_URL
REGISTRATION_TOKEN=$REGISTRATION_TOKEN
HEARTBEAT_INTERVAL=${HEARTBEAT_INTERVAL:-10000}
POLL_INTERVAL=${POLL_INTERVAL:-5000}
AGENT_RUNTIME=${AGENT_RUNTIME:-auto}
DARKPOOL_AGENT_CONFIG=/home/$SERVICE_USER/.darkpool/agent.json
EOF
chmod 600 "$CONFIG_FILE"

# ─── systemd service ───────────────────────────────────────────────────────
log "installing systemd service..."
cat > /etc/systemd/system/darkpool-agent.service <<EOF
[Unit]
Description=DARKPOOL Worker Agent
After=network.target docker.service
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$CONFIG_FILE
ExecStart=$(command -v node) src/agent.js
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable darkpool-agent

# ─── Start ──────────────────────────────────────────────────────────────────
log "starting darkpool-agent..."
systemctl restart darkpool-agent

sleep 3

if systemctl is-active --quiet darkpool-agent; then
  log "agent is running ✓"
  log ""
  log "service logs: journalctl -u darkpool-agent -f"
  log ""
  log "Once the agent registers with Main, it will appear in the dashboard."
  log "If registration fails, verify MAIN_URL is reachable and REGISTRATION_TOKEN is valid."
else
  err "agent failed to start; check logs:"
  journalctl -u darkpool-agent --no-pager -n 30
  exit 1
fi
