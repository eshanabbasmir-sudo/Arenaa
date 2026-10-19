"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { StatusBadge, StatusDot } from "@/components/status-dot";
import { fmtBytes, fmtRelative } from "@/lib/format";
import { Network as NetworkIcon, ActivityIcon } from "@/components/icons";

export function NetworkView({ onOpenNode }: { onOpenNode: (id: string) => void }) {
  const [pool, setPool] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/resources");
    if (res.ok) setPool(res.pool);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading) return <div className="p-6 md:p-8"><div className="h-96 rounded-xl bg-white/5 animate-pulse" /></div>;
  if (!pool) return <div className="p-6 md:p-8"><Card className="p-8 text-center">Unable to load network data.</Card></div>;

  const totalRx = pool.nodes.reduce((s: number, n: any) => s + (n.netRxBytes || 0), 0);
  const totalTx = pool.nodes.reduce((s: number, n: any) => s + (n.netTxBytes || 0), 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Network</h1>
        <p className="text-xs text-muted-foreground/70 mt-1.5">
          Connection status & traffic across the Main↔Worker private overlay.
        </p>
      </div>

      {/* Topology */}
      <Card className="p-6 border-border/60">
        <h3 className="text-sm font-semibold mb-4">Topology</h3>
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-violet/40 bg-violet/5">
            <NetworkIcon className="w-5 h-5 text-violet" />
            <div>
              <p className="text-sm font-semibold">MAIN</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Control Plane</p>
            </div>
            <StatusBadge status="online" />
          </div>
          <div className="w-px h-8 bg-border/60" />
          <div className="flex flex-wrap justify-center gap-3">
            {pool.nodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workers connected</p>
            ) : pool.nodes.map((n: any) => {
              const color = n.status === "online" ? "var(--success)" : n.status === "offline" ? "var(--danger)" : "var(--warning)";
              return (
                <button
                  key={n.nodeId}
                  onClick={() => onOpenNode(n.nodeId)}
                  className="rounded-lg border px-4 py-3 hover:bg-card/60 transition-colors"
                  style={{
                    borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
                    backgroundColor: `color-mix(in srgb, ${color} 5%, var(--card))`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <StatusDot status={n.status} pulse={n.status === "online"} />
                    <p className="text-sm font-medium">{n.displayName || n.nodeId}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtRelative(n.lastHeartbeatAt)}</p>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Aggregate traffic */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Total RX (cumulative)</p>
          <p className="text-2xl font-semibold text-cyan">{fmtBytes(totalRx)}</p>
          <p className="text-xs text-muted-foreground mt-1">across all workers</p>
        </Card>
        <Card className="p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Total TX (cumulative)</p>
          <p className="text-2xl font-semibold text-violet">{fmtBytes(totalTx)}</p>
          <p className="text-xs text-muted-foreground mt-1">across all workers</p>
        </Card>
      </div>

      {/* Per-worker table */}
      <Card className="overflow-hidden border-border/60">
        <div className="p-4 border-b border-border/40">
          <h3 className="text-sm font-semibold">Worker network</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-card/60 border-b border-border/40">
            <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-4 py-2">Worker</th>
              <th className="text-left font-medium px-4 py-2">Status</th>
              <th className="text-left font-medium px-4 py-2">Interface</th>
              <th className="text-right font-medium px-4 py-2">RX</th>
              <th className="text-right font-medium px-4 py-2">TX</th>
              <th className="text-left font-medium px-4 py-2">Last heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {pool.nodes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No workers connected</td></tr>
            ) : pool.nodes.map((n: any) => (
              <tr
                key={n.nodeId}
                className="border-b border-border/30 hover:bg-card/40 cursor-pointer transition-colors"
                onClick={() => onOpenNode(n.nodeId)}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatusDot status={n.status} pulse={n.status === "online"} />
                    <span className="font-medium text-xs">{n.displayName || n.nodeId}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5"><StatusBadge status={n.status} /></td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{n.netInterface || "—"}</td>
                <td className="px-4 py-2.5 text-right text-xs">{fmtBytes(n.netRxBytes || 0)}</td>
                <td className="px-4 py-2.5 text-right text-xs">{fmtBytes(n.netTxBytes || 0)}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtRelative(n.lastHeartbeatAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
