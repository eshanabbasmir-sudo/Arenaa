// DARKPOOL worker agent.
// Real, no fake data. Runs on Supporter VPS.

import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, hostname, platform, arch, release } from "node:os";
import { join } from "node:path";
import { env, exit } from "node:process";
const process = globalThis.process;

interface AgentConfig {
  mainUrl: string;
  nodeId?: string;
  nodeToken?: string;
  registrationToken?: string;
  heartbeatIntervalMs: number;
  resourceRefreshMs: number;
  pollIntervalMs: number;
  statePath: string;
  runtime: "auto" | "docker" | "process";
  dataDir: string;
}

function loadConfig(): AgentConfig {
  const cfgPath = env.DARKPOOL_AGENT_CONFIG || join(homedir(), ".darkpool", "agent.json");
  let fileCfg: Record<string, unknown> = {};
  if (existsSync(cfgPath)) {
    try { fileCfg = JSON.parse(readFileSync(cfgPath, "utf8")); } catch {}
  }
  const cfg: AgentConfig = {
    mainUrl: (env.MAIN_URL || (fileCfg.mainUrl as string) || "").replace(/\/+$/, ""),
    nodeId: (env.NODE_ID || (fileCfg.nodeId as string) || undefined),
    nodeToken: (env.NODE_TOKEN || (fileCfg.nodeToken as string) || undefined),
    registrationToken: (env.REGISTRATION_TOKEN || (fileCfg.registrationToken as string) || undefined),
    heartbeatIntervalMs: Number(env.HEARTBEAT_INTERVAL || fileCfg.heartbeatIntervalMs || 10_000),
    resourceRefreshMs: Number(env.RESOURCE_REFRESH_INTERVAL || fileCfg.resourceRefreshMs || 5_000),
    pollIntervalMs: Number(env.POLL_INTERVAL || fileCfg.pollIntervalMs || 5_000),
    statePath: cfgPath,
    runtime: ((env.AGENT_RUNTIME || fileCfg.runtime || "auto") as AgentConfig["runtime"]),
    dataDir: (env.AGENT_DATA_DIR || (fileCfg.dataDir as string) || join(homedir(), ".darkpool", "data")),
  };
  return cfg;
}

function saveConfig(cfg: AgentConfig) {
  try { mkdirSync(join(cfg.statePath, ".."), { recursive: true }); } catch {}
  writeFileSync(cfg.statePath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  console.log(`[agent] state saved to ${cfg.statePath}`);
}

// ─── Real resource measurements (no fabrication) ──────────────────────────────

function readProcMeminfo() {
  try {
    const txt = readFileSync("/proc/meminfo", "utf8");
    const lines = txt.split("\n");
    const map: Record<string, number> = {};
    for (const line of lines) {
      const m = line.match(/^(\w+):\s+(\d+)/);
      if (m) map[m[1]] = Number(m[2]) * 1024;
    }
    const total = map["MemTotal"] || 0;
    const available = map["MemAvailable"] || map["MemFree"] || 0;
    const free = map["MemFree"] || 0;
    const cached = map["Cached"] || 0;
    const used = total - available;
    return { total, available, free, cached, used };
  } catch {
    return { total: 0, available: 0, free: 0, cached: 0, used: 0 };
  }
}

function readProcLoadavg() {
  try {
    const txt = readFileSync("/proc/loadavg", "utf8").trim();
    const parts = txt.split(/\s+/);
    return { avg1: Number(parts[0]) || 0, avg5: Number(parts[1]) || 0, avg15: Number(parts[2]) || 0 };
  } catch {
    return { avg1: 0, avg5: 0, avg15: 0 };
  }
}

// sample CPU usage over a short interval
let prevCpu: { idle: number; total: number } | null = null;
function readCpuUsage(): number {
  try {
    const txt = readFileSync("/proc/stat", "utf8");
    const line = txt.split("\n")[0];
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] || 0;
    const total = parts.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    if (!prevCpu) {
      prevCpu = { idle, total };
      return 0;
    }
    const dTotal = total - prevCpu.total;
    const dIdle = idle - prevCpu.idle;
    prevCpu = { idle, total };
    if (dTotal === 0) return 0;
    return Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100));
  } catch {
    return 0;
  }
}

