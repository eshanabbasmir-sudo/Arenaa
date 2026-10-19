// GET /api/agent-download/package-json — returns the agent package.json.
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function GET() {
  try {
    const path = join(process.cwd(), "public", "download", "agent", "package.json");
    const src = readFileSync(path, "utf8");
    return new NextResponse(src, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "package.json not found: " + e.message }, { status: 500 });
  }
}
