"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, X, Loader2, Sparkles, ServerIcon } from "@/components/icons";
import { fmtBytesShort } from "@/lib/format";

interface SchedulePreview {
  selectedNodeId: string | null;
  candidates: Array<{ nodeId: string; score: number; reason: string; accepted: boolean }>;
  rejected: Array<{ nodeId: string; reason: string }>;
  snapshot: any;
}

export function CreateWorkloadModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [cpu, setCpu] = useState(1);  // Default 1 core (minimum)
  const [ram, setRam] = useState(512); // MB
  const [disk, setDisk] = useState(1024); // MB
  const [image, setImage] = useState("ubuntu:22.04");
  const [command, setCommand] = useState("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  // New fields
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [ports, setPorts] = useState<Array<{ host: string; container: string }>>([]);
  const [priority, setPriority] = useState(0); // 0=normal, 1=high, 2=critical
  const [notes, setNotes] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [available, setAvailable] = useState<{ cpuCores: number; ramBytes: number; diskBytes: number } | null>(null);

  useEffect(() => {
    if (!open) {
      // reset
      setTimeout(() => {
        setStep(1);
        setName("");
        setCpu(1);
        setRam(512);
        setDisk(1024);
        setImage("ubuntu:22.04");
        setCommand("");
        setPreview(null);
        setTags([]);
        setTagInput("");
        setEnvVars([]);
        setPorts([]);
        setPriority(0);
        setNotes("");
      }, 200);
    }
  }, [open]);

  // fetch available pool + templates
  useEffect(() => {
    if (open) {
      fetchApi("/api/resources/summary").then((res) => {
        if (res.ok && res.summary) setAvailable(res.summary.available);
      });
      fetchApi("/api/workload-templates").then((res) => {
        if (res.ok && res.templates) setTemplates(res.templates);
      });
    }
  }, [open]);

  // fetch preview when entering step 3
  useEffect(() => {
    if (step >= 3 && open) {
      setPreviewLoading(true);
      fetchApi("/api/workloads/preview-schedule", {
        method: "POST",
        body: { cpuCores: cpu, ramMb: ram, diskMb: disk },
      }).then((res) => {
        if (res.ok) setPreview(res.schedule);
        else setPreview(null);
      }).finally(() => setPreviewLoading(false));
    }
  }, [step, open, cpu, ram, disk]);

  const submit = async () => {
    setCreating(true);
    try {
      // Build envVars object from array
      const envVarsObj: Record<string, string> = {};
      for (const e of envVars) {
        if (e.key.trim()) envVarsObj[e.key.trim()] = e.value;
      }
      // Build ports array
      const portsArr = ports
        .filter((p) => p.host && p.container)
        .map((p) => ({ host: Number(p.host), container: Number(p.container) }));

      const res = await fetchApi("/api/workloads", {
        method: "POST",
        body: {
          name: name || `workspace-${Math.random().toString(36).slice(2, 6)}`,
          image,
          command: command || null,
          cpuCores: cpu,
          ramMb: ram,
          diskMb: disk,
          tags: tags.length ? tags : undefined,
          envVars: Object.keys(envVarsObj).length ? envVarsObj : undefined,
          ports: portsArr.length ? portsArr : undefined,
          priority,
          notes: notes.trim() || undefined,
        },
      });
      if (res.ok) {
        toast.success(`Workspace created — assigned to ${res.schedule?.selectedNodeId || "—"}`);
        onOpenChange(false);
        onCreated();
      } else {
        toast.error(res.error || "Failed to create workspace");
      }
    } finally {
      setCreating(false);
    }
  };

  const applyTemplate = (t: any) => {
    setName(t.name + "-copy");
    setCpu(t.cpuCores);
    setRam(t.ramMb);
    setDisk(t.diskMb);
    setImage(t.image);
    setCommand(t.command || "");
    setTags(JSON.parse(t.tags || "[]"));
    setEnvVars(Object.entries(JSON.parse(t.envVars || "{}")).map(([key, value]) => ({ key, value: String(value) })));
    setPorts(JSON.parse(t.ports || "[]").map((p: any) => ({ host: String(p.host), container: String(p.container) })));
    toast.success(`Template "${t.name}" applied`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-popover border-border/60">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="w-4 h-4 text-violet" />
            Create Workspace
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  s <= step ? "bg-violet text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check className="w-3 h-3" /> : s}
              </div>
              {s < 4 && <div className={`h-px flex-1 ${s < step ? "bg-violet" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Name + Templates */}
        {step === 1 && (
          <div className="space-y-4">
            {templates.length > 0 && (
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quick Start Templates</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {templates.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="rounded-md border border-border/60 p-2.5 text-left hover:border-violet hover:bg-violet/5 transition-colors"
                    >
                      <p className="text-xs font-medium truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.cpuCores} CPU · {t.ramMb}MB · {(t.image || "").split(":")[0]}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Workspace Name</Label>
              <Input
                autoFocus
                placeholder="my-dev-environment"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                A short, human-friendly label for this workspace.
              </p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Container Image</Label>
              <Input
                placeholder="ubuntu:22.04"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        )}

        {/* Step 2: Resources */}
        {step === 2 && (
          <div className="space-y-4">
            <ResourceSlider
              label="CPU"
              unit="cores"
              value={cpu}
              min={1}
              max={Math.max(1, available?.cpuCores ?? 16)}
              onChange={setCpu}
              color="var(--violet)"
            />
            <ResourceSlider
              label="RAM"
              unit="MB"
              value={ram}
              min={128}
              step={128}
              max={Math.max(128, available ? Math.floor(available.ramBytes / 1024 / 1024) : 8192)}
              onChange={setRam}
              format={(v) => v >= 1024 ? `${(v / 1024).toFixed(0)} GB` : `${v} MB`}
              color="var(--cyan)"
            />
            <ResourceSlider
              label="Disk"
              unit="MB"
              value={disk}
              min={512}
              step={512}
              max={Math.max(512, available ? Math.floor(available.diskBytes / 1024 / 1024) : 51200)}
              onChange={setDisk}
              format={(v) => v >= 1024 ? `${(v / 1024).toFixed(0)} GB` : `${v} MB`}
              color="var(--success)"
            />
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Startup Command (optional)
              </Label>
              <Input
                placeholder="sleep infinity"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="mt-1.5"
              />
            </div>
            {available && (
              <div className="rounded-md border border-border/60 bg-card/50 p-3 text-xs">
                <p className="text-muted-foreground mb-1">Available in pool</p>
                <div className="flex gap-4">
                  <span>{available.cpuCores} CPU</span>
                  <span>{fmtBytesShort(available.ramBytes)} RAM</span>
                  <span>{fmtBytesShort(available.diskBytes)} Disk</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Scheduler preview */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Scheduler</p>
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking available workers…
                </div>
              ) : preview ? (
                <div className="space-y-1.5">
                  {preview.candidates.map((c) => (
                    <div key={c.nodeId} className="flex items-center gap-2.5 text-sm">
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="font-medium">{c.nodeId}</span>
                      <span className="text-xs text-muted-foreground ml-auto">score {c.score.toFixed(3)}</span>
                    </div>
                  ))}
                  {preview.rejected.map((r) => (
                    <div key={r.nodeId} className="flex items-center gap-2.5 text-sm">
                      <X className="w-3.5 h-3.5 text-danger" />
                      <span className="font-medium">{r.nodeId}</span>
                      <span className="text-xs text-muted-foreground ml-auto truncate" title={r.reason}>{r.reason}</span>
                    </div>
                  ))}
                  {preview.selectedNodeId && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <p className="text-xs text-muted-foreground">Recommended placement</p>
                      <div className="flex items-center gap-2 mt-1">
                        <ServerIcon className="w-4 h-4 text-violet" />
                        <span className="font-semibold">{preview.selectedNodeId}</span>
                      </div>
                    </div>
                  )}
                  {!preview.selectedNodeId && (
                    <div className="mt-3 p-3 rounded-md bg-danger/10 border border-danger/30 text-sm text-danger">
                      No suitable worker available for the requested resources.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to compute schedule preview.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && (
          <div className="space-y-3">
            <SummaryRow label="Name" value={name || "(auto)"} />
            <SummaryRow label="Image" value={image} />
            <SummaryRow label="CPU" value={`${cpu} cores`} />
            <SummaryRow label="RAM" value={ram >= 1024 ? `${(ram / 1024).toFixed(0)} GB` : `${ram} MB`} />
            <SummaryRow label="Disk" value={disk >= 1024 ? `${(disk / 1024).toFixed(0)} GB` : `${disk} MB`} />
            <SummaryRow label="Target" value={preview?.selectedNodeId || "—"} />
            {command && <SummaryRow label="Command" value={command} mono />}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)} disabled={creating}>
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 3 && !preview?.selectedNodeId}
              className="bg-violet hover:bg-violet/90"
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={creating} className="bg-violet hover:bg-violet/90">
              {creating ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Creating…</> : "Create Workspace"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResourceSlider({
  label, unit, value, min, max, step = 1, onChange, format, color,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
        <span className="text-sm font-semibold">{format ? format(value) : `${value} ${unit}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet h-1.5 cursor-pointer"
        style={{ accentColor: color }}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/70 mt-0.5">
        <span>{format ? format(min) : `${min} ${unit}`}</span>
        <span>{format ? format(max) : `${max} ${unit}`}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border/40">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}
