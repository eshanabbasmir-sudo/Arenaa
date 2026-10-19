"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "@/lib/format";
import { ScrollText, RefreshCw } from "@/components/icons";

const LEVEL_COLOR: Record<string, string> = {
  info: "var(--info)",
  warn: "var(--warning)",
  error: "var(--danger)",
  debug: "var(--muted-foreground)",
};

export function LogsView() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all");

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/logs?limit=200");
    if (res.ok && res.logs) setLogs(res.logs);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  const filtered = logs.filter((l) => {
    if (filter === "all") return true;
    if (filter === "warn") return l.level === "warn";
    return l.level === filter;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-4 pb-20 md:pb-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Logs</h1>
          <p className="text-xs text-muted-foreground/70 mt-1.5">
            Live event stream · auto-refreshes every 3s · {filtered.length} entries
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 p-1 rounded-lg border border-border/40 bg-card/40 w-fit">
        {(["all", "info", "warn", "error"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f ? "bg-violet/15 text-violet" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f === "warn" ? "Warnings" : f === "error" ? "Errors" : "Info"}
          </button>
        ))}
      </div>

      {/* Logs */}
      <Card className="overflow-hidden border-border/60">
        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 rounded bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <ScrollText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No log entries match this filter.</p>
          </div>
        ) : (
          <div className="font-mono text-xs max-h-[600px] overflow-y-auto">
            {filtered.map((l, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-2 border-b border-border/20 hover:bg-card/40"
              >
                <span className="text-muted-foreground/70 flex-shrink-0 tabular-nums">
                  {new Date(l.ts).toLocaleTimeString()}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{
                    color: LEVEL_COLOR[l.level] || "var(--muted-foreground)",
                    backgroundColor: `color-mix(in srgb, ${LEVEL_COLOR[l.level] || "var(--muted-foreground)"} 12%, transparent)`,
                  }}
                >
                  {l.level}
                </span>
                <span className="text-muted-foreground/70 flex-shrink-0 truncate max-w-[180px]">
                  {l.source}
                </span>
                <span className="text-foreground/90 flex-1 break-all">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
