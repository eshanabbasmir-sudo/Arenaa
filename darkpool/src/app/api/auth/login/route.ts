// POST /api/auth/login
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie, hashPassword } from "@/lib/auth";
import { config } from "@/lib/config";
import { recordEvent } from "@/lib/logger";

// Idempotent default admin seeder. Called on every login attempt to ensure
// the user-requested default admin account always exists.
// Override via env: DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD
async function ensureDefaultAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@admin.com";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "admin123!";
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      const passwordHash = await hashPassword(password);
      await db.user.create({
        data: { email, name: "Administrator", passwordHash, role: "admin" },
      });
      await recordEvent({
        type: "auth.bootstrap",
        message: `default admin ${email} auto-created`,
        severity: "info",
      });
    }
  } catch (e) {
    // Never block login on seeder failure
    console.warn("ensureDefaultAdmin failed:", e);
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const { email, password } = body || {};
  if (!email || !password) return NextResponse.json({ error: "missing email or password" }, { status: 400 });

  // Ensure the default admin account always exists (idempotent)
  await ensureDefaultAdmin();

  const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user) return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  if (user.status !== "active") return NextResponse.json({ error: "user disabled" }, { status: 403 });
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordEvent({ type: "auth.failure", message: `failed login for ${email}`, severity: "warning" });
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }
  const token = signSession({ userId: user.id, role: user.role });
  await setSessionCookie(token, config.sessionTtlMs);
  await db.session.create({
    data: {
      userId: user.id, token,
      expiresAt: new Date(Date.now() + config.sessionTtlMs),
      userAgent: req.headers.get("user-agent") ?? null,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
  await recordEvent({ type: "auth.login", message: `${email} logged in`, severity: "info" });
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}
