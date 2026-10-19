"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, StatusDot } from "@/components/status-dot";
import { ProgressBar, Sparkline } from "@/components/charts";
import { fmtBytes, fmtBytesShort, fmtCores, fmtRelative, fmtUptime } from "@/lib/format";
import {
  ArrowLeft, RefreshCw, Power, PowerOff, Trash2, KeyRound,
  ActivityIcon, ServerIcon, CpuIcon, MemoryStickIcon, HardDriveIcon, Network as NetworkIcon,
  Terminal as TerminalIcon, AlertTriangle as AlertCircle,
} from "@/components/icons";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function NodeDetail({
  nodeId, onBack, onOpenTerminal,
}: {
  nodeId: string;
  onBack: () => void;
  onOpenTerminal: (workloadId: string) => void;
}) {
  const [node, setNode] = useState<any | null>(null);
  const [history, setHistory] = useState<{ cpu: number[]; ram: number[]; disk: number[] }>({ cpu: [], ram: [], disk: [] });
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmDrain, setConfirmDrain] = useState(false);
  const [workloads, setWorkloads] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetchApi(`/api/nodes/${nodeId}`);
    if (res.ok && res.node) {
      setNode(res.node);
      setWorkloads(res.node.workloads || []);
      const r = res.node.resources;
      if (r) {
        setHistory((prev) => ({
          cpu: [...prev.cpu, r.cpuUsagePct].slice(-60),
          ram: [...prev.ram, r.ramTotal ? (r.ramUsed / r.ramTotal) * 100 : 0].slice(-60),
          disk: [...prev.disk, r.diskTotal ? (r.diskUsed / r.diskTotal) * 100 : 0].slice(-60),
        }));
      }
    }
    setLoading(false);
  }, [nodeId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const action = async (op: "drain" | "enable" | "disable" | "remove" | "rotate-token") => {
    const res = await fetchApi(`/api/nodes/${nodeId}/${op}`, { method: "POST" });
    if (res.ok) {
      toast.success(`${op} applied`);
      if (op === "remove") { onBack(); return; }
      if (op === "rotate-token" && res.token) {
        toast.success(`New agent token: ${res.token.slice(0, 16)}…`, { duration: 8000 });
      }
      refresh();
    } else {
      toast.error(res.error || `Failed to ${op}`);
    }
  };

  if (loading) return <div className="p-6 md:p-8"><div className="h-96 rounded-xl bg-white/5 animate-pulse" /></div>;
  if (!node) return (
    <div className="p-6 md:p-8">
      <Card className="p-8 text-center">
        <p className="text-sm font-medium mb-2">Worker not found</p>
        <Button onClick={onBack} variant="outline">Back to workers</Button>
      </Card>
    </div>
  );

  const r = node.resources;
  const isOffline = node.status === "offline" || node.status === "unstable";
  const cpuPct = r?.cpuUsagePct ?? 0;
  const ramPct = r?.ramTotal ? (r.ramUsed / r.ramTotal) * 100 : 0;
  const diskPct = r?.diskTotal ? (r.diskUsed / r.diskTotal) * 100 : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5 pb-20 md:pb-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <StatusDot status={node.status} pulse={node.status === "online"} />
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                {node.displayName || node.nodeId}
              </h1>
              <StatusBadge status={node.status} />
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1.5">
              {node.nodeId} · {node.os} {node.architecture} · kernel {node.kernel} · runtime {node.containerRuntime}
              {node.hostname && ` · ${node.hostname}`}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Last heartbeat {fmtRelative(node.lastHeartbeatAt)} · registered {fmtRelative(node.registeredAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {node.status === "online" && (
            <Button variant="outline" size="sm" onClick={() => setConfirmDrain(true)}>
              <ActivityIcon className="w-3.5 h-3.5 mr-1.5" /> Drain
            </Button>
          )}
          {(node.status === "draining" || node.status === "disabled") && (
            <Button variant="outline" size="sm" onClick={() => action("enable")}>
              <Power className="w-3.5 h-3.5 mr-1.5" /> Enable
            </Button>
          )}
          {node.status !== "disabled" && (
            <Button variant="outline" size="sm" onClick={() => action("disable")}>
              <PowerOff className="w-3.5 h-3.5 mr-1.5" /> Disable
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => action("rotate-token")}>
            <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Rotate Token
          </Button>
          <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmRemove(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
          </Button>
        </div>
      </div>

      {isOffline && (
        <Card className="p-4 border-warning/40" style={{ background: "color-mix(in srgb, var(--warning) 6%, var(--card))" }}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium mb-1">Worker is {node.status === "unstable" ? "unstable" : "offline"}</p>
              <p className="text-muted-foreground">
                Last seen {fmtRelative(node.lastHeartbeatAt)}. Resource values below are <strong>LAST KNOWN</strong>, not current.
                The node will return to <code>online</code> automatically when heartbeats resume.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="bg-card/50 border border-border/40">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="workloads">Workloads ({workloads.length})</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="CPU" value={fmtCores(node.cpuCores)} sub={`${cpuPct.toFixed(0)}% used`} color="var(--violet)" icon={<CpuIcon className="w-4 h-4" />} />
            <StatCard label="RAM" value={fmtBytes(node.ramBytes)} sub={`${ramPct.toFixed(0)}% used`} color="var(--cyan)" icon={<MemoryStickIcon className="w-4 h-4" />} />
            <StatCard label="Disk" value={fmtBytes(node.diskBytes)} sub={`${diskPct.toFixed(0)}% used`} color="var(--success)" icon={<HardDriveIcon className="w-4 h-4" />} />
            <StatCard label="Uptime" value={fmtUptime(r?.uptime ?? 0)} sub={`load ${(r?.loadAvg1 ?? 0).toFixed(2)}`} color="var(--info)" icon={<ActivityIcon className="w-4 h-4" />} />
          </div>
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3">Real-time utilization</h3>
            <div className="space-y-4">
              <UtilRow label="CPU" pct={cpuPct} spark={history.cpu} color="var(--violet)" />
              <UtilRow label="Memory" pct={ramPct} spark={history.ram} color="var(--cyan)" />
              <UtilRow label="Disk" pct={diskPct} spark={history.disk} color="var(--success)" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4 mt-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">CPU</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <ResourceStat label="Cores" value={fmtCores(node.cpuCores)} />
              <ResourceStat label="Usage" value={`${cpuPct.toFixed(1)}%`} />
              <ResourceStat label="Load avg (1m)" value={(r?.loadAvg1 ?? 0).toFixed(2)} />
              <ResourceStat label="Load avg (15m)" value={(r?.loadAvg15 ?? 0).toFixed(2)} />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Memory</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <ResourceStat label="Total" value={fmtBytes(r?.ramTotal ?? node.ramBytes)} />
              <ResourceStat label="Used" value={fmtBytes(r?.ramUsed ?? 0)} />
              <ResourceStat label="Available" value={fmtBytes(r?.ramAvailable ?? 0)} />
              <ResourceStat label="Allocated (workloads)" value={fmtBytes(r?.ramAllocated ?? 0)} />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Disk</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <ResourceStat label="Total" value={fmtBytes(r?.diskTotal ?? node.diskBytes)} />
              <ResourceStat label="Used" value={fmtBytes(r?.diskUsed ?? 0)} />
              <ResourceStat label="Available" value={fmtBytes(r?.diskAvailable ?? 0)} />
              <ResourceStat label="Filesystem" value={r?.filesystem || "—"} />
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Network</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <ResourceStat label="Interface" value={r?.netInterface || "—"} />
              <ResourceStat label="RX bytes" value={fmtBytes(r?.netRxBytes ?? 0)} />
              <ResourceStat label="TX bytes" value={fmtBytes(r?.netTxBytes ?? 0)} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="workloads" className="space-y-3 mt-4">
          {workloads.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No workloads on this worker.</p>
            </Card>
          ) : (
            workloads.map((w) => (
              <Card key={w.id} className="p-4 border-border/60 hover:border-border transition-colors">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={w.status} />
                    <div>
                      <p className="font-medium text-sm">{w.name}</p>
                      <p className="text-[11px] text-muted-foreground">{w.workloadId} · {w.image}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{w.cpuLimit} CPU</span>
                    <span className="text-muted-foreground">{w.ramLimitMb} MB RAM</span>
                    <span className="text-muted-foreground">{w.diskLimitMb} MB disk</span>
                    {(w.status === "running") && (
                      <Button size="sm" variant="outline" onClick={() => onOpenTerminal(w.workloadId)}>
                        <TerminalIcon className="w-3.5 h-3.5 mr-1.5" /> Terminal
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="health" className="space-y-3 mt-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Health checks</h3>
            <div className="space-y-2.5">
              <HealthRow label="Agent" status={node.status === "online" ? "healthy" : node.status === "unstable" ? "warning" : "error"} detail={`status: ${node.status}`} />
              <HealthRow label="Heartbeat" status={node.status === "online" ? "healthy" : "error"} detail={fmtRelative(node.lastHeartbeatAt)} />
              <HealthRow label="API" status="healthy" detail="connected" />
              <HealthRow label="Container Runtime" status={node.containerRuntime ? "healthy" : "warning"} detail={node.containerRuntime || "none detected"} />
              <HealthRow label="Disk" status={diskPct < 90 ? "healthy" : "warning"} detail={`${diskPct.toFixed(0)}% used`} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove worker?</DialogTitle>
            <DialogDescription>
              This will mark {nodeId} as removed. New workloads will not be scheduled here.
              {workloads.length > 0 && (
                <span className="block mt-2 text-warning">
                  This worker currently has {workloads.length} workload(s). Removing the worker does not migrate them.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { action("remove"); setConfirmRemove(false); }}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDrain} onOpenChange={setConfirmDrain}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drain worker?</DialogTitle>
            <DialogDescription>
              New workloads will not be scheduled on {nodeId}. Existing workloads ({workloads.length}) continue until they stop or are migrated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDrain(false)}>Cancel</Button>
            <Button onClick={() => { action("drain"); setConfirmDrain(false); }}>Drain</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4 border-border/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
          {icon}
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </Card>
  );
}

function UtilRow({ label, pct, spark, color }: { label: string; pct: number; spark?: number[]; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar value={pct} color={color} height={8} className="flex-1" />
        {spark && spark.length > 1 && <Sparkline data={spark} color={color} width={80} height={20} />}
      </div>
    </div>
  );
}

function ResourceStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function HealthRow({ label, status, detail }: { label: string; status: "healthy" | "warning" | "error"; detail: string }) {
  const color = status === "healthy" ? "var(--success)" : status === "warning" ? "var(--warning)" : "var(--danger)";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground capitalize">{status} · {detail}</span>
    </div>
  );
}
