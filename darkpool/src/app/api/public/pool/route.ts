// GET /api/public/pool
// Public endpoint (no auth) for darkpool-info / darkpool df / darkpool free / darkpool nproc
// commands running INSIDE workspaces. Returns the resource pool + the requesting workload's
// allocation (identified via X-DarkPool-Workspace header set by the agent).
//
// ALSO serves the agent source code when ?download=agent is passed.
// This is a workaround for Turbopack not serving new files in public/ at runtime.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPoolSnapshot } from "@/lib/resource-pool";
import { serializeForJson } from "@/lib/serialize";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET(req: NextRequest) {
  // Agent source download (for install-agent.sh fallback)
  const url = new URL(req.url);
  if (url.searchParams.get("download") === "agent") {
    try {
      // Try multiple paths where the agent source might live
      const paths = [
        join(process.cwd(), "worker-agent", "src", "agent.ts"),
        join(process.cwd(), "public", "scripts", "agent.js"),
        join(process.cwd(), "public", "download", "agent", "agent.js"),
      ];
      for (const p of paths) {
        try {
          const src = readFileSync(p, "utf8");
          if (src.length > 1000) {
            return new NextResponse(src, {
              headers: {
                "content-type": "application/javascript; charset=utf-8",
                "cache-control": "no-store",
              },
            });
          }
        } catch {}
      }
      return NextResponse.json({ error: "agent source not found" }, { status: 404 });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  const pool = await getPoolSnapshot();
  const workspaceId = req.headers.get("x-darkpool-workspace") || process.env.DARKPOOL_WORKSPACE;
  let workspace: any = null;
  if (workspaceId) {
    const w = await db.workload.findUnique({
      where: { workloadId: workspaceId },
      include: { node: true },
    });
    if (w) {
      workspace = {
        workloadId: w.workloadId,
        nodeId: w.node?.nodeId ?? null,
        cpuLimit: w.cpuLimit,
        ramLimitMb: w.ramLimitMb,
        diskLimitMb: w.diskLimitMb,
        status: w.status,
      };
    }
  }
  return NextResponse.json(serializeForJson({ ok: true, pool, workspace }));
}
