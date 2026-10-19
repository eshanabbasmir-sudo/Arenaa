# DARKPOOL Security

## Threat model

DARKPOOL assumes:
- The **Main VPS** is trusted (control plane)
- Each **Supporter VPS** is trusted but may be compromised (worker)
- The **network** between Main and workers may be hostile (use TLS in production)
- **Users** of workspaces are mutually untrusted (must be isolated from each other)

## Authentication

### Dashboard users

- Email + password login
- Passwords hashed with **bcrypt** (configurable rounds, default 10)
- Session is a **JWT** stored in an **httpOnly, same-site=lax** cookie
- Session TTL configurable (default 24h)
- First login auto-creates a bootstrap admin (one-time) — this is logged
- All sessions tracked in `Session` table (can be revoked)

### Worker agents

- Each worker has its own **per-node bearer token** (32 bytes of crypto randomness)
- Token is **hashed** with bcrypt before storage in `NodeCredential` table
- Token sent in `Authorization: Bearer <token>` header + `X-DarkPool-Node: <nodeId>` header
- Tokens can be **rotated** by admin at any time — old token immediately invalidated
- Registration requires a **one-time token** (24h expiry, single-use)

## Authorization (RBAC)

User roles: `admin` (full access), `operator` (no settings/node-removal), `viewer` (read-only).
Role stored on `User.role`, checked on every mutation endpoint.

A compromised worker's agent token only authorizes actions for **that specific node** — it cannot:
- List other workers
- Create workloads on other nodes
- Modify Main configuration
- Access the database

## Container isolation

Docker workloads run with:
```
--cap-drop ALL                    # drop all Linux capabilities
--security-opt no-new-privileges  # prevent privilege escalation
--pids-limit 1000                 # prevent fork bombs
--memory Nm --memory-swap Nm     # enforce RAM limit
--cpus N                          # enforce CPU limit
--network bridge                  # default bridge (no host network)
-v /workspace (per-workload)      # isolated filesystem
```

**NEVER**:
- Mount the Docker socket into a workload
- Use `--privileged`
- Use `--network host`
- Mount host paths other than the per-workload data dir

### Subprocess fallback

When Docker is unavailable, workloads run as `/bin/sh -c <cmd>` with:
- `ulimit -v <ramMb*1024>` (virtual memory cap)
- `nice -n 10` (lower CPU priority)
- Per-workload working directory
- `DARKPOOL_WORKSPACE` env var set

This is honestly less isolated than Docker (no namespaces, no cgroups) — the agent reports `runtime: "process"` in node capabilities so the scheduler can filter on it.

## Network security

### Production

- **TLS** terminated at Caddy (Let's Encrypt auto)
- Main↔worker communication over HTTPS with bearer token auth
- Workers should ideally be on a private overlay (WireGuard, Tailscale) — not exposed to public Internet
- No Docker/container API exposed publicly — all workload operations go through Main's authenticated API

### Development

- HTTP localhost only
- No TLS — do NOT use this in production

## Audit logging

Every state-changing event is persisted in the `Event` table with:
- Event type (e.g., `node.registered`, `workload.created`, `auth.failure`)
- Severity (info, warning, error, critical)
- Timestamp
- Related node/workload IDs
- Metadata JSON blob

Admin auth failures are logged with the attempted email and source IP.

## Resource limits & overcommit

- **Overcommit is DISABLED by default** — `OVERCOMMIT_ENABLED=false`
- Per-node reserves (`CPU_RESERVE=1`, `RAM_RESERVE_MB=1024`, `DISK_RESERVE_GB=5`) ensure Main never schedules 100% of a worker
- Workload resource limits are **actually enforced** by Docker (`--cpus`, `--memory`) — not just displayed
- The displayed allocation matches the enforced allocation

## Rate limiting

Default: 120 requests per minute per IP. Configurable via `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`.

Worker agents are exempt from rate limiting on heartbeat endpoints (otherwise they couldn't keep up).

## Input validation

- All API inputs validated for type and reasonable bounds
- Workload `cpuCores` clamped to 1..64
- Workload `ramMb` clamped to 128..65536
- Workload `diskMb` clamped to 512..
- Image names validated against Docker's reference grammar (basic regex)
- Node IDs validated against `[a-z0-9-]+`
- Registration tokens are 24-byte hex strings

## Replay protection

JWT tokens have an `iat` (issued at) claim. If a token's `iat` is older than the user's `updatedAt`, the token is rejected (forces re-login after password change).

Agent tokens have no replay protection at the wire level — but rotating a token immediately invalidates the previous one.

## Secrets management

- `.env` file permissions should be `0600` (root-only)
- Agent config file (`~/.darkpool/agent.json`) is `0600`
- Database stores **hashed** credentials only — never plaintext passwords or tokens
- No secrets logged (logger redacts token/password fields)

## What we do NOT do

- We do NOT expose the Docker socket to anyone (not even admin users via the dashboard)
- We do NOT mount host paths into workloads (other than the per-workload data dir)
- We do NOT modify the host's `/proc`, `/bin/df`, `/bin/free`, `/usr/bin/nproc`
- We do NOT claim that workers' RAM has been physically merged
- We do NOT allow a worker to authenticate as another worker
- We do NOT allow users to access other users' workloads

## Reporting vulnerabilities

Please report security issues to: security@your-org.example

Do NOT open public GitHub issues for security vulnerabilities.

## Hardening checklist for production

- [ ] Set a strong `JWT_SECRET` (32+ random bytes)
- [ ] Use PostgreSQL (not SQLite)
- [ ] Enable TLS (Caddy or your reverse proxy)
- [ ] Put workers on a private overlay (WireGuard/Tailscale)
- [ ] Rotate agent tokens periodically
- [ ] Set up log retention (rotate `dev.log`, `server.log`)
- [ ] Configure firewall: only expose 443 (HTTPS) publicly
- [ ] Back up the database regularly
- [ ] Monitor `Event` table for `auth.failure` spikes
- [ ] Set `OVERCOMMIT_ENABLED=false` (default)
- [ ] Review per-node reserves — increase for production loads
