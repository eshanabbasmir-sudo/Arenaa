"use client";

import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: string;
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, pulse = true, className }: StatusDotProps) {
  const color = STATUS_COLOR_MAP[status] || "var(--muted-foreground)";
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <span
        className="w-2 h-2 rounded-full inline-block"
        style={{ backgroundColor: color }}
      />
      {pulse && (status === "online" || status === "running") && (
        <span
          className="absolute w-2 h-2 rounded-full animate-ping"
          style={{ backgroundColor: color, opacity: 0.5 }}
        />
      )}
    </span>
  );
}

export const STATUS_COLOR_MAP: Record<string, string> = {
  online: "var(--success)",
  unstable: "var(--warning)",
  offline: "var(--danger)",
  draining: "var(--info)",
  disabled: "var(--muted-foreground)",
  pending: "var(--warning)",
  removed: "var(--danger)",
  running: "var(--success)",
  starting: "var(--info)",
  stopping: "var(--warning)",
  stopped: "var(--muted-foreground)",
  failed: "var(--danger)",
  unknown: "var(--muted-foreground)",
  scheduling: "var(--info)",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const color = STATUS_COLOR_MAP[status] || "var(--muted-foreground)";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider",
        className
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}
