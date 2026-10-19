// POST /api/registration-tokens — admin issues a token for joining workers
//   Body: { label, maxUses, expiresInHours }
//   maxUses: 1 (single-use, default) | N (multi-use) | -1 (unlimited)
// GET  /api/registration-tokens — list tokens
// DELETE /api/registration-tokens/:id — revoke a token
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, generateToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordEvent } from "@/lib/logger";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const tokens = await db.registrationToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(serializeForJson({
    ok: true,
    tokens: tokens.map((t) => ({
      id: t.id,
      token: t.token, // safe to show again — agents need the value to register
      label: t.label,
      maxUses: t.maxUses,
      useCount: t.useCount,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
      usedByNodeId: t.usedByNodeId,
      isExpired: t.expiresAt.getTime() < Date.now(),
      isExhausted: t.maxUses > 0 && t.useCount >= t.maxUses,
      isActive: t.expiresAt.getTime() > Date.now() && (t.maxUses === -1 || t.useCount < t.maxUses),
    })),
  }));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const token = generateToken(24);
  // maxUses: default 1 (single-use). -1 means unlimited. >1 means N uses.
  const maxUses = body.maxUses === undefined ? 1 : Number(body.maxUses);
  if (!Number.isInteger(maxUses) || maxUses < -1 || maxUses === 0) {
    return NextResponse.json({ error: "maxUses must be -1 (unlimited), 1, or a positive integer" }, { status: 400 });
  }
  const expiresInHours = Number(body.expiresInHours || 24);
  if (expiresInHours < 1 || expiresInHours > 24 * 365) {
    return NextResponse.json({ error: "expiresInHours must be between 1 and 8760" }, { status: 400 });
  }
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const rt = await db.registrationToken.create({
    data: {
      token,
      label: body.label || null,
      maxUses,
      expiresAt,
      createdBy: user.id,
    },
  });
  await recordEvent({
    type: "node.token_issued",
    message: `registration token issued (label: ${body.label || "none"}, maxUses: ${maxUses === -1 ? "unlimited" : maxUses})`,
    severity: "info",
    meta: { label: body.label, maxUses, expiresInHours },
  });
  return NextResponse.json({
    ok: true,
    token: rt.token,
    label: rt.label,
    maxUses: rt.maxUses,
    expiresAt: rt.expiresAt,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await db.registrationToken.deleteMany({ where: { id } });
  await recordEvent({ type: "node.token_revoked", message: `registration token revoked`, severity: "warning" });
  return NextResponse.json({ ok: true });
}
