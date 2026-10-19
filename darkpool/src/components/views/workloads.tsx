"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, StatusDot } from "@/components/status-dot";
import { fmtBytesShort, fmtRelative } from "@/lib/format";
import { Plus, RefreshCw, Terminal as TerminalIcon, Trash2, Container } from "@/components/icons";
import { CreateWorkloadModal } from "@/components/create-workload-modal";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

interface WorkloadRow {
  workloadId: string;
  name: string;
  status: string;
  image: string;
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  nodeId: string | null;
  nodeName?: string | null;
  containerId?: string | null;
  pid?: number | null;
  createdAt: string;
  startedAt?: string | null;
  owner?: { email: string } | null;
  error?: string | null;
}

export function WorkloadsView({ onOpenTerminal }: { onOpenTerminal: (id: string) => void }) {
  const [workloads, setWorkloads] = useState<WorkloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/workloads");
    if (res.ok && res.workloads) setWorkloads(res.workloads);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const del = async (id: string) => {
    const res = await fetchApi(`/api/workloads/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Workload stopped & deleted");
      refresh();
    } else {
      toast.error(res.error || "Failed to delete");
    }
    setConfirmDelete(null);
  };

  if (loading) return <div className="p-6 md:p-8"><div className="h-96 rounded-xl bg-white/5 animate-pulse" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5 pb-20 md:pb-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Workloads</h1>
          <p className="text-xs text-muted-foreground/70 mt-1.5">
            Container workloads scheduled across workers · {workloads.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-violet hover:bg-violet/90">
            <Plus className="w-4 h-4 mr-1.5" /> Create Workspace
          </Button>
        </div>
      </div>

      {workloads.length === 0 ? (
        <Card className="p-10 text-center">
          <Container className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-base font-medium mb-1">No workloads</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first workspace.</p>
          <Button onClick={() => setCreateOpen(true)} className="bg-violet hover:bg-violet/90">
            <Plus className="w-4 h-4 mr-1.5" /> Create Workspace
          </Button>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-card/60 border-b border-border/40">
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-4 py-3">Workload</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Worker</th>
                  <th className="text-left font-medium px-4 py-3">CPU</th>
                  <th className="text-left font-medium px-4 py-3">RAM</th>
                  <th className="text-left font-medium px-4 py-3">Disk</th>
                  <th className="text-left font-medium px-4 py-3">Created</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workloads.map((w) => (
                  <tr key={w.workloadId} className="border-b border-border/30 hover:bg-card/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={w.status} pulse={w.status === "running"} />
                        <div>
                          <p className="font-medium">{w.name}</p>
                          <p className="text-[11px] text-muted-foreground">{w.workloadId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                    <td className="px-4 py-3 text-xs">{w.nodeName || w.nodeId || "—"}</td>
                    <td className="px-4 py-3 text-xs">{w.cpuLimit} cores</td>
                    <td className="px-4 py-3 text-xs">{fmtBytesShort(w.ramLimitMb * 1024 * 1024)}</td>
                    <td className="px-4 py-3 text-xs">{fmtBytesShort(w.diskLimitMb * 1024 * 1024)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtRelative(w.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {w.status === "running" && (
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => onOpenTerminal(w.workloadId)}>
                            <TerminalIcon className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 text-danger" onClick={() => setConfirmDelete(w.workloadId)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {workloads.map((w) => (
              <Card key={w.workloadId} className="p-3 border-border/60">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={w.status} pulse={w.status === "running"} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{w.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{w.workloadId}</p>
                    </div>
                  </div>
                  <StatusBadge status={w.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div><span className="text-muted-foreground">Worker:</span> {w.nodeName || w.nodeId || "—"}</div>
                  <div><span className="text-muted-foreground">Created:</span> {fmtRelative(w.createdAt)}</div>
                  <div><span className="text-muted-foreground">CPU:</span> {w.cpuLimit} cores</div>
                  <div><span className="text-muted-foreground">RAM:</span> {fmtBytesShort(w.ramLimitMb * 1024 * 1024)}</div>
                  <div><span className="text-muted-foreground">Disk:</span> {fmtBytesShort(w.diskLimitMb * 1024 * 1024)}</div>
                </div>
                <div className="flex gap-2">
                  {w.status === "running" && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => onOpenTerminal(w.workloadId)}>
                      <TerminalIcon className="w-3.5 h-3.5 mr-1.5" /> Terminal
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-danger" onClick={() => setConfirmDelete(w.workloadId)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <CreateWorkloadModal open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />

      <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workload?</DialogTitle>
            <DialogDescription>
              This will stop the container (if running) and remove the workload record. Workspace data may be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && del(confirmDelete)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
