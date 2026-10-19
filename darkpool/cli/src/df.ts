#!/usr/bin/env node
// darkpool df — runs INSIDE a workspace, reports the VIRTUAL pool storage.
// This is NOT the host's filesystem — it's the cluster's schedulable storage.

async function main() {
  const mainUrl = (process.env.DARKPOOL_MAIN || "").replace(/\/+$/, "");
  if (!mainUrl) {
    console.error("darkpool df: DARKPOOL_MAIN not set.");
    process.exit(1);
  }
  let data: any;
  try {
    const res = await fetch(`${mainUrl}/api/public/pool`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e: any) {
    console.error(`darkpool df: failed: ${e.message}`);
    process.exit(1);
  }
  const p = data.pool;
  const totalGB = p.total.diskBytes / 1024 ** 3;
  const usedGB = p.allocated.diskBytes / 1024 ** 3;
  const availGB = p.available.diskBytes / 1024 ** 3;
  const usePct = totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 0;

  console.log("Filesystem        Size  Used Avail Use%");
  console.log(`darkpool-pool     ${totalGB.toFixed(0)}G  ${usedGB.toFixed(0)}G  ${availGB.toFixed(0)}G  ${usePct}%`);
  console.log("");
  console.log("# This is the DARKPOOL virtual storage pool (aggregated across workers).");
  console.log("# Each worker contributes its own physical disk — they are NOT one filesystem.");
  console.log("# Use the host 'df -h' to see this worker's actual filesystem.");
  console.log("");
  console.log("Per-worker breakdown:");
  for (const n of p.nodes) {
    const t = n.diskBytes / 1024 ** 3;
    const u = (n.diskUsed || 0) / 1024 ** 3;
    const a = (n.diskAvailable || 0) / 1024 ** 3;
    console.log(`${n.nodeId.padEnd(16)} ${t.toFixed(0)}G  ${u.toFixed(0)}G  ${a.toFixed(0)}G  ${(t > 0 ? Math.round(u / t * 100) : 0)}%  ${n.status}`);
  }
}

main();
