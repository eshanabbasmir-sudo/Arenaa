#!/usr/bin/env node
// darkpool-info — runs INSIDE a workspace, reports cluster overview.
// Reads DARKPOOL_MAIN env var (set by agent) and calls public endpoint.

async function main() {
  const mainUrl = (process.env.DARKPOOL_MAIN || "").replace(/\/+$/, "");
  if (!mainUrl) {
    console.error("darkpool-info: DARKPOOL_MAIN not set. Are you inside a DARKPOOL workspace?");
    process.exit(1);
  }

  let data: any;
  try {
    const res = await fetch(`${mainUrl}/api/public/pool`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e: any) {
    console.error(`darkpool-info: failed to reach Main API: ${e.message}`);
    process.exit(1);
  }

  const p = data.pool;
  const ws = data.workspace;

  function fmtBytes(n: number, decimals = 1): string {
    if (!n || n <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(n) / Math.log(k));
    return `${(n / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
  }

  console.log("");
  console.log("       .---.");
  console.log("      /     \\              DARKPOOL");
  console.log("     /  POOL  \\            ────────────────────────────────────────");
  console.log("    /___________\\          One control plane. Multiple machines.");
  console.log("");
  if (ws) {
    console.log(`WORKSPACE: ${ws.workloadId}`);
    console.log(`WORKER:    ${ws.nodeId}`);
    console.log("");
  }
  console.log("CLUSTER RESOURCE POOL");
  console.log(`  CPU:     ${p.total.cpuCores} cores (${p.allocated.cpuCores} allocated, ${p.available.cpuCores} available)`);
  console.log(`  Memory:  ${fmtBytes(p.total.ramBytes)} (${fmtBytes(p.allocated.ramBytes)} allocated, ${fmtBytes(p.available.ramBytes)} available)`);
  console.log(`  Storage: ${fmtBytes(p.total.diskBytes)} (${fmtBytes(p.allocated.diskBytes)} allocated, ${fmtBytes(p.available.diskBytes)} available)`);
  console.log("");
  console.log("WORKERS");
  console.log(`  ${p.workers.online} online / ${p.workers.offline} offline / ${p.workers.total} total`);
  for (const n of p.nodes) {
    console.log(`  ${n.nodeId.padEnd(16)} ${n.status.padEnd(10)} ${n.cpuCores} CPU / ${fmtBytes(n.ramBytes)} RAM / ${fmtBytes(n.diskBytes)} disk`);
  }
  console.log("");
  if (ws) {
    console.log("YOUR ALLOCATION (enforced by container runtime)");
    console.log(`  CPU:     ${ws.cpuLimit} cores`);
    console.log(`  Memory:  ${fmtBytes(ws.ramLimitMb * 1024 * 1024)}`);
    console.log(`  Storage: ${fmtBytes(ws.diskLimitMb * 1024 * 1024)}`);
    console.log("");
  }
  console.log("MAIN API STATUS");
  console.log(`  URL:       ${mainUrl}`);
  console.log(`  Reachable: yes`);
  console.log("");
  console.log("NOTE");
  console.log("  Cluster totals are a scheduling abstraction. Each worker is a separate");
  console.log("  physical VPS — RAM/CPU are NOT physically merged across machines.");
  console.log("");
}

main();
