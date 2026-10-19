"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, StatusDot } from "@/components/status-dot";
import { ProgressBar } from "@/components/charts";
import { fmtBytes, fmtBytesShort, fmtCores, fmtRelative } from "@/lib/format";
import { ArrowRight, HardDriveIcon, Layers, AlertTriangle } from "@/components/icons";

export function StorageView({ onOpenNode }: { onOpenNode: (id: string) => void }) {
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
  if (!pool) return <div className="p-6 md:p-8"><Card className="p-8 text-center">Unable to load storage data.</Card></div>;

  const usedPct = pool.total.diskBytes ? (pool.allocated.diskBytes / pool.total.diskBytes) * 100 : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Storage</h1>
        <p className="text-xs text-muted-foreground/70 mt-1.5">
          Distributed storage capacity across worker nodes — not one physical disk.
        </p>
      </div>

      {/* Pool summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-5 border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Total Pool</p>
          <p className="text-2xl font-semibold">{fmtBytes(pool.total.diskBytes)}</p>
          <ProgressBar value={100} color="var(--success)" className="mt-3" />
          <p className="text-xs text-muted-foreground mt-2">{pool.workers.total} nodes contributing</p>
        </Card>
        <Card className="p-5 border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Allocated</p>
          <p className="text-2xl font-semibold text-warning">{fmtBytes(pool.allocated.diskBytes)}</p>
          <ProgressBar value={usedPct} color="var(--warning)" className="mt-3" />
          <p className="text-xs text-muted-foreground mt-2">{usedPct.toFixed(0)}% of pool</p>
        </Card>
        <Card className="p-5 border-border/60">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Available</p>
          <p className="text-2xl font-semibold text-success">{fmtBytes(pool.available.diskBytes)}</p>
          <ProgressBar value={100 - usedPct} color="var(--success)" className="mt-3" />
          <p className="text-xs text-muted-foreground mt-2">Schedulable across {pool.workers.online} online workers</p>
        </Card>
      </div>

      {/* Distributed storage disclaimer */}
      <Card className="p-4 border-info/30" style={{ background: "color-mix(in srgb, var(--info) 5%, var(--card))" }}>
        <div className="flex items-start gap-3">
          <Layers className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium mb-1">Distributed Storage Capacity</p>
            <p className="text-muted-foreground">
              The numbers above are aggregated across multiple independent worker filesystems. They represent
              the total schedulable storage pool — not a single physical disk. Each workload's data lives on
              the worker it was scheduled on; the system does not concatenate filesystems into one.
            </p>
          </div>
        </div>
      </Card>

      {/* Per-worker breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Per-worker storage</h3>
        {pool.nodes.length === 0 ? (
          <Card className="p-8 text-center">
            <HardDriveIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No workers connected.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pool.nodes.map((n: any) => {
              const totalDisk = n.diskBytes;
              const usedDisk = n.diskUsed || 0;
              const usedPct = totalDisk ? (usedDisk / totalDisk) * 100 : 0;
              const allocPct = totalDisk ? (n.diskAllocated / totalDisk) * 100 : 0;
              return (
                <Card key={n.nodeId} className="p-4 border-border/60 hover:border-border transition-colors cursor-pointer" onClick={() => onOpenNode(n.nodeId)}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusDot status={n.status} pulse={n.status === "online"} />
                        <p className="font-medium text-sm">{n.displayName || n.nodeId}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{n.nodeId}</p>
                    </div>
                    <StatusBadge status={n.status} />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Used</span>
                        <span className="font-medium">{fmtBytesShort(usedDisk)} / {fmtBytesShort(totalDisk)}</span>
                      </div>
                      <ProgressBar value={usedPct} color="var(--warning)" height={5} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Allocated</span>
                        <span className="font-medium">{fmtBytesShort(n.diskAllocated || 0)}</span>
                      </div>
                      <ProgressBar value={allocPct} color="var(--violet)" height={5} />
                    </div>
                    {n.status !== "online" && (
                      <p className="text-[11px] text-muted-foreground/70 mt-2">
                        ⚠ Last known values — worker {n.status}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
