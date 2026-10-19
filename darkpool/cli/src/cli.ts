#!/usr/bin/env node
// DARKPOOL admin CLI.
// Usage: darkpool <command> [args]
//
// Commands:
//   node list                                  — list all workers
//   node info <nodeId>                         — show worker details
//   node drain <nodeId>                        — drain a worker
//   node enable <nodeId>                       — re-enable a worker
//   node disable <nodeId>                      — disable a worker
//   node remove <nodeId>                       — remove a worker
//   node rotate-token <nodeId>                 — rotate agent token
//   resources                                  — show pool summary
//   workloads                                  — list workloads
//   workload create --name X --cpu N --ram MB --disk MB [--image IMG]
//   workload stop <workloadId>                 — stop & delete a workload
//   info                                       — show darkpool-info (cluster overview)
//   token issue [--label L]                    — issue a worker registration token
//
// Configuration:
//   DARKPOOL_URL — Main API base URL (default: http://localhost:3000)
//   DARKPOOL_EMAIL — admin email
//   DARKPOOL_PASSWORD — admin password
//
//   Or store credentials in ~/.darkpool/credentials.json:
//     { "url": "...", "email": "...", "password": "..." }

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CFG_PATH = join(homedir(), ".darkpool", "credentials.json");

interface Creds { url: string; email: string; password: string; }

function loadCreds(): Creds | null {
  // env first
  if (process.env.DARKPOOL_URL && process.env.DARKPOOL_EMAIL && process.env.DARKPOOL_PASSWORD) {
    return {
      url: process.env.DARKPOOL_URL.replace(/\/+$/, ""),
      email: process.env.DARKPOOL_EMAIL,
      password: process.env.DARKPOOL_PASSWORD,
    };
  }
  if (existsSync(CFG_PATH)) {
    try { return JSON.parse(readFileSync(CFG_PATH, "utf8")); } catch {}
  }
  return null;
}

function saveCreds(c: Creds) {
  try { mkdirSync(join(CFG_PATH, ".."), { recursive: true }); } catch {}
  writeFileSync(CFG_PATH, JSON.stringify(c, null, 2), { mode: 0o600 });
  console.log(`credentials saved to ${CFG_PATH}`);
}

let cachedToken: string | null = null;

