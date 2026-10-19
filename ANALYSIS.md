# Repository Analysis — `Arenaa`

Date: 2026-10-19 · Branch: `arena/0ed6ad6d-arenaa` · Base commit: `380ff5d`

## 1. What's actually in this repo

The Git repository itself contains almost nothing:

| Path | Size | Notes |
|---|---|---|
| `README.md` | 8 B | Literally just `# Arenaa` |
| `darkpool (1).zip` | 257 KB | The entire payload |

The zip is not an archive of the repo — it **is** the project. I extracted it to
`darkpool/` so the source is browsable, greppable, and editable:

```
darkpool/            173 files, ~1.2 MB, ~11 700 LOC (6 200 hand-written TS/TSX + 5 400 shadcn/ui)
```

> The extracted tree lives at `/home/user/Arenaa/darkpool/`. Say the word and I'll
> delete it, move it to repo root, or leave the zip untouched instead.

## 2. What DARKPOOL is

A **distributed VPS resource control plane**: one Main VPS (Next.js + Prisma +
scheduler + dashboard) plus a worker agent per Supporter VPS that reads **real**
`/proc/meminfo`, `/proc/stat`, `/proc/net/dev`, `df -B1`. Workloads are placed by a
weighted-scoring scheduler and executed for real (Docker `--cap-drop ALL
--security-opt no-new-privileges`, or sandboxed `/bin/sh` fallback). There's a
browser terminal (xterm.js → Main → agent → real PTY on the worker).

The project's ethical spine is *honest reporting*: it never claims RAM/CPU from
separate machines is physically merged, and it never patches the host's `df`,
`free`, `nproc`, or `/proc`. In-workspace `darkpool-info` / `darkpool df` are
explicitly labelled as a virtual pool.

## 3. Layout of the extracted project

```
darkpool/
├── prisma/schema.prisma        12 models (User, Session, ApiToken, Node, NodeCredential,
│                               NodeResource, Heartbeat, Workload, ResourceAllocation,
│                               Event, AuditLog, MetricPoint, RegistrationToken,
│                               WorkloadTemplate, Alert)  ← BigInt for byte fields
├── src/app/api/                50 route handlers, 1 704 LOC
├── src/lib/                    1 810 LOC — config, auth, resource-pool, scheduler,
│                               node-manager, workload-manager, dispatch, alerts, logger
├── src/components/             3 979 LOC — dashboard SPA (page.tsx is a single
│                               "use client" view switcher, no routing)
├── src/components/ui/          5 397 LOC — 48 shadcn/ui primitives (vendored)
├── worker-agent/src/agent.ts   702 LOC standalone Node CLI (registration → heartbeat
│                               → instruction long-poll → docker/subprocess → PTY)
├── cli/src/                    526 LOC admin CLI (darkpool, darkpool-info, darkpool df)
├── public/scripts/             3 installer shell scripts (2 embed the agent inline)
├── scripts/                    seed-dev, seed-default-admin, agent-watchdog
├── docs/                       ARCHITECTURE.md, INSTALL.md, SECURITY.md
└── worklog.md                  build narrative + known issues
```

## 4. How it actually works (the core loops)

**Telemetry (push, not pull).** Agent registers with a one-time admin-issued token →
gets a per-node bearer token (bcrypt-hashed in `NodeCredential`) → every 10 s POSTs
`/api/nodes/heartbeat` with `Bearer` + `X-DarkPool-Node`. Main's `processHeartbeat`
runs one Prisma `$transaction` that updates `Node.status`, upserts `NodeResource`,
appends a `Heartbeat` row, and writes 4 `MetricPoint` rows. Main never polls workers,
so it scales horizontally to 100+ workers; `sweepNodeHealth()` marks
`unstable` (>30 s) → `offline` (>60 s) opportunistically on list calls.

**Scheduling.** `scoreNode()` applies hard constraints (online, enough
CPU/RAM-effective/disk-effective → otherwise `-Infinity`) then a weighted soft score
over cpu/ram/disk availability minus load and running-count. `allocateWorkload()`
**re-checks inside a `db.$transaction`** so two concurrent requests can't
double-book a node — that's the genuinely well-built part of this codebase.

**Dispatch.** In-memory per-node instruction queue (`start_workload`, `stop_workload`,
`delete_workload`, `exec_terminal`, `ping`). `/api/agent/instructions` also
**reconciles from DB state** — if the queue is empty it scans for workloads in
`scheduling` / `stopping` — so a missed instruction isn't fatal. Terminal bytes ride a
parallel in-memory channel with base64 payloads.

**Resource math** (`resource-pool.ts`): `available = capacity − reserve − allocated`,
computed only for online, non-draining nodes. `pool.total` counts all non-removed
nodes; `pool.available` counts only schedulable ones. Overcommit is off by default.

