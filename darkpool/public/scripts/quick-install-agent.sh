#!/usr/bin/env bash
# DARKPOOL quick-start agent installer — self-contained, no download needed.
# Paste this entire block into a terminal on your Supporter VPS.
#
# Usage:
#   export MAIN_URL="https://x1n9x8z10cm1-d.space-z.ai"
#   export REGISTRATION_TOKEN="<your-token>"
#   bash <(curl -fsSL https://x1n9x8z10cm1-d.space-z.ai/scripts/install-agent.sh)
#
# Or if that URL doesn't work, copy-paste this entire file into a terminal.

set -euo pipefail

MAIN_URL="${MAIN_URL:-}"
REGISTRATION_TOKEN="${REGISTRATION_TOKEN:-}"

if [[ -z "$MAIN_URL" || -z "$REGISTRATION_TOKEN" ]]; then
  echo "ERROR: set MAIN_URL and REGISTRATION_TOKEN env vars first:"
  echo "  export MAIN_URL=https://your-main-url"
  echo "  export REGISTRATION_TOKEN=your-token"
  exit 1
fi

echo "============================================"
echo " DARKPOOL worker agent — quick start"
echo "============================================"
echo "Main URL:  $MAIN_URL"
echo "Token:     ${REGISTRATION_TOKEN:0:16}..."
echo ""

# ─── Step 1: Install Node.js 20 if missing ──────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "→ Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - >/dev/null 2>&1
  sudo apt-get install -y nodejs >/dev/null 2>&1
fi
echo "→ Node.js: $(node -v)"

# ─── Step 2: Create agent directory ─────────────────────────────────────────
AGENT_DIR="${AGENT_DIR:-$HOME/darkpool-agent}"
mkdir -p "$AGENT_DIR/data"
cd "$AGENT_DIR"
echo "→ Agent dir: $AGENT_DIR"

# ─── Step 3: Download agent source from Main ────────────────────────────────
echo "→ Downloading agent source..."
# Try multiple URLs in case some don't work
for URL in \
  "$MAIN_URL/api/agent-download/agent-js" \
  "$MAIN_URL/download/agent/agent.js" \
  "$MAIN_URL/scripts/agent.js"; do
  if curl -fsSL "$URL" -o "$AGENT_DIR/agent.js" 2>/dev/null; then
    # Verify it's actually JS (not a 404 HTML page)
    if head -1 "$AGENT_DIR/agent.js" | grep -q "//\|import\|require\|DARKPOOL"; then
      echo "  ✓ downloaded from $URL"
      break
    fi
  fi
done

# If download failed, create the agent inline from a minimal version
if [[ ! -f "$AGENT_DIR/agent.js" ]] || ! head -1 "$AGENT_DIR/agent.js" | grep -q "//\|import\|require\|DARKPOOL"; then
  echo "  ⚠ download failed, using embedded minimal agent"
  cat > "$AGENT_DIR/agent.js" <<'AGENTEOF'
// DARKPOOL minimal agent — embedded fallback
import { spawn, execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, hostname, platform, arch, release } from "node:os";
import { join } from "node:path";
import { env, exit } from "node:process";
const process = globalThis.process;

const MAIN_URL = (env.MAIN_URL || "").replace(/\/+$/, "");
const REGISTRATION_TOKEN = env.REGISTRATION_TOKEN || "";
const HEARTBEAT_INTERVAL = Number(env.HEARTBEAT_INTERVAL || 10000);
const POLL_INTERVAL = Number(env.POLL_INTERVAL || 5000);
const STATE_PATH = env.DARKPOOL_AGENT_CONFIG || join(homedir(), ".darkpool", "agent.json");
const DATA_DIR = env.AGENT_DATA_DIR || join(homedir(), ".darkpool", "data");

function save(cfg) { try { mkdirSync(join(STATE_PATH, ".."), { recursive: true }); writeFileSync(STATE_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 }); } catch {} }
function loadCfg() { try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch { return {}; } }

