// DARKPOOL frontend utilities

export function fmtBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function fmtBytesShort(bytes: number): string {
  if (!bytes || bytes <= 0) return "0B";
  const k = 1024;
  const sizes = ["B", "K", "M", "G", "T", "P"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i < 2 ? 0 : 1)}${sizes[i]}`;
}

export function fmtCores(n: number): string {
  if (n === 1) return "1 core";
  return `${n} cores`;
}

export function fmtUptime(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

export function fmtRelative(date: Date | string | number | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
}

export function fmtPct(p: number, decimals = 0): string {
  return `${p.toFixed(decimals)}%`;
}

// Status color mapping
export const STATUS_COLORS: Record<string, string> = {
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