async function api(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<any> {
  const creds = loadCreds();
  if (!creds) {
    console.error("error: DARKPOOL_URL / DARKPOOL_EMAIL / DARKPOOL_PASSWORD not configured");
    console.error("       run: darkpool login");
    process.exit(1);
  }
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers as Record<string, string> || {}) };
  if (init.auth !== false) {
    if (!cachedToken) {
      const res = await fetch(`${creds.url}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`login failed: ${res.status} ${text}`);
        process.exit(1);
      }
      // extract cookie from set-cookie header
      const setCookie = res.headers.get("set-cookie") || "";
      const m = setCookie.match(/darkpool_session=([^;]+)/);
      cachedToken = m ? m[1] : "";
    }
    headers["cookie"] = `darkpool_session=${cachedToken}`;
  }
  const res = await fetch(`${creds.url}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error(`error: ${res.status} ${json.error || text}`);
    process.exit(1);
  }
  return json;
}

function fmtBytes(n: number, decimals = 1): string {
  if (!n || n <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

function fmtBytesShort(n: number): string {
  if (!n || n <= 0) return "0B";
  const k = 1024;
  const sizes = ["B", "K", "M", "G", "T", "P"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(i < 2 ? 0 : 1)}${sizes[i]}`;
}

function fmtRelative(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const cmd = args[0];

  if (cmd === "login") {
    // Interactive: prompt for url, email, password
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const url = (await rl.question("Main URL [http://localhost:3000]: ")).trim() || "http://localhost:3000";
    const email = (await rl.question("Admin email: ")).trim();
    const password = (await rl.question("Admin password: ", { terminal: false })).trim();
    rl.close();
    saveCreds({ url: url.replace(/\/+$/, ""), email, password });
    // test
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) console.log("✓ login OK");
    else console.error("✗ login failed");
    return;
  }

  if (cmd === "node") {
    const sub = args[1];
    if (sub === "list") {
      const res = await api("/api/nodes");
      console.log("\nDARKPOOL Workers");
      console.log("─────────────────────────────────────────────────────────────────────");
      console.log("ID              STATUS     CPU  RAM       DISK      WORKLOADS  LAST HEARTBEAT");
      console.log("─────────────────────────────────────────────────────────────────────");
      for (const n of res.nodes || []) {
        const cpu = String(n.cpuCores);
        const wl = String(n.workloadCount ?? 0);
        console.log(
          `${(n.nodeId || "").padEnd(15)} ${(n.status || "").padEnd(10)} ${cpu.padEnd(4)} ${fmtBytesShort(n.ramBytes).padEnd(9)} ${fmtBytesShort(n.diskBytes).padEnd(9)} ${wl.padEnd(10)} ${fmtRelative(n.lastHeartbeatAt)}`
        );
      }
      console.log("");
      return;
    }
    if (sub === "info") {
      const id = args[2];
      if (!id) { console.error("usage: darkpool node info <nodeId>"); process.exit(1); }
      const res = await api(`/api/nodes/${id}`);
      const n = res.node;
      console.log("\nDARKPOOL Worker");
      console.log("────────────────────────────────────────");
      console.log(`Node ID:        ${n.nodeId}`);
      console.log(`Display name:   ${n.displayName || "—"}`);
      console.log(`Status:         ${n.status}`);
      console.log(`Hostname:       ${n.hostname || "—"}`);
      console.log(`OS:             ${n.os || "—"} ${n.architecture || ""}`);
      console.log(`Kernel:         ${n.kernel || "—"}`);
      console.log(`Runtime:        ${n.containerRuntime || "—"}`);
      console.log(`Features:       ${(n.features || []).join(", ") || "—"}`);
      console.log(`CPU:            ${n.cpuCores} cores`);
      console.log(`RAM:            ${fmtBytes(n.ramBytes)}`);
      console.log(`Disk:           ${fmtBytes(n.diskBytes)}`);
      console.log(`Last heartbeat: ${fmtRelative(n.lastHeartbeatAt)}`);
      console.log(`Registered:     ${fmtRelative(n.registeredAt)}`);
      const r = n.resources;
      if (r) {
        console.log("");
        console.log("Live resources (from latest heartbeat):");
        console.log(`  CPU usage:    ${r.cpuUsagePct?.toFixed(1)}%`);
        console.log(`  Load avg:     ${r.loadAvg1?.toFixed(2)} ${r.loadAvg5?.toFixed(2)} ${r.loadAvg15?.toFixed(2)}`);
        console.log(`  RAM used:     ${fmtBytes(r.ramUsed)} / ${fmtBytes(r.ramTotal)}`);
        console.log(`  RAM avail:    ${fmtBytes(r.ramAvailable)}`);
        console.log(`  Disk used:    ${fmtBytes(r.diskUsed)} / ${fmtBytes(r.diskTotal)}`);
        console.log(`  Disk avail:   ${fmtBytes(r.diskAvailable)}`);
        console.log(`  Net RX/TX:    ${fmtBytes(r.netRxBytes)} / ${fmtBytes(r.netTxBytes)}`);
        console.log(`  Uptime:       ${Math.floor((r.uptime || 0) / 60)}m`);
      }
      console.log("");
      return;
    }
    if (sub === "drain") {
      const id = args[2];
      await api(`/api/nodes/${id}/drain`, { method: "POST" });
      console.log(`✓ ${id} set to draining`);
      return;
    }
    if (sub === "enable") {
      const id = args[2];
      await api(`/api/nodes/${id}/enable`, { method: "POST" });
      console.log(`✓ ${id} enabled`);
      return;
    }
    if (sub === "disable") {
      const id = args[2];
      await api(`/api/nodes/${id}/disable`, { method: "POST" });
      console.log(`✓ ${id} disabled`);
      return;
    }
    if (sub === "remove") {
      const id = args[2];
      await api(`/api/nodes/${id}`, { method: "DELETE" });
      console.log(`✓ ${id} removed`);
      return;
    }
    if (sub === "rotate-token") {
      const id = args[2];
      const res = await api(`/api/nodes/${id}/rotate-token`, { method: "POST" });
      console.log(`✓ new agent token for ${id}:`);
      console.log(`  ${res.token}`);
      console.log("  (store this on the worker VPS)");
      return;
    }
    console.error(`unknown node subcommand: ${sub}`);
    process.exit(1);
  }

  if (cmd === "resources") {
    const res = await api("/api/resources");
    const p = res.pool;
    console.log("\nDARKPOOL Resource Pool");
    console.log("──────────────────────────────────────────────");
    console.log("PHYSICAL NODES:");
    for (const n of p.nodes) {
      console.log(`  ${n.nodeId.padEnd(16)} ${n.status.padEnd(10)} ${n.cpuCores}CPU ${fmtBytesShort(n.ramBytes)} RAM ${fmtBytesShort(n.diskBytes)} disk`);
    }
    console.log("");
    console.log("VIRTUAL POOL (scheduling abstraction — physical resources are NOT merged):");
    console.log(`  CPU:     ${p.total.cpuCores} cores total / ${p.allocated.cpuCores} allocated / ${p.available.cpuCores} available`);
    console.log(`  RAM:     ${fmtBytes(p.total.ramBytes)} total / ${fmtBytes(p.allocated.ramBytes)} allocated / ${fmtBytes(p.available.ramBytes)} available`);
    console.log(`  Disk:    ${fmtBytes(p.total.diskBytes)} total / ${fmtBytes(p.allocated.diskBytes)} allocated / ${fmtBytes(p.available.diskBytes)} available`);
    console.log("");
    console.log(`Workers: ${p.workers.online} online / ${p.workers.offline} offline / ${p.workers.total} total`);
    console.log("");
    return;
  }

  if (cmd === "workloads") {
    const res = await api("/api/workloads");
    console.log("\nDARKPOOL Workloads");
    console.log("───────────────────────────────────────────────────────────────────────");
    console.log("ID           STATUS     WORKER          CPU  RAM       DISK      CREATED");
    console.log("───────────────────────────────────────────────────────────────────────");
    for (const w of res.workloads || []) {
      const cpu = `${w.cpuLimit}`;
      const ram = fmtBytesShort(w.ramLimitMb * 1024 * 1024);
      const disk = fmtBytesShort(w.diskLimitMb * 1024 * 1024);
      console.log(`${w.workloadId.padEnd(12)} ${w.status.padEnd(10)} ${(w.nodeId || "—").padEnd(15)} ${cpu.padEnd(4)} ${ram.padEnd(9)} ${disk.padEnd(9)} ${fmtRelative(w.createdAt)}`);
    }
    console.log("");
    return;
  }

  if (cmd === "workload") {
    const sub = args[1];
    if (sub === "create") {
      const flags: Record<string, string> = {};
      for (let i = 2; i < args.length; i += 2) {
        const k = args[i].replace(/^--/, "");
        flags[k] = args[i + 1];
      }
      const body = {
        name: flags.name || `workspace-${Math.random().toString(36).slice(2, 6)}`,
        image: flags.image || "ubuntu:22.04",
        command: flags.command || null,
        cpuCores: Number(flags.cpu) || 1,
        ramMb: Number(flags.ram) || 512,
        diskMb: Number(flags.disk) || 1024,
      };
      const res = await api("/api/workloads", { method: "POST", body: JSON.stringify(body) });
      console.log(`✓ created ${res.workloadId} → assigned to ${res.schedule?.selectedNodeId || "—"}`);
      return;
    }
    if (sub === "stop") {
      const id = args[2];
      await api(`/api/workloads/${id}`, { method: "DELETE" });
      console.log(`✓ ${id} stopped & deleted`);
      return;
    }
    console.error(`unknown workload subcommand: ${sub}`);
    process.exit(1);
  }

  if (cmd === "token") {
    const sub = args[1];
    if (sub === "issue") {
      const labelIdx = args.indexOf("--label");
      const label = labelIdx >= 0 ? args[labelIdx + 1] : null;
      const res = await api("/api/registration-tokens", { method: "POST", body: JSON.stringify({ label }) });
      console.log("Registration token (expires in 24h):");
      console.log(`  ${res.token}`);
      console.log("");
      console.log("Install on the supporter VPS:");
      console.log(`  MAIN_URL=<your-main-url> REGISTRATION_TOKEN=${res.token} curl -fsSL <main-url>/install-agent.sh | bash`);
      return;
    }
    console.error(`unknown token subcommand: ${sub}`);
    process.exit(1);
  }

  if (cmd === "info") {
    await printDarkpoolInfo();
    return;
  }

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  console.error(`unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

async function printDarkpoolInfo() {
  const res = await api("/api/resources");
  const p = res.pool;
  console.log("");
  console.log("       .---.");
  console.log("      /     \\              DARKPOOL");
  console.log("     /  POOL  \\            ────────────────────────────");
  console.log("    /___________\\          One control plane. Multiple machines.");
  console.log("");
  console.log("CLUSTER RESOURCE POOL");
  console.log(`  CPU:     ${p.total.cpuCores} cores (${p.allocated.cpuCores} allocated, ${p.available.cpuCores} available)`);
  console.log(`  Memory:  ${fmtBytes(p.total.ramBytes)} (${fmtBytes(p.allocated.ramBytes)} allocated, ${fmtBytes(p.available.ramBytes)} available)`);
  console.log(`  Storage: ${fmtBytes(p.total.diskBytes)} (${fmtBytes(p.allocated.diskBytes)} allocated, ${fmtBytes(p.available.diskBytes)} available)`);
  console.log("");
  console.log("WORKERS");
  console.log(`  ${p.workers.online} online / ${p.workers.offline} offline / ${p.workers.draining} draining / ${p.workers.total} total`);
  for (const n of p.nodes) {
    console.log(`  ${n.nodeId.padEnd(16)} ${n.status.padEnd(10)} ${n.cpuCores}CPU ${fmtBytesShort(n.ramBytes)} RAM ${fmtBytesShort(n.diskBytes)} disk`);
  }
  console.log("");
  console.log("NOTE: The pool total is a scheduling abstraction. Each worker is a");
  console.log("separate physical VPS — RAM/CPU are NOT merged across machines.");
  console.log("");
}

function printHelp() {
  console.log(`
DARKPOOL CLI v1.0.0 — admin control plane

USAGE
  darkpool <command> [args]

AUTH
  darkpool login                                  configure credentials (interactive)

NODES
  darkpool node list                              list all workers
  darkpool node info <nodeId>                     show worker details
  darkpool node drain <nodeId>                    stop scheduling new workloads
  darkpool node enable <nodeId>                   re-enable a worker
  darkpool node disable <nodeId>                  disable a worker
  darkpool node remove <nodeId>                   remove a worker from the pool
  darkpool node rotate-token <nodeId>             rotate agent token

RESOURCES
  darkpool resources                              show pool summary
  darkpool info                                   show cluster overview (darkpool-info)

WORKLOADS
  darkpool workloads                              list workloads
  darkpool workload create --name X --cpu N --ram MB --disk MB [--image IMG] [--command CMD]
  darkpool workload stop <workloadId>             stop & delete a workload

TOKENS
  darkpool token issue [--label L]                issue a worker registration token

ENVIRONMENT
  DARKPOOL_URL          Main API URL
  DARKPOOL_EMAIL        admin email
  DARKPOOL_PASSWORD     admin password

For user-facing commands inside workspaces, see:
  darkpool-info     cluster overview
  darkpool df       virtual storage pool
  darkpool free     virtual memory pool
  darkpool nproc    cluster CPU cores
`);
}

main().catch((e) => {
  console.error("fatal:", e.message);
  process.exit(1);
});
