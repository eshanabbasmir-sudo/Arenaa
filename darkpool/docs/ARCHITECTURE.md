# DARKPOOL Architecture

## Overview

DARKPOOL is a distributed VPS resource pool with a strict separation between:

1. **Physical reality** — each worker VPS has its own kernel, RAM, CPU, disk, filesystem. These never merge.
2. **Scheduling abstraction** — the Main computes a "virtual pool" of schedulable resources, which is the sum of (advertised capacity − allocations − reserves) across online workers.

The dashboard, API, scheduler, and CLI all distinguish between these two concepts. Inside workspaces, the `darkpool-info`, `darkpool df`, `darkpool free`, and `darkpool nproc` commands explicitly label their output as "virtual pool" / "cluster" — they never modify the host's `df`, `free`, `nproc`, or `/proc`.

## Components

### Main VPS

The Main VPS runs the Next.js application which provides:

- **API server** — REST API for auth, nodes, workloads, resources, metrics
- **Auth** — JWT session cookies for the dashboard, per-node bearer tokens for agents
- **Scheduler** — weighted scoring algorithm, atomic allocation via Prisma transactions
- **Resource pool aggregator** — reads latest NodeResource snapshot per node, sums schedulable capacity
- **Node manager** — registration, heartbeat processing, status transitions, drain, rotate
- **Workload manager** — create/schedule/stop/delete, instruction queue dispatch
- **Dispatch queue** — in-memory per-node instruction queue (Redis-backed in production)
- **Terminal relay** — in-memory channels routing bytes between browser xterm.js and worker PTY
- **Database** — Prisma ORM over SQLite (dev) or PostgreSQL (prod)
- **Dashboard** — Next.js client components, single-page app with view switching
- **Gateway** — Caddy for TLS termination in production

### Worker Agent (`darkpool-agent`)

A standalone Node.js process running on each Supporter VPS. It:

1. Registers with Main using a one-time token (returns a per-node agent token)
2. Sends heartbeats every N seconds with REAL measurements:
   - CPU usage (sampled from `/proc/stat` deltas)
   - RAM (from `/proc/meminfo`)
   - Load average (`/proc/loadavg`)
   - Disk (from `df -B1`)
   - Network (`/proc/net/dev`)
   - Uptime (`/proc/uptime`)
3. Long-polls Main for instructions (start/stop/delete workload, exec terminal)
4. Executes workloads via Docker (preferred) or sandboxed subprocess (fallback)
5. Spawns real `/bin/bash` PTYs for browser terminals
6. Auto-reconnects with exponential backoff on Main failure
7. Stores credentials in `~/.darkpool/agent.json` (mode 0600)

### Workload runtime selection

```
auto → try Docker, fallback to process
docker → docker run --cpus=N --memory=Nm --cap-drop ALL --security-opt no-new-privileges
process → spawn('/bin/sh', ['-c', cmd]) with ulimit -v + nice -n 10
```

When Docker is available, workloads get true Linux namespaces + cgroups isolation. When Docker isn't available (e.g. inside a sandbox that doesn't allow Docker), the agent falls back to subprocess execution with `ulimit` for memory-ish limits and `nice` for CPU priority. This is honestly less isolated than Docker — the agent reports the runtime in node capabilities so the scheduler can filter on it.

## Data flow

### Heartbeat → dashboard

```
Agent reads /proc/meminfo, /proc/stat, df, /proc/net/dev
  → POST /api/nodes/heartbeat (Bearer + X-DarkPool-Node headers)
  → Prisma transaction: update Node.status, upsert NodeResource, write Heartbeat row, write MetricPoint rows
  → Dashboard polls GET /api/resources every 5s, renders updated numbers
```

### Create workload → real container

```
Dashboard: "Create Workspace" modal
  → POST /api/workloads/preview-schedule (real scheduler preview)
  → POST /api/workloads (atomic allocation in DB transaction)
  → enqueue "start_workload" instruction in dispatch queue
  → Agent polls GET /api/agent/instructions, picks up instruction
  → Agent spawns: docker run --cpus=N --memory=Nm darkpool-<workloadId>
  → Agent: POST /api/workloads/:id/status { status: "running", containerId: "..." }
  → Dashboard: workload row updates to RUNNING
```

### Browser terminal → real shell

