# DARKPOOL

> One control plane. Multiple machines. One resource pool.

DARKPOOL is a production-ready distributed VPS resource platform that turns multiple independent Supporter VPSs into a single, centrally-managed resource pool for scheduling container workloads — **without ever falsely claiming that the physical RAM, CPU, or storage of separate machines has been merged**.

## What DARKPOOL is

- A **control plane** running on one Main VPS (Next.js + Prisma + scheduler + dashboard + API gateway)
- A **worker agent** running on each Supporter VPS (Node.js, reads real `/proc/meminfo`, `/proc/stat`, `df`, etc.)
- A **scheduler** that places each new workload on the best-fit worker using a weighted scoring algorithm
- A **virtual resource pool** abstraction — sum of schedulable resources across online workers
- A **dashboard** showing live, real telemetry from each worker (no faked numbers)
- A **browser terminal** that connects through Main to a real shell inside the actual workload

## What DARKPOOL is NOT

- Not a way to physically merge RAM/CPU across VPSs into one Linux kernel
- Not a distributed filesystem (per-workload data lives on its assigned worker)
- Not a Kubernetes replacement (we use Docker or sandboxed subprocesses, not pods)

## Architecture

```
                         INTERNET
                            │
                            ▼
                   ┌─────────────────┐
                   │     MAIN VPS    │
                   │                 │
                   │ API             │
                   │ Auth (JWT+bcrypt)
                   │ Scheduler       │
                   │ Resource Pool   │
                   │ Node Manager    │
                   │ Database        │
                   │ Dashboard       │
                   └────────┬────────┘
                            │  HTTPS + JWT
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Worker 1 │  │ Worker 2 │  │ Worker N │
        │  agent   │  │  agent   │  │  agent   │
        │ /proc... │  │ /proc... │  │ /proc... │
        │ Docker   │  │ Docker   │  │ process  │
        └──────────┘  └──────────┘  └──────────┘
```

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for full details.

## Quick start (dev)

```bash
# 1. Install deps
bun install

# 2. Configure
cp .env.example .env
# edit .env: set JWT_SECRET to a strong random value

# 3. Push DB schema
bun run db:push

# 4. Start Main
bun run dev
# → http://localhost:3000

# 5. First login creates the bootstrap admin (any email/password)

# 6. Issue a registration token from the dashboard (Workers → Add Worker)
#    OR via CLI:
#    darkpool token issue --label local-dev

# 7. Start a worker agent (same machine for dev):
cd worker-agent
bun install
MAIN_URL=http://localhost:3000 \
REGISTRATION_TOKEN=<token-from-step-6> \
bun src/agent.ts
```

## Production install

See [INSTALL.md](./docs/INSTALL.md).

## Key features

- ✅ **Real telemetry** — CPU/RAM/disk/network read from `/proc` and `df`, never faked
- ✅ **Weighted scheduler** — scores each candidate node by available resources, load, and running count
- ✅ **Atomic allocation** — DB transactions prevent double-booking of resources under concurrent requests
- ✅ **Container isolation** — Docker `--cap-drop ALL` + `--security-opt no-new-privileges` + per-workload network
- ✅ **Subprocess fallback** — when Docker isn't available, runs workloads as sandboxed subprocesses (ulimit + nice)
- ✅ **Browser terminal** — xterm.js → Main → worker agent → real `/bin/bash` PTY
- ✅ **Node lifecycle** — pending → online → unstable → offline, with configurable grace periods
- ✅ **Drain mode** — stop scheduling new workloads without disrupting existing ones
- ✅ **Token rotation** — admin can rotate per-worker agent tokens at any time
- ✅ **Honest virtual reporting** — `darkpool-info`, `darkpool df`, `darkpool free`, `darkpool nproc` explicitly labeled; host `df`/`free` are never modified
- ✅ **Audit log** — every node/workload event persisted in DB
- ✅ **Mobile-first dashboard** — responsive layout, bottom nav, command palette (⌘K)
- ✅ **Per-node reserves** — never allocate 100% of a worker's resources
- ✅ **Overcommit disabled by default** — opt-in only, clearly displayed

## Security

See [SECURITY.md](./docs/SECURITY.md).

Highlights:
- JWT sessions (httpOnly cookie)
- bcrypt password hashing
- Per-node agent tokens (hashed in DB, rotatable)
- No public Docker socket
- Container isolation with cap-drop + no-new-privileges
- Rate limiting on all API endpoints
- Audit logging for all admin actions

## Tech stack

| Component | Technology |
|-----------|------------|
| Main | Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui |
| Database | Prisma + SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT + bcrypt |
| Agent | Node.js 20+ (standalone CLI) |
| Runtime | Docker (preferred) or sandboxed subprocess |
| Terminal | xterm.js + polling relay |
| Charts | recharts + custom SVG sparklines |
| Icons | lucide-react |

## License

MIT