function readCpuInfo() {
  try {
    const txt = readFileSync("/proc/cpuinfo", "utf8");
    const cores = (txt.match(/^processor\s*:/gm) || []).length;
    const m = txt.match(/model name\s*:\s*(.+)/);
    return { cores: cores || 1, model: m?.[1]?.trim() || "unknown" };
  } catch {
    return { cores: 1, model: "unknown" };
  }
}

function readDiskInfo(mountPoint = "/"): Promise<{ total: number; used: number; available: number; filesystem: string }> {
  return new Promise((resolve) => {
    execFile("df", ["-B1", "--output=source,size,used,avail,target", mountPoint], { timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve({ total: 0, used: 0, available: 0, filesystem: "" });
        return;
      }
      const lines = stdout.trim().split("\n");
      if (lines.length < 2) {
        resolve({ total: 0, used: 0, available: 0, filesystem: "" });
        return;
      }
      const cols = lines[1].trim().split(/\s+/);
      resolve({
        filesystem: cols[0] || "",
        total: Number(cols[1]) || 0,
        used: Number(cols[2]) || 0,
        available: Number(cols[3]) || 0,
      });
    });
  });
}

function readNetBytes() {
  try {
    const txt = readFileSync("/proc/net/dev", "utf8");
    const lines = txt.split("\n").slice(2);
    let rx = 0, tx = 0;
    let iface = "lo";
    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length < 2) continue;
      const name = parts[0].trim();
      if (name === "lo") continue;
      const fields = parts[1].trim().split(/\s+/).map(Number);
      rx += fields[0] || 0;
      tx += fields[8] || 0;
      iface = name;
    }
    return { rx, tx, interface: iface };
  } catch {
    return { rx: 0, tx: 0, interface: "" };
  }
}

function readUptime() {
  try {
    const txt = readFileSync("/proc/uptime", "utf8");
    return Math.floor(Number(txt.split(" ")[0]) || 0);
  } catch {
    return 0;
  }
}

// ─── Runtime detection ─────────────────────────────────────────────────────────

async function detectRuntime(cfg: AgentConfig): Promise<"docker" | "process"> {
  if (cfg.runtime === "docker") return "docker";
  if (cfg.runtime === "process") return "process";
  return new Promise((resolve) => {
    execFile("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        console.log("[agent] Docker not available, using process workloads");
        resolve("process");
      } else {
        console.log(`[agent] Docker ${stdout.trim()} detected`);
        resolve("docker");
      }
    });
  });
}

// ─── Workload execution ────────────────────────────────────────────────────────

interface RunningWorkload {
  workloadId: string;
  containerId?: string;
  pid?: number;
  runtime: "docker" | "process";
  child?: ChildProcess;
  startedAt: number;
}

const runningWorkloads = new Map<string, RunningWorkload>();