function readMem() { try { const t = readFileSync("/proc/meminfo","utf8"); const m = {}; t.split("\n").forEach(l => { const x = l.match(/^(\w+):\s+(\d+)/); if (x) m[x[1]] = Number(x[2])*1024; }); return { total: m.MemTotal||0, available: m.MemAvailable||m.MemFree||0, free: m.MemFree||0, cached: m.Cached||0, used: (m.MemTotal||0)-(m.MemAvailable||0) }; } catch { return { total:0,available:0,free:0,cached:0,used:0 }; } }
function readLoad() { try { const p = readFileSync("/proc/loadavg","utf8").trim().split(/\s+/); return { avg1:Number(p[0])||0, avg5:Number(p[1])||0, avg15:Number(p[2])||0 }; } catch { return { avg1:0,avg5:0,avg15:0 }; } }
let prevCpu = null;
function readCpu() { try { const p = readFileSync("/proc/stat","utf8").split("\n")[0].split(/\s+/).slice(1).map(Number); const idle=p[3]||0, total=p.reduce((a,b)=>a+b,0); if (!prevCpu) { prevCpu={idle,total}; return 0; } const dT=total-prevCpu.total, dI=idle-prevCpu.idle; prevCpu={idle,total}; return dT>0 ? Math.max(0,Math.min(100,(1-dI/dT)*100)) : 0; } catch { return 0; } }
function readCpuInfo() { try { const t = readFileSync("/proc/cpuinfo","utf8"); return { cores: (t.match(/^processor\s*:/gm)||[]).length || 1 }; } catch { return { cores: 1 }; } }
function readDisk() { return new Promise(r => { execFile("df",["-B1","--output=source,size,used,avail","/"],{timeout:2000},(e,o)=>{ if(e||!o) return r({filesystem:"",total:0,used:0,available:0}); const c=o.trim().split("\n")[1]?.trim().split(/\s+/)||[]; r({filesystem:c[0]||"",total:Number(c[1])||0,used:Number(c[2])||0,available:Number(c[3])||0}); }); }); }
function readNet() { try { const t = readFileSync("/proc/net/dev","utf8").split("\n").slice(2); let rx=0,tx=0,iface="lo"; for (const l of t) { const p=l.split(":"); if(p.length<2) continue; const n=p[0].trim(); if(n==="lo") continue; const f=p[1].trim().split(/\s+/).map(Number); rx+=f[0]||0; tx+=f[8]||0; iface=n; } return {rx,tx,interface:iface}; } catch { return {rx:0,tx:0,interface:""}; } }
function readUptime() { try { return Math.floor(Number(readFileSync("/proc/uptime","utf8").split(" ")[0])||0); } catch { return 0; } }

async function http(url, init={}) { const h={"content-type":"application/json",...(init.headers||{})}; const r=await fetch(url,{...init,headers:h,body:init.body?JSON.stringify(init.body):undefined,signal:AbortSignal.timeout(30000)}); const t=await r.text(); let j; try{j=t?JSON.parse(t):{};}catch{j={raw:t};} if(!r.ok) throw new Error(`HTTP ${r.status}: ${j.error||t}`); return j; }

async function register(cfg) {
  if (!MAIN_URL || !REGISTRATION_TOKEN) { console.error("MAIN_URL and REGISTRATION_TOKEN required"); return false; }
  const mem=readMem(), cpu=readCpuInfo(), disk=await readDisk();
  try {
    const res = await http(`${MAIN_URL}/api/nodes/register`, { method:"POST", body: {
      registrationToken: REGISTRATION_TOKEN, hostname: hostname(), architecture: arch(), os: platform(), kernel: release(),
      cpuCores: cpu.cores, ramBytes: mem.total, diskBytes: disk.total, containerRuntime: "process", features: [], displayName: hostname()
    }});
    if (!res.ok) { console.error("registration failed:", res); return false; }
    cfg.nodeId = res.nodeId; cfg.nodeToken = res.agentToken; save(cfg);
    console.log(`registered as ${cfg.nodeId} (CPU=${cpu.cores} RAM=${(mem.total/1073741824).toFixed(1)}GB disk=${(disk.total/1073741824).toFixed(1)}GB)`);
    return true;
  } catch (e) { console.error("registration error:", e.message); return false; }
}

async function heartbeat(cfg) {
  if (!cfg.nodeId || !cfg.nodeToken) return false;
  const mem=readMem(), load=readLoad(), cpu=readCpu(), disk=await readDisk(), net=readNet(), up=readUptime();
  try {
    await http(`${MAIN_URL}/api/nodes/heartbeat`, { method:"POST", headers:{authorization:`Bearer ${cfg.nodeToken}`,"x-darkpool-node":cfg.nodeId}, body: {
      status:"online", cpu_usage:cpu, ram_used:mem.used, ram_total:mem.total, ram_available:mem.available, ram_cached:mem.cached,
      disk_free:disk.available, disk_total:disk.total, disk_used:disk.used, filesystem:disk.filesystem, mount_point:"/",
      load_avg1:load.avg1, load_avg5:load.avg5, load_avg15:load.avg15, net_rx:net.rx, net_tx:net.tx, net_interface:net.interface,
      uptime:up, timestamp: Date.now()
    }});
    return true;
  } catch (e) { console.warn(`heartbeat failed: ${e.message}`); return false; }
}

