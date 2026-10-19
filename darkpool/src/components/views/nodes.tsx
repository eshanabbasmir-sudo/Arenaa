"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, StatusDot } from "@/components/status-dot";
import { ProgressBar } from "@/components/charts";
import { fmtBytesShort, fmtCores, fmtRelative, fmtUptime } from "@/lib/format";
import { Plus, RefreshCw, ServerIcon, ArrowRight, Copy, Check, Info } from "@/components/icons";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NodeRow {
  nodeId: string;
  displayName?: string | null;
  role: string;
  status: string;
  cpuCores: number;
  ramBytes: number;
  diskBytes: number;
  architecture?: string | null;
  os?: string | null;
  hostname?: string | null;
  containerRuntime?: string | null;
  features: string[];
  lastHeartbeatAt?: string | null;
  registeredAt: string;
  resources?: any;
  workloadCount: number;
}

export function NodesView({ onOpenNode }: { onOpenNode: (id: string) => void }) {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenModal, setTokenModal] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenLabel, setTokenLabel] = useState("");
  const [tokenMaxUses, setTokenMaxUses] = useState<number>(1);
  const [installCmd, setInstallCmd] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/nodes");
    if (res.ok && res.nodes) setNodes(res.nodes);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const issueToken = async () => {
    const res = await fetchApi("/api/registration-tokens", {
      method: "POST",
      body: { label: tokenLabel || null, maxUses: tokenMaxUses },
    });
    if (res.ok && res.token) {
      setNewToken(res.token);
      const origin = typeof window !== "undefined" ? window.location.origin : "https://main.example.com";
      setInstallCmd(`# On the supporter VPS:
export MAIN_URL="${origin}"
export REGISTRATION_TOKEN="${res.token}"
curl -fsSL ${origin}/scripts/install-agent.sh | bash`);
      toast.success(`Token issued — ${tokenMaxUses === -1 ? "unlimited uses" : tokenMaxUses === 1 ? "single-use" : `${tokenMaxUses} uses`}`);
    } else {
      toast.error(res.error || "Failed to issue token");
    }
  };

  if (loading) {
    return <div className="p-6 md:p-8"><div className="h-96 rounded-xl bg-white/5 animate-pulse" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5 pb-20 md:pb-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Workers</h1>
          <p className="text-xs text-muted-foreground/70 mt-1.5">
            Real Supporter VPS nodes contributing resources to the pool · {nodes.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button onClick={() => setTokenModal(true)} className="bg-violet hover:bg-violet/90">
            <Plus className="w-4 h-4 mr-1.5" /> Add Worker
          </Button>
        </div>
      </div>

      {nodes.length === 0 ? (
        <Card className="p-10 text-center">
          <ServerIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-base font-medium mb-1">No workers connected</p>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first Supporter VPS to begin building your distributed resource pool.
          </p>
          <Button onClick={() => setTokenModal(true)} className="bg-violet hover:bg-violet/90">
            <Plus className="w-4 h-4 mr-1.5" /> Add Worker
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {nodes.map((n) => (
            <NodeCard key={n.nodeId} node={n} onOpen={() => onOpenNode(n.nodeId)} />
          ))}
        </div>
      )}

      {/* Add worker modal */}
      <Dialog open={tokenModal} onOpenChange={setTokenModal}>
        <DialogContent className="max-w-2xl bg-popover border-border/60">
          <DialogHeader>
            <DialogTitle>Add Supporter VPS</DialogTitle>
          </DialogHeader>
          {!newToken ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Issue a registration token, then run the installer on your Supporter VPS.
                Choose single-use (one worker) or unlimited (use across many workers).
              </p>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Label (optional)</Label>
                <Input
                  placeholder="worker-1 / prod / region-eu"
                  value={tokenLabel}
                  onChange={(e) => setTokenLabel(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Token Type</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <TokenTypeButton
                    label="Single-use"
                    description="1 use"
                    selected={tokenMaxUses === 1}
                    onClick={() => setTokenMaxUses(1)}
                  />
                  <TokenTypeButton
                    label="Multi-use"
                    description="N uses"
                    selected={tokenMaxUses > 1 && tokenMaxUses !== -1}
                    onClick={() => setTokenMaxUses(5)}
                  />
                  <TokenTypeButton
                    label="Unlimited"
                    description="∞ uses"
                    selected={tokenMaxUses === -1}
                    onClick={() => setTokenMaxUses(-1)}
                  />
                </div>
                {tokenMaxUses > 1 && tokenMaxUses !== -1 && (
                  <div className="mt-3">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Max uses</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={tokenMaxUses}
                      onChange={(e) => setTokenMaxUses(Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1.5"
                    />
                  </div>
                )}
                {tokenMaxUses === -1 && (
                  <p className="text-xs text-info mt-2 flex items-center gap-1.5">
                    <Info className="w-3 h-3" />
                    Unlimited tokens can register unlimited workers — useful for fleet bootstrap. Revoke when done.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Registration token</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-md bg-muted/30 border border-border/60 text-xs font-mono break-all">
                    {newToken}
                  </code>
                  <CopyButton text={newToken} />
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Install command</Label>
                <div className="mt-1.5 relative">
                  <pre className="px-3 py-3 rounded-md bg-muted/30 border border-border/60 text-xs font-mono whitespace-pre-wrap break-all max-h-72 overflow-y-auto">
                    {installCmd}
                  </pre>
                  <CopyButton text={installCmd} className="absolute top-2 right-2" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Once the agent registers, it will appear in the workers list automatically.
              </p>
            </div>
          )}
          <DialogFooter>
            {!newToken ? (
              <Button onClick={issueToken} className="bg-violet hover:bg-violet/90">Issue Token</Button>
            ) : (
              <Button onClick={() => { setTokenModal(false); setNewToken(null); setTokenLabel(""); }}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NodeCard({ node, onOpen }: { node: NodeRow; onOpen: () => void }) {
  const r = node.resources;
  const cpuPct = r?.cpuUsagePct ?? 0;
  const ramPct = r?.ramTotal ? (r.ramUsed / r.ramTotal) * 100 : 0;
  const diskPct = r?.diskTotal ? (r.diskUsed / r.diskTotal) * 100 : 0;

  return (
    <Card className="p-4 border-border/60 hover:border-border transition-colors group cursor-pointer" onClick={onOpen}>
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={node.status} pulse={node.status === "online"} />
            <p className="font-medium text-sm truncate">{node.displayName || node.nodeId}</p>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">
            {node.nodeId}
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

      {r && (
        <div className="space-y-1.5 mb-3">
          <MetricRow label="CPU" pct={cpuPct} color="var(--violet)" />
          <MetricRow label="RAM" pct={ramPct} color="var(--cyan)" />
          <MetricRow label="DISK" pct={diskPct} color="var(--success)" />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
        <span>{node.workloadCount} workloads</span>
        <span>up {fmtUptime(r?.uptime ?? 0)}</span>
      </div>

      <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-xs opacity-70 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        View details <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </Card>
  );
}

function MetricRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
      </div>
      <ProgressBar value={pct} color={color} height={4} />
    </div>
  );
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="icon"
      className={`h-8 w-8 ${className}`}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Copied");
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function TokenTypeButton({ label, description, selected, onClick }: { label: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
        selected ? "border-violet bg-violet/10" : "border-border/60 hover:border-border"
      }`}
    >
      <p className={`text-sm font-medium ${selected ? "text-violet" : ""}`}>{label}</p>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}
