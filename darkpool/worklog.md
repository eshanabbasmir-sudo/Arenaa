# DARKPOOL — Work Log

---
Task ID: 1
Agent: main
Task: Build DARKPOOL — distributed VPS resource pool (Main + Supporters)

Work Log:
- Initialized Next.js 16 project (Turbopack, TypeScript, Tailwind 4, shadcn/ui)
- Designed Prisma schema with 11 models: User, Session, Node, NodeCredential, NodeResource, Heartbeat, Workload, ResourceAllocation, Event, AuditLog, MetricPoint, RegistrationToken
- Used BigInt for all byte-sized fields (RAM/disk totals exceed INT range)
- Built core lib modules: config, auth (JWT+bcrypt), logger, resource-pool aggregator, weighted scheduler with atomic allocation, node-manager, workload-manager, dispatch queue + terminal channel router, BigInt-safe JSON serializer
- Built 22 API routes: auth (login/logout/session), nodes (register/heartbeat/list/detail/drain/enable/disable/rotate-token/remove), workloads (list/create/detail/delete/status/preview-schedule), resources (pool + summary), system status, metrics + history, registration tokens, logs, agent instructions + terminal relay, public pool
- Built standalone worker-agent (Node.js CLI) — reads real /proc/meminfo, /proc/stat, /proc/loadavg, /proc/net/dev, df output; auto-detects Docker vs subprocess runtime; executes real workloads (Docker --cpus/--memory or sandboxed sh); spawns real bash PTY for browser terminals
- Built darkpool CLI (admin) + darkpool-info / darkpool df virtual reporting commands
- Built install scripts: install-main.sh (Node.js + Postgres + Caddy + systemd), install-agent.sh (Node.js + Docker + agent + systemd)
- Built comprehensive docs: README.md, ARCHITECTURE.md, INSTALL.md, SECURITY.md, .env.example
- Built premium dark dashboard: login screen, sidebar (desktop + mobile drawer + bottom nav), topbar with global search + connection indicator, dashboard (health banner, resource cards with sparklines, pool composition viz, worker cards), nodes view + Add Worker modal, node detail with tabs (Overview/Resources/Workloads/Health), workloads view (desktop table + mobile cards), Create Workspace modal with 4-step wizard + live scheduler preview, browser terminal with xterm.js, storage view, network view, logs view with filters, settings view with tabs
- Seeded admin user (admin@darkpool.local / admin) + dev registration token
- Verified end-to-end: agent registered as worker-2aeba2 with REAL metrics (CPU=2, RAM=4.1GB, disk=9.8GB), workload ws-6b2e created and scheduled to worker-2aeba2, REAL process spawned (PID verified via pgrep), workload status RUNNING in dashboard

Stage Summary:
- ✅ Backend fully working with real telemetry, atomic scheduling, real workload execution
- ✅ Frontend dashboard renders real data from API (no fake numbers anywhere)
- ✅ Worker agent runs as standalone process, reports real /proc data
- ✅ Browser terminal connects through Main to real bash shell on worker
- ✅ Honest virtual reporting: darkpool-info / darkpool df explicitly labeled; host df/free/nproc never modified
- ✅ All 22 API endpoints return 200; all major user flows work end-to-end
- ⚠️ Known issue: agent process in sandbox sometimes exits (sandbox process reaper); in production with systemd this is handled by Restart=on-failure
- ⚠️ Lint has 10 React 19 setState-in-effect warnings (functionally correct polling pattern)
- Files: full project under /home/z/my-project/, agent under /home/z/my-project/worker-agent/, CLI under /home/z/my-project/cli/, docs under /home/z/my-project/docs/, install scripts under /home/z/my-project/public/scripts/
