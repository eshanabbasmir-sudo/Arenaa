// GET  /api/api-tokens — list current user's API tokens
// POST /api/api-tokens — create a new API token (returns plaintext once)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, generateToken, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/logger";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const tokens = await db.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, createdAt: true,
    },
  });
  return NextResponse.json({ ok: true, tokens });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = (body.name || "default").toString().slice(0, 100);
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "invalid expiresAt" }, { status: 400 });
  }
  const plainToken = generateToken(32);
  const tokenHash = await hashPassword(plainToken);
  const prefix = plainToken.slice(0, 8);
  const token = await db.apiToken.create({
    data: { userId: user.id, name, tokenHash, prefix, expiresAt },
  });
  await recordEvent({ type: "api_token.created", message: `API token "${name}" created`, severity: "info" });
  // Only return the plaintext once
  return NextResponse.json({
    ok: true,
    id: token.id,
    name: token.name,
    prefix,
    token: plainToken, // <-- only shown this one time
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
  });
}
