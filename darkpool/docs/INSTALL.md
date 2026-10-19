# DARKPOOL — Installation Guide

## Prerequisites

- **Main VPS**: Ubuntu 22.04+, 2 vCPU, 4 GB RAM, 20 GB disk, public IP, domain (for TLS)
- **Supporter VPS**: Ubuntu 22.04+, 1 vCPU, 1 GB RAM, 10 GB disk, can reach Main URL
- **Docker** (optional but recommended) on Supporter VPSs for full container isolation

## Install Main VPS

### Option A: One-command install (production)

```bash
export DARKPOOL_REPO=https://github.com/your-org/darkpool.git
export DARKPOOL_DOMAIN=darkpool.example.com
export DARKPOOL_USE_POSTGRES=1
export DARKPOOL_PG_PASSWORD=<strong-password>

curl -fsSL https://raw.githubusercontent.com/your-org/darkpool/main/public/scripts/install-main.sh | bash
```

The script:
1. Installs Node.js 20 LTS, Bun, PostgreSQL, Caddy
2. Creates a `darkpool` service user
3. Clones the repo to `/opt/darkpool`
4. Installs npm dependencies
5. Writes `.env` from `.env.example` (auto-generates `JWT_SECRET`)
6. Runs `prisma db push`
7. Builds Next.js
8. Installs a systemd unit `darkpool.service`
9. Configures Caddy for TLS on your domain

After install:
```bash
sudo systemctl start darkpool
# Visit https://your-domain — first login creates the bootstrap admin
```

### Option B: Manual dev install

```bash
git clone https://github.com/your-org/darkpool.git
cd darkpool
bun install
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET
bun run db:push
bun run dev   # → http://localhost:3000
```

## Install Supporter VPS (worker agent)

### Step 1: Issue a registration token (on Main)

From the dashboard: **Workers → Add Worker → Issue Token**

Or via CLI (run on Main):
```bash
darkpool token issue --label "worker-prod-01"
```

This returns a one-time token (24h expiry).

### Step 2: Run the installer on the Supporter VPS

```bash
export MAIN_URL=https://darkpool.example.com
export REGISTRATION_TOKEN=<token-from-step-1>

curl -fsSL https://darkpool.example.com/install-agent.sh | bash
```

The script:
1. Installs Node.js 20 LTS
2. Installs Docker (if not present)
3. Creates a `darkpool-agent` service user, adds to `docker` group
4. Downloads the agent package from Main
5. Writes `/etc/darkpool-agent.env` with credentials
6. Installs systemd unit `darkpool-agent.service`
7. Starts the agent — it registers automatically with Main

### Verify

```bash
# On Supporter VPS:
systemctl status darkpool-agent
journalctl -u darkpool-agent -f

# On Main dashboard:
# Workers tab — your new worker should appear as ONLINE within ~10s
```

## CLI configuration

Install the admin CLI on your workstation:

```bash
# From a checkout:
cd cli && bun build && npm link

# Or copy dist/cli.js to /usr/local/bin/darkpool

darkpool login   # interactive: prompts for URL, email, password
```

After `darkpool login`, credentials are stored in `~/.darkpool/credentials.json` (mode 0600).

## Verify the install

End-to-end acceptance test:

```bash
# 1. List workers (should show your new worker)
darkpool node list

# 2. Show pool resources
darkpool resources

# 3. Create a workload
darkpool workload create --name test --cpu 1 --ram 512 --disk 1024

# 4. List workloads (should show RUNNING after ~5s)
darkpool workloads

# 5. Open terminal in dashboard → run inside workload:
hostname        # → random container ID
uname -a        # → real kernel of the worker
nproc           # → CPU limit enforced by Docker (--cpus)
darkpool-info   # → cluster overview from inside the workspace
darkpool df     # → virtual pool storage view

# 6. Stop the workload
darkpool workload stop ws-XXXX
```

## Troubleshooting

### Agent doesn't register

- Check `MAIN_URL` is reachable from the Supporter VPS (`curl $MAIN_URL/api/system/status`)
- Check `REGISTRATION_TOKEN` is valid (not expired, not used) — issue a new one if needed
- Check agent logs: `journalctl -u darkpool-agent -n 100`

### Worker shows OFFLINE in dashboard

- Agent process down: `systemctl restart darkpool-agent`
- Network issue between worker and Main: `ping` Main, check firewall
- Main unreachable: check Main is up (`systemctl status darkpool`)

### Workload stuck in "scheduling"

- Agent not polling: check agent logs
- No suitable node: run `darkpool resources` — is there available capacity?
- Insufficient reserves: check `CPU_RESERVE`, `RAM_RESERVE_MB`, `DISK_RESERVE_GB` in `.env`

### Workload "failed"

- Check the agent logs — Docker error?
- Image pull failed: try `docker pull ubuntu:22.04` manually on the worker
- Cap-drop too restrictive for your image: edit agent's `startWorkload` function

## Upgrading

### Main VPS

```bash
cd /opt/darkpool
git pull
bun install
bun run db:push
bun run build
sudo systemctl restart darkpool
```

### Supporter VPS

Re-run the install script — it will re-download the latest agent package and restart the service.
