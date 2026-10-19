"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar, Sparkline } from "@/components/charts";
import { StatusBadge, StatusDot } from "@/components/status-dot";
import { fmtBytes, fmtBytesShort, fmtCores, fmtRelative } from "@/lib/format";
import {
  CpuIcon, MemoryStickIcon, HardDriveIcon, ServerIcon, ActivityIcon,
  Plus, ArrowRight, ShieldCheck, AlertTriangle, ShieldAlert,
  Zap, Layers, Network as NetworkIcon,
} from "@/components/icons";
import type { ViewKey } from "@/app/page";
import { CreateWorkloadModal } from "@/components/create-workload-modal";

interface PoolSnapshot {
  total: { cpuCores: number; ramBytes: number; diskBytes: number };
  allocated: { cpuCores: number; ramBytes: number; diskBytes: number };
  available: { cpuCores: number; ramBytes: number; diskBytes: number };
  workers: { online: number; offline: number; draining: number; total: number };
  nodes: Array<{
    nodeId: string;
    displayName?: string | null;
    status: string;
    cpuCores: number;
    ramBytes: number;
    diskBytes: number;
    cpuUsagePct: number;
    ramTotal: number;
    ramUsed: number;
    ramAvailable: number;
    diskTotal: number;
    diskUsed: number;
    diskAvailable: number;
    lastHeartbeatAt?: string | null;
    isStale: boolean;
  }>;
}