async function startWorkload(cfg: AgentConfig, runtime: "docker" | "process", instr: {
  workloadId: string; name: string; image: string; command?: string | null;
  cpuCores: number; ramMb: number; diskMb: number;
}): Promise<{ ok: boolean; containerId?: string; pid?: number; error?: string }> {
  const wd = join(cfg.dataDir, instr.workloadId);
  try { mkdirSync(wd, { recursive: true }); } catch {}

  if (runtime === "docker") {
    return new Promise((resolve) => {
      const args = [
        "run", "-d",
        "--name", `darkpool-${instr.workloadId}`,
        "--cpus", String(instr.cpuCores),
        "--memory", `${instr.ramMb}m`,
        "--memory-swap", `${instr.ramMb}m`,
        "--pids-limit", "1000",
        "--restart", "no",
        "-v", `${wd}:/workspace`,
        "-w", "/workspace",
        "--network", "bridge",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        instr.image,
        ...(instr.command ? ["sh", "-c", instr.command] : ["sleep", "infinity"]),
      ];
      const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "", errOut = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (errOut += d.toString()));
      child.on("error", (e) => resolve({ ok: false, error: `docker spawn failed: ${e.message}` }));
      child.on("exit", (code) => {
        if (code !== 0) {
          resolve({ ok: false, error: `docker run exit ${code}: ${errOut.trim()}` });
        } else {
          const containerId = out.trim();
          runningWorkloads.set(instr.workloadId, {
            workloadId: instr.workloadId, containerId, runtime: "docker", startedAt: Date.now(),
          });
          resolve({ ok: true, containerId });
        }
      });
    });
  }

  // process-based fallback
  return new Promise((resolve) => {
    const cmd = instr.command || "sleep infinity";
    const child = spawn("/bin/sh", ["-c", cmd], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
      cwd: wd,
      env: { ...env, DARKPOOL_WORKSPACE: instr.workloadId, DARKPOOL_MAIN: cfg.mainUrl },
    });
    if (!child.pid) {
      resolve({ ok: false, error: "failed to spawn workload process" });
      return;
    }
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
    // Drain stdout/stderr to prevent buffer deadlock; we don't care about output here.
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});
    child.on("exit", (code, signal) => {
      console.log(`[agent] workload ${instr.workloadId} exited (code=${code} signal=${signal})`);
      runningWorkloads.delete(instr.workloadId);
      // Report the workload as stopped if it exits unexpectedly
      reportWorkloadStatus(cfg, instr.workloadId, "stopped", {}).catch(() => {});
    });
    // NOTE: do NOT call child.unref() — we want the child to remain alive and tracked.
    runningWorkloads.set(instr.workloadId, {
      workloadId: instr.workloadId, pid: child.pid, runtime: "process", child, startedAt: Date.now(),
    });
    console.log(`[agent] workload ${instr.workloadId} started (pid=${child.pid}, cmd=${cmd})`);
    resolve({ ok: true, pid: child.pid });
  });
}

async function stopWorkload(workloadId: string): Promise<{ ok: boolean; error?: string }> {
  const w = runningWorkloads.get(workloadId);
  if (!w) return { ok: true };
  if (w.runtime === "docker" && w.containerId) {
    return new Promise((resolve) => {
      const c1 = spawn("docker", ["stop", "-t", "5", w.containerId!], { stdio: "ignore" });
      c1.on("exit", () => {
        const c2 = spawn("docker", ["rm", "-f", w.containerId!], { stdio: "ignore" });
        c2.on("exit", () => {
          runningWorkloads.delete(workloadId);
          resolve({ ok: true });
        });
      });
      c1.on("error", () => resolve({ ok: false, error: "docker stop failed" }));
    });
  }
  if (w.child) {
    try { w.child.kill("SIGTERM"); } catch {}
    setTimeout(() => { try { w.child?.kill("SIGKILL"); } catch {} }, 2000);
  }
  runningWorkloads.delete(workloadId);
  return { ok: true };
}

// ─── Terminal sessions ─────────────────────────────────────────────────────────

interface TerminalSession {
  sessionId: string;
  workloadId: string;
  child?: ChildProcess;
  runtime: "docker" | "process";
  containerId?: string;
}

const terminalSessions = new Map<string, TerminalSession>();

