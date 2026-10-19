# DARKPOOL Tests

This directory documents the test scenarios DARKPOOL must pass.
Automated test scripts are included for the most critical paths.

## Running tests

```bash
# Run all tests
bun run tests/run-all.ts

# Individual tests
bun run tests/test-registration.ts
bun run tests/test-heartbeat.ts
bun run tests/test-scheduler.ts
bun run tests/test-workload-lifecycle.ts
bun run tests/test-failure-recovery.ts
```

## Test scenarios

### Node lifecycle

- [x] **Registration** — agent registers with valid token, gets nodeId + agentToken
- [x] **Authentication** — invalid token rejected; valid token accepted
- [x] **Heartbeat** — agent sends heartbeat, Main updates NodeResource snapshot
- [x] **Offline detection** — agent stops sending, Main marks node unstable (30s) → offline (60s)
- [x] **Reconnection** — agent restarts, Main marks node online again
- [x] **Token rotation** — admin rotates token, old token rejected, new token works

### Resource calculation

- [x] **CPU calculation** — cpuAvailable = cpuCores − allocated − reserve
- [x] **RAM calculation** — ramAvailableEffective = ramAvailable − reserve − allocated
- [x] **Disk calculation** — diskAvailableEffective = diskAvailable − reserve − allocated
- [x] **Aggregation** — pool totals = sum of all non-removed nodes' advertised capacity
- [x] **Reservations** — never allocate more than (capacity − reserve)
- [x] **Resource release** — workload deletion frees allocation

### Scheduler

- [x] **Node selection** — highest score wins
- [x] **Insufficient resources** — node rejected with reason
- [x] **Offline nodes** — never selected
- [x] **Draining nodes** — never selected
- [x] **Multiple simultaneous requests** — atomic allocation via DB transaction

### Security

- [x] **Invalid tokens** — rejected with 401
- [x] **Unauthorized node** — agent A can't access node B's data
- [x] **User isolation** — workload A's data not accessible to workload B
- [x] **API authorization** — all admin endpoints require session cookie
- [x] **Rate limiting** — enforced (120 req/min default)

### Workloads

- [x] **Creation** — POST /api/workloads allocates + enqueues instruction
- [x] **Assignment** — scheduler picks node, agent receives start_workload
- [x] **Start** — agent spawns real Docker/subprocess, reports running
- [x] **Stop** — DELETE /api/workloads/:id stops container/process
- [x] **Failure** — agent reports failed status if spawn fails
- [x] **Recovery** — workload status reconciled on agent restart

## Acceptance test (manual)

The end-to-end acceptance test from the spec:

1. Start Main VPS → ✓ http://localhost:3000
2. Install worker agent on VPS #1 → ✓ `bun src/agent.ts` with MAIN_URL + REGISTRATION_TOKEN
3. Verify Main discovers it → ✓ appears in /api/nodes within 10s
4. Install worker agent on VPS #2 → ✓ (repeat step 2 with new token)
5. Resource test:
   - On every VPS: `free -h`, `df -h`, `nproc` → real values
   - Compare with Main dashboard → ✓ matches advertised capacity
6. Workload test:
   - Create workload through Main → ✓ POST /api/workloads
   - Verify scheduler → ✓ picks best-fit worker
   - Verify real container/process → ✓ `pgrep sleep 7200` shows actual PID
7. Terminal test:
   - Open browser terminal → ✓ xterm.js renders
   - Execute `hostname`, `uname -a`, `nproc`, `free -h`, `df -h` → ✓ real output from worker
8. Failure test:
   - Disconnect Worker 1 → kill agent
   - Main detects OFFLINE within 60s
   - Resources removed from available pool
   - Reconnect Worker 1 → restart agent
   - Main detects ONLINE, resources added back

All acceptance tests pass in the current implementation.
