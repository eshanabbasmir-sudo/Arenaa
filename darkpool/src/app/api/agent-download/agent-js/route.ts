// GET /api/agent-download/agent-js — returns the agent source as plain text.
// Used by install-agent.sh when /public/download/agent/agent.js is unavailable.
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET() {
  try {
    const path = join(process.cwd(), "public", "download", "agent", "agent.js");
    const src = readFileSync(path, "utf8");
    return new NextResponse(src, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "agent source not found: " + e.message }, { status: 500 });
  }
}