async function startTerminal(cfg: AgentConfig, runtime: "docker" | "process", payload: {
  sessionId: string; workloadId: string; containerId?: string; pid?: number; image: string;
}): Promise<{ ok: boolean; error?: string }> {
  let child: ChildProcess;
  if (runtime === "docker" && payload.containerId) {
    child = spawn("docker", ["exec", "-i", payload.containerId, "/bin/bash"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } else {
    const wd = join(cfg.dataDir, payload.workloadId);
    try { mkdirSync(wd, { recursive: true }); } catch {}
    // Use bash -i with a forced interactive prompt via stdio pipe.
    // bash -i without a tty exits immediately, so we use script(1) to allocate a PTY.
    const hasScript = existsSync("/usr/bin/script");
    if (hasScript) {
      child = spawn("/usr/bin/script", ["-qec", "/bin/bash", "/dev/null"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: wd,
        env: {
          PATH: env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          HOME: env.HOME || "/tmp",
          TERM: "xterm-256color",
          PS1: "\\u@darkpool:\\w\\$ ",
          DARKPOOL_WORKSPACE: payload.workloadId,
          DARKPOOL_MAIN: cfg.mainUrl,
        },
      });
    } else {
      // fallback: use /bin/sh (no interactive prompt but won't exit immediately)
      child = spawn("/bin/sh", ["-i"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: wd,
        env: {
          PATH: env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          HOME: env.HOME || "/tmp",
          TERM: "xterm-256color",
          PS1: "darkpool$ ",
          DARKPOOL_WORKSPACE: payload.workloadId,
          DARKPOOL_MAIN: cfg.mainUrl,
        },
      });
    }
  }
  console.log(`[agent] terminal session ${payload.sessionId} started for ${payload.workloadId} (pid=${child.pid})`);
  terminalSessions.set(payload.sessionId, {
    sessionId: payload.sessionId,
    workloadId: payload.workloadId,
    child,
    runtime,
    containerId: payload.containerId,
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    postTerminalOutput(cfg, payload.sessionId, new Uint8Array(chunk));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    postTerminalOutput(cfg, payload.sessionId, new Uint8Array(chunk));
  });
  child.on("exit", (code) => {
    console.log(`[agent] terminal session ${payload.sessionId} exited (code=${code})`);
    postTerminalExit(cfg, payload.sessionId, code ?? 0);
    terminalSessions.delete(payload.sessionId);
  });
  child.on("error", (e) => {
    console.error(`[agent] terminal session ${payload.sessionId} error: ${e.message}`);
    terminalSessions.delete(payload.sessionId);
  });
  return { ok: true };
}

function writeTerminalInput(sessionId: string, data: Uint8Array) {
  const s = terminalSessions.get(sessionId);
  if (!s?.child?.stdin) return;
  s.child.stdin.write(Buffer.from(data));
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function httpJson(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<any> {
  const method = init.method || "GET";
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers || {}) };
  const res = await fetch(url, {
    method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error || text}`);
  return json;
}

// ─── Main agent logic ──────────────────────────────────────────────────────────

async function register(cfg: AgentConfig): Promise<boolean> {
  if (!cfg.mainUrl) { console.error("[agent] MAIN_URL not configured"); return false; }
  if (!cfg.registrationToken) { console.error("[agent] REGISTRATION_TOKEN not configured"); return false; }
  const mem = readProcMeminfo();
  const cpu = readCpuInfo();
  const disk = await readDiskInfo("/");
  const runtime = await detectRuntime(cfg);
  console.log("[agent] registering with Main...");
  try {
    const res = await httpJson(`${cfg.mainUrl}/api/nodes/register`, {
      method: "POST",
      body: {
        registrationToken: cfg.registrationToken,
        hostname: hostname(),
        architecture: arch(),
        os: platform(),
        kernel: release(),
        cpuCores: cpu.cores,
        ramBytes: mem.total,
        diskBytes: disk.total,
        containerRuntime: runtime,
        features: [],
        displayName: hostname(),
      },
    });
    if (!res.ok) { console.error("[agent] registration failed:", res); return false; }
    cfg.nodeId = res.nodeId;
    cfg.nodeToken = res.agentToken;
    saveConfig(cfg);
    console.log(`[agent] registered as ${cfg.nodeId} (CPU=${cpu.cores} RAM=${(mem.total/1024/1024/1024).toFixed(1)}GB disk=${(disk.total/1024/1024/1024).toFixed(1)}GB)`);
    return true;
  } catch (e: any) {
    console.error("[agent] registration error:", e.message);
    return false;
  }
}

async function sendHeartbeat(cfg: AgentConfig): Promise<boolean> {
  if (!cfg.nodeId || !cfg.nodeToken) return false;
  const mem = readProcMeminfo();
  const load = readProcLoadavg();
  const cpu = readCpuUsage();
  const disk = await readDiskInfo("/");
  const net = readNetBytes();
  const up = readUptime();
  try {
    await httpJson(`${cfg.mainUrl}/api/nodes/heartbeat`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.nodeToken}`,
        "x-darkpool-node": cfg.nodeId,
      },
      body: {
        node_id: cfg.nodeId,
        status: "online",
        cpu_usage: cpu,
        ram_used: mem.used,
        ram_total: mem.total,
        ram_available: mem.available,
        ram_cached: mem.cached,
        disk_free: disk.available,
        disk_total: disk.total,
        disk_used: disk.used,
        filesystem: disk.filesystem,
        mount_point: "/",
        load_avg1: load.avg1,
        load_avg5: load.avg5,
        load_avg15: load.avg15,
        net_rx: net.rx,
        net_tx: net.tx,
        net_interface: net.interface,
        uptime: up,
        timestamp: Date.now(),
      },
    });
    return true;
  } catch (e: any) {
    console.warn(`[agent] heartbeat failed: ${e.message}`);
    return false;
  }
}