export function DashboardView({
  onOpenNode,
  onNavigate,
}: {
  onOpenNode: (id: string) => void;
  onNavigate: (v: ViewKey) => void;
}) {
  const [pool, setPool] = useState<PoolSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<{ cpu: number[]; ram: number[]; disk: number[] }>({
    cpu: [], ram: [], disk: [],
  });
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/resources");
    if (res.ok && res.pool) {
      setPool(res.pool);
      setHistory((prev) => ({
        cpu: [...prev.cpu, res.pool.workers.online > 0 ? res.pool.nodes.reduce((s: number, n: any) => s + n.cpuUsagePct, 0) / Math.max(1, res.pool.workers.online) : 0].slice(-60),
        ram: [...prev.ram, res.pool.total.ramBytes ? (res.pool.allocated.ramBytes / res.pool.total.ramBytes) * 100 : 0].slice(-60),
        disk: [...prev.disk, res.pool.total.diskBytes ? (res.pool.allocated.diskBytes / res.pool.total.diskBytes) * 100 : 0].slice(-60),
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (loading && !pool) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <div className="h-8 w-64 rounded-md bg-white/5 animate-pulse mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
        <div className="h-96 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <Card className="p-8 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-danger" />
          <p className="text-lg font-medium mb-2">Unable to connect to the Main API</p>
          <p className="text-sm text-muted-foreground mb-4">Check your connection and try again.</p>
          <Button onClick={refresh} variant="outline">Retry</Button>
        </Card>
      </div>
    );
  }

  const cpuPct = pool.total.cpuCores ? (pool.allocated.cpuCores / pool.total.cpuCores) * 100 : 0;
  const ramPct = pool.total.ramBytes ? (res => res || 0)((pool.allocated.ramBytes / Math.max(1, pool.total.ramBytes)) * 100) : 0;
  const diskPct = pool.total.diskBytes ? (pool.allocated.diskBytes / pool.total.diskBytes) * 100 : 0;

  const health = pool.workers.offline > 0
    ? { label: "DEGRADED", color: "var(--warning)", icon: AlertTriangle }
    : { label: "HEALTHY", color: "var(--success)", icon: ShieldCheck };
  if (pool.workers.online === 0) {
    health.label = "CRITICAL";
    health.color = "var(--danger)";
    health.icon = ShieldAlert;
  }
  const HealthIcon = health.icon;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20 md:pb-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{greeting}</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">DARKPOOL Overview</h1>
          <p className="text-xs text-muted-foreground/70 mt-1.5">
            Real-time view of your distributed VPS resource pool · auto-refreshes every 5s
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-violet hover:bg-violet/90">
          <Plus className="w-4 h-4 mr-1.5" />
          Create Workspace
        </Button>
      </div>

      <Card className="p-5 border-border/60" style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${health.color} 6%, var(--card)), var(--card))`,
      }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `color-mix(in srgb, ${health.color} 15%, transparent)`, color: health.color }}
            >
              <HealthIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">System Health</p>
              <p className="text-lg font-semibold" style={{ color: health.color }}>{health.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 ml-auto flex-wrap text-sm">
            <Stat label="Workers online" value={`${pool.workers.online}`} />
            <Stat label="Critical errors" value="0" />
            <Stat label="CPU avail" value={fmtCores(pool.available.cpuCores)} />
            <Stat label="RAM avail" value={fmtBytesShort(pool.available.ramBytes)} />
            <Stat label="Storage avail" value={fmtBytesShort(pool.available.diskBytes)} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <ResourceCard
          icon={<CpuIcon className="w-4 h-4" />}
          label="CPU"
          badge="RESOURCE POOL"
          value={fmtCores(pool.total.cpuCores)}
          sub={`${pool.available.cpuCores} available`}
          pct={cpuPct}
          spark={history.cpu}
          color="var(--violet)"
        />
        <ResourceCard
          icon={<MemoryStickIcon className="w-4 h-4" />}
          label="Memory"
          badge="RESOURCE POOL"
          value={fmtBytes(pool.total.ramBytes)}
          sub={`${fmtBytesShort(pool.available.ramBytes)} available`}
          pct={ramPct}
          spark={history.ram}
          color="var(--cyan)"
        />
        <ResourceCard
          icon={<HardDriveIcon className="w-4 h-4" />}
          label="Storage"
          badge="RESOURCE POOL"
          value={fmtBytes(pool.total.diskBytes)}
          sub={`${fmtBytesShort(pool.available.diskBytes)} available`}
          pct={diskPct}
          spark={history.disk}
          color="var(--success)"
        />
        <ResourceCard
          icon={<ServerIcon className="w-4 h-4" />}
          label="Workers"
          badge="CLUSTER"
          value={`${pool.workers.online}`}
          sub={`${pool.workers.offline} offline · ${pool.workers.total} total`}
          custom={
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <StatusDot status="online" /> {pool.workers.online}
              </span>
              {pool.workers.offline > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-danger">
                  <StatusDot status="offline" pulse={false} /> {pool.workers.offline}
                </span>
              )}
              {pool.workers.draining > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-info">
                  <StatusDot status="draining" pulse={false} /> {pool.workers.draining}
                </span>
              )}
            </div>
          }
          color="var(--info)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Resource Utilization</h3>
              <p className="text-[11px] text-muted-foreground">Allocated vs total pool</p>
            </div>
            <ActivityIcon className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-5">
            <UtilRow label="CPU" pct={cpuPct} value={`${pool.allocated.cpuCores} / ${pool.total.cpuCores} cores`} color="var(--violet)" />
            <UtilRow label="Memory" pct={ramPct} value={`${fmtBytesShort(pool.allocated.ramBytes)} / ${fmtBytesShort(pool.total.ramBytes)}`} color="var(--cyan)" />
            <UtilRow label="Storage" pct={diskPct} value={`${fmtBytesShort(pool.allocated.diskBytes)} / ${fmtBytesShort(pool.total.diskBytes)}`} color="var(--success)" />
          </div>
          <div className="mt-5 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Overcommit</span>
              <span className="font-medium text-warning">DISABLED</span>
            </div>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Resource Pool Composition</h3>
              <p className="text-[11px] text-muted-foreground">Distributed across {pool.workers.total} worker nodes — not one physical machine</p>
            </div>
            <Layers className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 md:gap-3 overflow-x-auto pb-2">
            {pool.nodes.map((n, i) => (
              <div key={n.nodeId} className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                <NodeMini node={n} />
                {i < pool.nodes.length - 1 && (
                  <span className="text-xl text-muted-foreground/40 font-light">+</span>
                )}
              </div>
            ))}
            {pool.nodes.length > 0 && (
              <>
                <span className="text-xl text-muted-foreground/40 font-light">=</span>
                <div className="rounded-lg border border-violet/30 bg-violet/5 px-4 py-3 flex-shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-violet mb-1">Pool</p>
                  <p className="text-sm font-semibold">{fmtCores(pool.total.cpuCores)}</p>
                  <p className="text-xs text-muted-foreground">{fmtBytesShort(pool.total.ramBytes)} RAM</p>
                  <p className="text-xs text-muted-foreground">{fmtBytesShort(pool.total.diskBytes)} disk</p>
                </div>
              </>
            )}
            {pool.nodes.length === 0 && (
              <div className="text-center py-8 w-full">
                <ServerIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No workers connected</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => onNavigate("nodes")}>
                  Add your first worker
                </Button>
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground/80">
            <strong className="text-foreground/80">Physical vs Virtual:</strong> each card above represents a real independent VPS.
            The pool total is a scheduling abstraction — physical RAM/CPU is NOT merged across machines.
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Workers</h3>
            <p className="text-[11px] text-muted-foreground">{pool.workers.total} nodes · {pool.workers.online} online</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("nodes")}>
            View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
        {pool.nodes.length === 0 ? (
          <Card className="p-8 text-center">
            <ServerIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium mb-1">No workers connected</p>
            <p className="text-xs text-muted-foreground mb-4">Add your first Supporter VPS to begin building your distributed resource pool.</p>
            <Button size="sm" variant="outline" onClick={() => onNavigate("nodes")}>Add Worker</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pool.nodes.slice(0, 6).map((n) => (
              <WorkerCard key={n.nodeId} node={n} onOpen={() => onOpenNode(n.nodeId)} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink icon={<NetworkIcon className="w-4 h-4" />} label="Network" onClick={() => onNavigate("network")} />
        <QuickLink icon={<HardDriveIcon className="w-4 h-4" />} label="Storage" onClick={() => onNavigate("storage")} />
        <QuickLink icon={<ActivityIcon className="w-4 h-4" />} label="Logs" onClick={() => onNavigate("logs")} />
        <QuickLink icon={<Zap className="w-4 h-4" />} label="Settings" onClick={() => onNavigate("settings")} />
      </div>

      <CreateWorkloadModal open={createOpen} onOpenChange={setCreateOpen} onCreated={() => { refresh(); onNavigate("workloads"); }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-semibold text-sm">{value}</span>
    </div>
  );
}

function ResourceCard({
  icon, label, badge, value, sub, pct, spark, color, custom,
}: {
  icon: React.ReactNode;
  label: string;
  badge: string;
  value: string;
  sub: string;
  pct?: number;
  spark?: number[];
  color: string;
  custom?: React.ReactNode;
}) {
  return (
    <Card className="p-4 md:p-5 border-border/60 hover:border-border transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
          >
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{badge}</p>
          </div>
        </div>
        {spark && spark.length > 1 && <Sparkline data={spark} color={color} width={60} height={20} />}
      </div>
      <p className="text-xl md:text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      {typeof pct === "number" && (
        <div className="mt-3">
          <ProgressBar value={pct} color={color} />
        </div>
      )}
      {custom}
    </Card>
  );
}

function UtilRow({ label, pct, value, color }: { label: string; pct: number; value: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{value}</span>
      </div>
      <ProgressBar value={pct} color={color} height={8} />
      <div className="text-right text-[10px] text-muted-foreground/70 mt-0.5">{pct.toFixed(0)}%</div>
    </div>
  );
}

function NodeMini({ node }: { node: PoolSnapshot["nodes"][0] }) {
  const color = node.status === "online" ? "var(--success)" : node.status === "offline" ? "var(--danger)" : "var(--warning)";
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 min-w-[120px]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
          {node.displayName || node.nodeId}
        </p>
      </div>
      <p className="text-sm font-semibold">{fmtCores(node.cpuCores)}</p>
      <p className="text-[11px] text-muted-foreground">{fmtBytesShort(node.ramBytes)} RAM</p>
      <p className="text-[11px] text-muted-foreground">{fmtBytesShort(node.diskBytes)} disk</p>
    </div>
  );
}

function WorkerCard({ node, onOpen }: { node: PoolSnapshot["nodes"][0]; onOpen: () => void }) {
  const ramPct = node.ramTotal ? (node.ramUsed / node.ramTotal) * 100 : 0;
  const diskPct = node.diskTotal ? (node.diskUsed / node.diskTotal) * 100 : 0;
  return (
    <Card className="p-4 border-border/60 hover:border-border transition-colors group cursor-pointer" onClick={onOpen}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot status={node.status} pulse={node.status === "online"} />
            <p className="font-medium text-sm">{node.displayName || node.nodeId}</p>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">
            {node.nodeId} · last seen {fmtRelative(node.lastHeartbeatAt)}
          </p>
        </div>
        <StatusBadge status={node.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">CPU</p>
          <p className="font-medium">{fmtCores(node.cpuCores)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">RAM</p>
          <p className="font-medium">{fmtBytesShort(node.ramBytes)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Disk</p>
          <p className="font-medium">{fmtBytesShort(node.diskBytes)}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">CPU {node.cpuUsagePct.toFixed(0)}%</span>
          <span className="text-muted-foreground">RAM {ramPct.toFixed(0)}%</span>
          <span className="text-muted-foreground">DISK {diskPct.toFixed(0)}%</span>
        </div>
        <div className="flex gap-1">
          <ProgressBar value={node.cpuUsagePct} color="var(--violet)" height={4} className="flex-1" />
          <ProgressBar value={ramPct} color="var(--cyan)" height={4} className="flex-1" />
          <ProgressBar value={diskPct} color="var(--success)" height={4} className="flex-1" />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-3 h-7 text-xs opacity-70 group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
      >
        View details <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </Card>
  );
}

function QuickLink({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-border/60 bg-card/40 p-4 text-left hover:bg-card hover:border-border transition-colors flex items-center gap-3"
    >
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/50" />
    </button>
  );
}
