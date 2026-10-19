// DARKPOOL auth — session/JWT + bcrypt password hashing.
// Uses Web Crypto (argon2 not available without native deps; bcryptjs is pure JS).

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { recordEvent } from "@/lib/logger";

const SESSION_COOKIE = "darkpool_session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSession(payload: { userId: string; role: string }): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.sessionTtlMs / 1000}s`,
  });
}

export function verifySession(token: string): { userId: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string };
    return decoded;
  } catch {
    return null;
  }
}

// Server-side: read session from cookies, return user or null.
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;
  const user = await db.user.findUnique({
    where: { id: payload.userId, status: "active" },
    select: { id: true, email: true, name: true, role: true, status: true, preferences: true, lastLoginAt: true, lastPasswordChangeAt: true },
  });
  return user;
}

export async function setSessionCookie(token: string, maxAgeMs: number) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// For API route handlers — bearer token (worker agent OR user API token) or cookie (dashboard).
export async function authenticateRequest(req: Request) {
  // 1. Bearer token (workers, programmatic)
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Try as a user API token first (db lookup by hashed token)
    const apiToken = await verifyApiToken(token);
    if (apiToken) {
      return { kind: "user" as const, user: apiToken.user, token, apiTokenId: apiToken.id };
    }
    // Try as a session JWT
    const payload = verifySession(token);
    if (payload) {
      const user = await db.user.findUnique({
        where: { id: payload.userId, status: "active" },
      });
      if (user) return { kind: "user" as const, user, token };
    }
    return { kind: "unauthenticated" as const };
  }
  // 2. Cookie (dashboard)
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (match) {
    const token = match[1];
    const payload = verifySession(token);
    if (payload) {
      const user = await db.user.findUnique({
        where: { id: payload.userId, status: "active" },
      });
      if (user) return { kind: "user" as const, user, token };
    }
  }
  return { kind: "unauthenticated" as const };
}

// Verify a user-issued API token (for programmatic dashboard access).
export async function verifyApiToken(token: string): Promise<{ id: string; user: any } | null> {
  // Look up by hash. Since we have many tokens, we iterate (could index by prefix).
  // For perf, store the token's first 8 chars as prefix, look up by that first.
  const prefix = token.slice(0, 8);
  const candidates = await db.apiToken.findMany({
    where: { prefix },
    include: { user: true },
  });
  for (const t of candidates) {
    const valid = await bcrypt.compare(token, t.tokenHash);
    if (valid) {
      if (t.expiresAt && t.expiresAt.getTime() < Date.now()) return null;
      // Update lastUsedAt
      await db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
      return { id: t.id, user: t.user };
    }
  }
  return null;
}

// Authenticate worker agent: hashed token in DB.
export async function authenticateWorker(nodeIdPublic: string, token: string) {
  // nodeIdPublic is the human-friendly "worker-xxxx" — look up the Node row first
  const node = await db.node.findUnique({ where: { nodeId: nodeIdPublic } });
  if (!node) return null;
  const cred = await db.nodeCredential.findUnique({
    where: { nodeId: node.id },
    include: { node: true },
  });
  if (!cred) return null;
  const valid = await bcrypt.compare(token, cred.tokenHash);
  if (!valid) return null;
  if (cred.node.status === "removed" || cred.node.status === "disabled") return null;
  return cred.node;
}

// Generate a cryptographically random token.
export function generateToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a short human-friendly node ID: worker-XXXXXX
export function generateNodeId(): string {
  const arr = new Uint8Array(3);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `worker-${hex}`;
}

// Generate a short workload ID: ws-XXXX
export function generateWorkloadId(): string {
  const arr = new Uint8Array(2);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ws-${hex}`;
}

// ─── Password change ────────────────────────────────────────────────────────

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "user not found" };
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "current password is incorrect" };
  if (newPassword.length < 8) return { ok: false, error: "new password must be at least 8 characters" };
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, lastPasswordChangeAt: new Date() },
  });
  // Invalidate all sessions (force re-login)
  await db.session.deleteMany({ where: { userId } });
  await recordEvent({
    type: "auth.password_changed",
    message: `password changed for ${user.email}`,
    severity: "info",
  });
  return { ok: true };
}

// ─── Email change ───────────────────────────────────────────────────────────

export async function changeUserEmail(userId: string, newEmail: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "user not found" };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: "password is incorrect" };
  const normalized = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false, error: "invalid email format" };
  const existing = await db.user.findUnique({ where: { email: normalized } });
  if (existing && existing.id !== userId) return { ok: false, error: "email already in use" };
  await db.user.update({
    where: { id: userId },
    data: { email: normalized },
  });
  await recordEvent({
    type: "auth.email_changed",
    message: `email changed to ${normalized}`,
    severity: "info",
  });
  return { ok: true };
}

// ─── User preferences ───────────────────────────────────────────────────────

export async function getUserPreferences(userId: string): Promise<Record<string, any>> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  if (!user) return {};
  try { return JSON.parse(user.preferences || "{}"); } catch { return {}; }
}

export async function setUserPreferences(userId: string, prefs: Record<string, any>): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { preferences: JSON.stringify(prefs) },
  });
}