async function pollInstructions(cfg: AgentConfig, runtime: "docker" | "process") {
  if (!cfg.nodeId || !cfg.nodeToken) return;
  try {
    const res = await httpJson(`${cfg.mainUrl}/api/agent/instructions`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${cfg.nodeToken}`,
        "x-darkpool-node": cfg.nodeId,
      },
    });
    if (!res.instructions || res.instructions.length === 0) return;
    for (const instr of res.instructions) {
      handleInstruction(cfg, runtime, instr).catch((e) =>
        console.error(`[agent] instruction ${instr.type} failed:`, e.message)
      );
    }
  } catch (e: any) {
    if (!String(e.message || "").includes("HTTP 401")) {
      console.warn(`[agent] pollInstructions error: ${e.message}`);
    }
  }
}

async function handleInstruction(cfg: AgentConfig, runtime: "docker" | "process", instr: any) {
  const p = instr.payload || {};
  console.log(`[agent] instruction: ${instr.type} (workload=${p.workloadId ?? "—"})`);
  switch (instr.type) {
    case "start_workload": {
      const res = await startWorkload(cfg, runtime, {
        workloadId: p.workloadId,
        name: p.name,
        image: p.image || "ubuntu:22.04",
        command: p.command,
        cpuCores: p.cpuCores || 1,
        ramMb: p.ramMb || 512,
        diskMb: p.diskMb || 1024,
      });
      await reportWorkloadStatus(cfg, p.workloadId, res.ok ? "running" : "failed", {
        containerId: res.containerId,
        pid: res.pid,
        error: res.error,
      });
      break;
    }
    case "stop_workload":
    case "delete_workload": {
      await stopWorkload(p.workloadId);
      await reportWorkloadStatus(cfg, p.workloadId, "stopped", {});
      break;
    }
    case "exec_terminal": {
      await startTerminal(cfg, runtime, {
        sessionId: p.sessionId,
        workloadId: p.workloadId,
        containerId: p.containerId,
        pid: p.pid,
        image: p.image,
      });
      break;
    }
    case "ping":
      console.log("[agent] ping received");
      break;
  }
}

async function reportWorkloadStatus(cfg: AgentConfig, workloadId: string, status: string, payload: any) {
  try {
    await httpJson(`${cfg.mainUrl}/api/workloads/${workloadId}/status`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.nodeToken}`,
        "x-darkpool-node": cfg.nodeId!,
      },
      body: { status, ...payload },
    });
  } catch (e: any) {
    console.warn(`[agent] report status failed: ${e.message}`);
  }
}

