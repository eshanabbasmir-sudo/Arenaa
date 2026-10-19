// GET /api/notifications — aggregated notifications (active alerts + recent critical events)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeForJson } from "@/lib/serialize";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // Active alerts (last 7 days)
  const alerts = await db.alert.findMany({
    where: { status: "active", createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  // Recent critical/error events (last 24h)
  const events = await db.event.findMany({
    where: {
      severity: { in: ["error", "critical"] },
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  // Combine into a single feed, sorted by time
  const notifications = [
    ...alerts.map((a) => ({
      id: a.id,
      type: "alert",
      kind: a.type,
      severity: a.severity,
      message: a.message,
      createdAt: a.createdAt,
    })),
    ...events.map((e) => ({
      id: e.id,
      type: "event",
      kind: e.type,
      severity: e.severity,
      message: e.message,
      createdAt: e.createdAt,
    })),
  ].sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  return NextResponse.json(serializeForJson({ ok: true, notifications: notifications.slice(0, 30) }));
}