## 5. Gaps I found between the docs and the code

These are the things worth knowing before you give me commands; several are
security-relevant and all are cheap to fix.

| # | Claim (docs/tests) | Reality in code | Severity |
|---|---|---|---|
| 1 | "Rate limiting on all API endpoints" (README, SECURITY) | `config.rateLimit` exists and is documented; **zero call sites**. No limiting anywhere. | High |
| 2 | RBAC: `admin`/`operator`/`viewer` with "checks on every mutation endpoint" | Only `getCurrentUser()` (authentication) is called on ~45 routes. Grepping for `user.role` in `src/app/api` returns **only the login route**. Any logged-in user is effectively admin. | High |
| 3 | Subprocess fallback uses `ulimit -v` + `nice -n 10` (SECURITY, ARCHITECTURE) | `startWorkload()` spawns plain `/bin/sh -c <cmd>` with no ulimit, no nice. RAM/CPU limits are **not enforced at all** in the process runtime — only Docker enforces them. | High |
| 4 | `cp .env.example .env`; install-main.sh "writes `.env` from `.env.example`" | **`.env.example` does not exist.** Only `.env`, containing a single line pointing at a stale absolute path: `DATABASE_URL=file:/home/z/my-project/db/custom.db`. `db/` is empty. No `prisma/migrations/`. | High (blocks any fresh install) |
| 5 | Default admin `admin@darkpool.local` / `admin` (worklog, seed-dev) | Login route **auto-creates `admin@admin.com` / `admin123!` on every login attempt** if the user is missing, and `seed-default-admin.ts` force-resets that password. A hardcoded weak credential that resurrects itself. | High |
| 6 | JWT replay protection: "token rejected if `iat` older than `user.updatedAt`" | Not implemented. `changeUserPassword` does delete all `Session` rows (good), but no `iat` comparison exists. | Medium |
| 7 | Input validation: "image names validated against Docker's reference grammar", "Node IDs validated against `[a-z0-9-]+`" | Workload cpu/ram/disk/priority/ports *are* clamped properly in `/api/workloads`. Image names and node IDs are **not** validated — `image` goes straight into a `docker run` argv. | Medium |
| 8 | Terminal: agent wires `docker exec` / `script -qec /bin/bash` | Works, but terminal sessions are keyed only by a sessionId and the channels are in-memory — a Main restart silently kills every open session. Also no per-session auth binding beyond "you are logged in". | Medium |
| 9 | `tests/README.md` documents `tests/run-all.ts` + 5 suites, all boxes ticked | `tests/` contains **only the README**. No automated tests exist; the ticked boxes were manual. | Medium |
| 10 | Production install instructions | `install-main.sh` references `https://github.com/your-org/darkpool.git` placeholder; `scripts/agent-watchdog.sh` hardcodes `MAIN_URL=https://x1n9x8z10cm1-d.space-z.ai` and `AGENT_DIR=/home/z/my-project/...` (leftover dev sandbox). `quick-install-agent.sh` has the same host in comments. | Low |
| 11 | Frontend | `src/app/page.tsx` is a 130-line client-side view switcher — no Next routing, so deep links/refresh always land on Dashboard. `topbar.tsx:192` has a `/* TODO settings */`. Worklog notes 10 React 19 setState-in-effect lint warnings. | Low |
| 12 | Build/run | Scripts assume **bun** (`bun .next/standalone/server.js`, `bun install`). Sandbox has Node v22.22.3 + npm 10.9.8, **no bun**. `output: "standalone"` + `reactStrictMode: false` + `ignoreBuildErrors: true` in next.config. | Low |

## 6. Environment readiness

- Node **v22.22.3**, npm **10.9.8**, npx available. **bun is not installed** — I can
  either install it or translate the scripts to npm/next.
- `node_modules` is not installed anywhere (root, `worker-agent/`, `cli/`). Say
  "install deps" and I'll run it in whichever of the three you want.
- No `.env` wired for this sandbox, no database file, no Prisma client generated.

## 7. Commands I can run on your go

- Fix any row of the table above (missing `.env.example`, real RBAC middleware, real
  rate-limit middleware, `ulimit`/`nice` on the subprocess path, remove the
  self-resurrecting weak admin, image-name validation).
- Install deps + `prisma db push` + boot the dev server on `0.0.0.0:3000` for a live
  preview, then register a local worker agent against it for a real end-to-end run.
- Refactors: extract the view switcher into real routes, replace the in-memory
  dispatch/terminal channels with something restart-durable, add the test suites that
  `tests/README.md` already promised.
- Restructure: flatten `darkpool/` to repo root, or split it into `main/` + `agent/`.

I've made **no code changes** — the only addition is the extracted `darkpool/` tree
and this file. Tell me what to do first.