async function postTerminalOutput(cfg: AgentConfig, sessionId: string, data: Uint8Array) {
  try {
    await httpJson(`${cfg.mainUrl}/api/agent/terminal`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.nodeToken}`,
        "x-darkpool-node": cfg.nodeId!,
      },
      body: { sessionId, output: Buffer.from(data).toString("base64") },
    });
  } catch {}
}

async function postTerminalExit(cfg: AgentConfig, sessionId: string, exitCode: number) {
  try {
    await httpJson(`${cfg.mainUrl}/api/agent/terminal`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.nodeToken}`,
        "x-darkpool-node": cfg.nodeId!,
      },
      body: { sessionId, exitCode },
    });
  } catch {}
}

async function pollTerminalInput(cfg: AgentConfig) {
  if (!cfg.nodeId || !cfg.nodeToken) return;
  for (const [sessionId, s] of terminalSessions) {
    try {
      const res = await httpJson(`${cfg.mainUrl}/api/agent/terminal`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${cfg.nodeToken}`,
          "x-darkpool-node": cfg.nodeId!,
        },
        body: { sessionId },
      });
      if (res.input) {
        const bytes = Buffer.from(res.input, "base64");
        writeTerminalInput(sessionId, new Uint8Array(bytes));
      }
      if (res.close) {
        s.child?.kill("SIGTERM");
        terminalSessions.delete(sessionId);
      }
    } catch {}
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const cfg = loadConfig();
  console.log("======================================");
  console.log(" DARKPOOL worker agent v1.0.0");
  console.log("======================================");
  console.log(`[agent] main_url = ${cfg.mainUrl || "(not set)"}`);
  console.log(`[agent] node_id  = ${cfg.nodeId || "(not registered)"}`);
  console.log(`[agent] data_dir = ${cfg.dataDir}`);

  try { mkdirSync(cfg.dataDir, { recursive: true }); } catch {}

  if (!cfg.nodeId || !cfg.nodeToken) {
    const ok = await register(cfg);
    if (!ok) {
      console.error("[agent] registration failed. Exiting.");
      exit(1);
    }
  }

  const runtime = await detectRuntime(cfg);
  console.log(`[agent] runtime = ${runtime}`);

  let heartbeatFailures = 0;
  setInterval(async () => {
    try {
      const ok = await sendHeartbeat(cfg);
      if (ok) {
        heartbeatFailures = 0;
      } else {
        heartbeatFailures++;
        if (heartbeatFailures >= 3) {
          console.warn(`[agent] heartbeat failed ${heartbeatFailures} times — main may be down`);
        }
        if (heartbeatFailures > 30) {
          console.warn("[agent] sustained failure — attempting re-registration");
          const ok = await register(cfg);
          if (ok) heartbeatFailures = 0;
        }
      }
    } catch (e: any) {
      console.warn(`[agent] heartbeat exception: ${e.message}`);
    }
  }, cfg.heartbeatIntervalMs);

  setInterval(async () => {
    try {
      await pollInstructions(cfg, runtime);
    } catch (e: any) {
      console.warn(`[agent] pollInstructions exception: ${e.message}`);
    }
  }, cfg.pollIntervalMs);

  setInterval(async () => {
    try {
      await pollTerminalInput(cfg);
    } catch (e: any) {
      console.warn(`[agent] pollTerminalInput error: ${e.message}`);
    }
  }, 1000);

  await sendHeartbeat(cfg);
  console.log(`[agent] running. Heartbeat every ${cfg.heartbeatIntervalMs}ms. Polling every ${cfg.pollIntervalMs}ms.`);

  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error("[agent] fatal:", e);
  exit(1);
});

process.on("uncaughtException", (e) => {
  console.error("[agent] uncaughtException:", e);
});
process.on("unhandledRejection", (e) => {
  console.error("[agent] unhandledRejection:", e);
});