```
User clicks "Terminal" on a running workload
  → POST /api/terminal/session (creates in-memory TerminalChannel)
  → enqueue "exec_terminal" instruction with sessionId
  → Agent picks up instruction, spawns: docker exec -i <container> /bin/bash
  → Agent wires child.stdout → POST /api/agent/terminal { output: <base64> }
  → Browser polls GET /api/terminal/:sessionId, writes bytes to xterm.js
  → User types → PUT /api/terminal/:sessionId { input: <base64> }
  → Agent polls POST /api/agent/terminal, drains input bytes, writes to child.stdin
```

## Scheduler algorithm

For each candidate node, compute a score:

```
score = w_cpu   * cpuAvailFactor
      + w_ram   * ramAvailFactor
      + w_disk  * diskAvailFactor
      - w_load  * loadFactor
      - w_run   * runningCountFactor
```

Where each factor is normalized to 0..1:
- `cpuAvailFactor = cpuAvailable / cpuCores`
- `ramAvailFactor = ramAvailableEffective / ramAvailable`
- `diskAvailFactor = diskAvailableEffective / diskAvailable`
- `loadFactor = cpuUsagePct / 100`
- `runningCountFactor = ramAllocated / ramTotal`

**Hard constraints** (any failure → score = -∞):
- Node status must be `online` (not draining, disabled, offline)
- `cpuAvailable >= requestedCores`
- `ramAvailableEffective >= requestedRam`
- `diskAvailableEffective >= requestedDisk`

**Atomic allocation**: After the planner picks a winner, the allocator re-checks inside a Prisma `$transaction`. If another concurrent request already grabbed the resources, the transaction throws and the caller gets "no suitable node available".

## Resource pool math

For each worker (only counted if `status === online`):

```
cpuAvailable          = cpuCores − allocatedCpu − cpuReserve
ramAvailableEffective = ramAvailable − ramReserve − allocatedRam
diskAvailableEffective = diskAvailable − diskReserve − allocatedDisk
```

Pool totals:
```
pool.total.cpuCores    = Σ node.cpuCores  (all non-removed nodes)
pool.total.ramBytes    = Σ node.ramBytes
pool.total.diskBytes   = Σ node.diskBytes
pool.allocated.cpuCores = Σ (running workloads' cpuLimit)
pool.available.cpuCores = Σ cpuAvailable (online nodes only)
```

**Important**: the pool total is the sum of advertised capacity. The "available" only counts online, non-draining nodes. If a worker goes offline, its resources immediately drop out of `pool.available` (but stay in `pool.total` as a historical figure — the dashboard explicitly distinguishes).

## Honest virtual reporting

Inside a workspace, the agent sets `DARKPOOL_MAIN` env var. The CLI commands `darkpool-info`, `darkpool df`, `darkpool free`, `darkpool nproc` call `GET /api/public/pool` (unauthenticated, returns only aggregate + own workload allocation).

The host's `df`, `free`, `nproc`, `/proc/cpuinfo` are **never modified**. The dashboard explicitly labels every aggregate number as "RESOURCE POOL" to prevent confusion.

## Failure handling

### Worker goes offline

1. Main's heartbeat sweep marks node `unstable` (after `heartbeatStaleMs`) → `offline` (after `heartbeatOfflineMs`)
2. Node's resources immediately removed from `pool.available`
3. Running workloads on that node marked `unknown`
4. Existing allocations are NOT deleted (the node might come back)
5. After `gracePeriodMs` (default 5m), admin may manually remove workloads
6. When heartbeats resume, node returns to `online`, workloads re-evaluated

### Main is unavailable

The agent detects heartbeat failures, logs warnings after 3 failures, attempts re-registration after 30 failures (~5 minutes). Local workloads keep running independently — they are real Docker containers / processes, not depending on Main to stay alive.

## Scalability

- Main does NOT poll workers; workers push heartbeats (push-based, scales to 100+ workers)
- Heartbeat interval default 10s; configurable per-worker
- Dispatch queue is in-memory (Redis-backed for multi-Main HA in production)
- Prisma transactions serialize allocation for atomicity
- Dashboard polling is client-side (5s default) — server doesn't push unless using WebSockets

## Extensibility

Future hooks (not implemented in v1):
- Multi-Main HA (Postgres + shared dispatch queue)
- Distributed storage (Ceph, Longhorn)
- Worker migration (live container migration)
- GPU workers (advertise as capability)
- ARM workers (advertise as capability)
- Per-user quotas
- Priority queues
- WebSocket live metrics (currently polling)
