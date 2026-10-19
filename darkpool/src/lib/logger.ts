// DARKPOOL logger — structured, in-memory ring buffer + DB persistence.
// Tail of last N events served to dashboard.

import { db } from "@/lib/db";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

const RING_SIZE = 500;
const ring: LogEntry[] = [];

export function log(level: LogLevel, source: string, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    source,
    message,
    meta,
  };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  if (level !== "debug") {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      `[${new Date(entry.ts).toISOString()}] [${source}] ${message}`
    );
  }
}

export function getRecentLogs(limit = 100): LogEntry[] {
  return [...ring].reverse().slice(0, limit);
}

// Persist an Event row in the DB AND log it.
export async function recordEvent(opts: {
  type: string;
  nodeId?: string;
  workloadId?: string;
  message: string;
  severity?: "info" | "warning" | "error" | "critical";
  meta?: Record<string, unknown>;
}) {
  const severity = opts.severity || "info";
  const level: LogLevel =
    severity === "critical" ? "error" : severity === "error" ? "error" : severity === "warning" ? "warn" : "info";
  log(level, opts.type, opts.message, { ...opts.meta, nodeId: opts.nodeId, workloadId: opts.workloadId });

  try {
    await db.event.create({
      data: {
        type: opts.type,
        nodeId: opts.nodeId ?? null,
        workloadId: opts.workloadId ?? null,
        message: opts.message,
        severity,
        meta: JSON.stringify(opts.meta || {}),
      },
    });
  } catch (e) {
    // never throw from logger
    console.error("recordEvent DB write failed:", e);
  }
}