const running = new Map();

async function startWorkload(cfg, p) {
  const wd = join(DATA_DIR, p.workloadId); try { mkdirSync(wd, { recursive: true }); } catch {}
  const cmd = p.command || "sleep infinity";
  const child = spawn("/bin/sh", ["-c", cmd], { stdio:["pipe","pipe","pipe"], cwd: wd, env: { ...env, DARKPOOL_WORKSPACE: p.workloadId, DARKPOOL_MAIN: MAIN_URL } });
  child.stdout?.on("data", () => {}); child.stderr?.on("data", () => {});
  child.on("exit", (code) => { console.log(`workload ${p.workloadId} exited (${code})`); running.delete(p.workloadId); report(cfg, p.workloadId, "stopped", {}); });
  running.set(p.workloadId, { pid: child.pid, child });
  console.log(`workload ${p.workloadId} started (pid=${child.pid}, cmd=${cmd})`);
  await report(cfg, p.workloadId, "running", { pid: child.pid });
}

async function stopWorkload(cfg, p) {
  const w = running.get(p.workloadId);
  if (w?.child) { try { w.child.kill("SIGTERM"); } catch {} setTimeout(() => { try { w.child.kill("SIGKILL"); } catch {} }, 2000); }
  running.delete(p.workloadId);
  await report(cfg, p.workloadId, "stopped", {});
}

async function report(cfg, wid, status, payload) {
  try { await http(`${MAIN_URL}/api/workloads/${wid}/status`, { method:"POST", headers:{authorization:`Bearer ${cfg.nodeToken}`,"x-darkpool-node":cfg.nodeId}, body: { status, ...payload } }); } catch (e) { console.warn(`report failed: ${e.message}`); }
}

async function poll(cfg) {
  if (!cfg.nodeId || !cfg.nodeToken) return;
  try {
    const res = await http(`${MAIN_URL}/api/agent/instructions`, { method:"GET", headers:{authorization:`Bearer ${cfg.nodeToken}`,"x-darkpool-node":cfg.nodeId} });
    if (!res.instructions) return;
    for (const instr of res.instructions) {
      const p = instr.payload || {};
      console.log(`instruction: ${instr.type} (workload=${p.workloadId||"—"})`);
      try {
        if (instr.type === "start_workload") await startWorkload(cfg, p);
        else if (instr.type === "stop_workload" || instr.type === "delete_workload") await stopWorkload(cfg, p);
      } catch (e) { console.error(`instruction ${instr.type} failed:`, e.message); }
    }
  } catch (e) { if (!String(e.message).includes("HTTP 401")) console.warn(`poll error: ${e.message}`); }
}

async function main() {
  let cfg = loadCfg();
  cfg.mainUrl = MAIN_URL;
  if (!cfg.nodeId || !cfg.nodeToken) { if (!await register(cfg)) exit(1); }
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  console.log(`running. Heartbeat every ${HEARTBEAT_INTERVAL}ms. Polling every ${POLL_INTERVAL}ms.`);
  await heartbeat(cfg);
  setInterval(async () => { try { await heartbeat(cfg); } catch (e) { console.warn(`hb: ${e.message}`); } }, HEARTBEAT_INTERVAL);
  setInterval(async () => { try { await poll(cfg); } catch (e) { console.warn(`poll: ${e.message}`); } }, POLL_INTERVAL);
  setInterval(() => {}, 1<<30);
  process.on("uncaughtException", (e) => console.error("uncaught:", e));
  process.on("unhandledRejection", (e) => console.error("unhandled:", e));
}
main().catch((e) => { console.error("fatal:", e); exit(1); });
AGENTEOF
  echo "  ✓ embedded agent written"
fi

# ─── Step 4: Run the agent ──────────────────────────────────────────────────
echo ""
echo "→ Starting agent..."
echo ""
exec node "$AGENT_DIR/agent.js"
