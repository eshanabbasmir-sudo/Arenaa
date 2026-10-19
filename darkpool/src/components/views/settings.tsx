"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, User, KeyRound, Shield, Database, Bell,
  Save, Trash2, Plus, Copy, Check, Monitor, History, AlertCircle,
  Terminal as TerminalIcon, Server, Container, Palette,
} from "@/components/icons";
import type { SessionUser } from "@/app/page";
import { fmtRelative } from "@/lib/format";

export function SettingsView({ user }: { user: SessionUser }) {
  const [system, setSystem] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("account");

  useEffect(() => {
    fetchApi("/api/system/status").then((res) => {
      if (res.ok) setSystem(res.status);
    });
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground/70 mt-1.5">
          Manage your account, API tokens, sessions, and DARKPOOL configuration.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/40 flex-wrap h-auto">
          <TabsTrigger value="account" className="text-xs"><User className="w-3.5 h-3.5 mr-1.5" />Account</TabsTrigger>
          <TabsTrigger value="security" className="text-xs"><Shield className="w-3.5 h-3.5 mr-1.5" />Security</TabsTrigger>
          <TabsTrigger value="api-tokens" className="text-xs"><KeyRound className="w-3.5 h-3.5 mr-1.5" />API Tokens</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs"><Monitor className="w-3.5 h-3.5 mr-1.5" />Sessions</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs"><History className="w-3.5 h-3.5 mr-1.5" />Audit Log</TabsTrigger>
          <TabsTrigger value="preferences" className="text-xs"><Palette className="w-3.5 h-3.5 mr-1.5" />Preferences</TabsTrigger>
          <TabsTrigger value="system" className="text-xs"><SettingsIcon className="w-3.5 h-3.5 mr-1.5" />System</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4"><AccountTab user={user} /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecurityTab user={user} /></TabsContent>
        <TabsContent value="api-tokens" className="mt-4"><ApiTokensTab /></TabsContent>
        <TabsContent value="sessions" className="mt-4"><SessionsTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogTab /></TabsContent>
        <TabsContent value="preferences" className="mt-4"><PreferencesTab /></TabsContent>
        <TabsContent value="system" className="mt-4"><SystemTab system={system} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Account tab: change email, name, password ──────────────────────────────

function AccountTab({ user }: { user: SessionUser }) {
  const [name, setName] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);

  // Email change
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async () => {
    setSavingName(true);
    const res = await fetchApi("/api/account/change-name", { method: "POST", body: { name } });
    if (res.ok) toast.success("Name updated");
    else toast.error(res.error || "Failed");
    setSavingName(false);
  };

  const saveEmail = async () => {
    if (!newEmail || !emailPassword) { toast.error("Enter new email and current password"); return; }
    setSavingEmail(true);
    const res = await fetchApi("/api/account/change-email", { method: "POST", body: { newEmail, password: emailPassword } });
    if (res.ok) {
      toast.success("Email changed — please log in again");
      setNewEmail(""); setEmailPassword("");
      setTimeout(() => window.location.reload(), 1500);
    } else toast.error(res.error || "Failed");
    setSavingEmail(false);
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) { toast.error("Enter current and new password"); return; }
    if (newPassword.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords don't match"); return; }
    setSavingPassword(true);
    const res = await fetchApi("/api/account/change-password", { method: "POST", body: { currentPassword, newPassword } });
    if (res.ok) {
      toast.success("Password changed — please log in again");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => window.location.href = "/", 1500);
    } else toast.error(res.error || "Failed");
    setSavingPassword(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Profile</h3>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Display Name</Label>
            <div className="flex gap-2 mt-1.5">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              <Button onClick={saveName} disabled={savingName} className="bg-violet hover:bg-violet/90">
                <Save className="w-3.5 h-3.5 mr-1" /> Save
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Current Email</Label>
            <Input value={user.email} disabled className="mt-1.5 opacity-70" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Role</Label>
            <Input value={user.role} disabled className="mt-1.5 opacity-70" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-1">Change Email</h3>
        <p className="text-xs text-muted-foreground mb-4">Confirm with your current password. You'll be logged out after.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Current Password</Label>
            <Input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className="mt-1.5" />
          </div>
          <Button onClick={saveEmail} disabled={savingEmail} className="bg-violet hover:bg-violet/90">
            <Save className="w-3.5 h-3.5 mr-1" /> Change Email
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-1">Change Password</h3>
        <p className="text-xs text-muted-foreground mb-4">Min 8 characters. You'll be logged out of all sessions after.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Current Password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Confirm New Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1.5" />
          </div>
          <Button onClick={savePassword} disabled={savingPassword} className="bg-violet hover:bg-violet/90">
            <KeyRound className="w-3.5 h-3.5 mr-1" /> Change Password
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Security tab ───────────────────────────────────────────────────────────

function SecurityTab({ user }: { user: SessionUser }) {
  const [failedAttempts, setFailedAttempts] = useState<number | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [lastPwChange, setLastPwChange] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/audit-logs?action=auth.failure&limit=5").then((res) => {
      if (res.ok) setFailedAttempts(res.logs?.length || 0);
    });
    fetchApi("/api/audit-logs?action=auth.login&limit=5").then((res) => {
      if (res.ok && res.logs?.length) {
        setLastLogin(res.logs[0].createdAt);
      }
    });
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Security Status</h3>
        </div>
        <div className="space-y-3">
          <SecurityRow label="Account status" value="Active" status="ok" />
          <SecurityRow label="Two-factor auth" value="Not enabled (coming soon)" status="warning" />
          <SecurityRow label="Failed login attempts (recent)" value={failedAttempts !== null ? `${failedAttempts}` : "—"} status={failedAttempts && failedAttempts > 3 ? "warning" : "ok"} />
          <SecurityRow label="Last successful login" value={lastLogin ? fmtRelative(lastLogin) : "—"} status="ok" />
          <SecurityRow label="Last password change" value={lastPwChange ? fmtRelative(lastPwChange) : "Never"} status="ok" />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Security Recommendations</h3>
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" /> Use a unique, strong password (12+ chars)</li>
          <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" /> Rotate API tokens periodically</li>
          <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" /> Revoke old sessions you don't recognize</li>
          <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" /> Review the audit log for suspicious activity</li>
          <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" /> In production, use HTTPS + a private overlay for workers</li>
        </ul>
      </Card>
    </div>
  );
}

function SecurityRow({ label, value, status }: { label: string; value: string; status: "ok" | "warning" | "error" }) {
  const color = status === "ok" ? "var(--success)" : status === "warning" ? "var(--warning)" : "var(--danger)";
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

// ─── API Tokens tab ─────────────────────────────────────────────────────────

function ApiTokensTab() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/api-tokens");
    if (res.ok) setTokens(res.tokens || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    const res = await fetchApi("/api/api-tokens", { method: "POST", body: { name: newName || "default" } });
    if (res.ok) {
      setCreatedToken(res.token);
      setNewName("");
      refresh();
    } else toast.error(res.error || "Failed");
  };

  const revoke = async (id: string) => {
    const res = await fetchApi(`/api/api-tokens/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Token revoked"); refresh(); }
    else toast.error(res.error || "Failed");
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">API Tokens</h3>
            <p className="text-xs text-muted-foreground">Programmatic access tokens for the DARKPOOL API.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-violet hover:bg-violet/90">
            <Plus className="w-3.5 h-3.5 mr-1" /> New Token
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded bg-white/5 animate-pulse" />)}</div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-8">
            <KeyRound className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No API tokens yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create one to access the DARKPOOL API programmatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-md border border-border/40 hover:bg-card/40">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{t.prefix}…••••••••••••••••</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Created {fmtRelative(t.createdAt)}
                    {t.lastUsedAt ? ` · last used ${fmtRelative(t.lastUsedAt)}` : " · never used"}
                    {t.expiresAt ? ` · expires ${fmtRelative(t.expiresAt)}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="text-danger h-8" onClick={() => revoke(t.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Token</DialogTitle>
            <DialogDescription>The token will only be shown once. Copy it now.</DialogDescription>
          </DialogHeader>
          {createdToken ? (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/30 border border-border/60 p-3">
                <code className="text-xs font-mono break-all">{createdToken}</code>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigator.clipboard.writeText(createdToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    toast.success("Copied");
                  }}
                >
                  {copied ? <><Check className="w-3.5 h-3.5 mr-1" /> Copied</> : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy</>}
                </Button>
                <Button className="flex-1 bg-violet hover:bg-violet/90" onClick={() => { setCreatedToken(null); setCreateOpen(false); }}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. ci-deploy" className="mt-1.5" />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={create} className="bg-violet hover:bg-violet/90">Create</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sessions tab ───────────────────────────────────────────────────────────

function SessionsTab() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetchApi("/api/account/sessions");
    if (res.ok) setSessions(res.sessions || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const revoke = async (id: string) => {
    const res = await fetchApi(`/api/account/sessions/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Session revoked"); refresh(); }
  };

  const revokeAll = async () => {
    const res = await fetchApi("/api/account/sessions", { method: "DELETE" });
    if (res.ok) {
      toast.success("All sessions revoked — redirecting…");
      setTimeout(() => window.location.href = "/", 1500);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Active Sessions</h3>
            <p className="text-xs text-muted-foreground">{sessions.length} active session(s)</p>
          </div>
          {sessions.length > 1 && (
            <Button size="sm" variant="outline" className="text-danger" onClick={revokeAll}>
              Revoke All (Logout Everywhere)
            </Button>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 rounded bg-white/5 animate-pulse" />)}</div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-md border border-border/40">
                <div>
                  <p className="text-sm font-medium font-mono">{s.ipAddress || "unknown IP"}</p>
                  <p className="text-xs text-muted-foreground">{s.userAgent || "unknown"}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Created {fmtRelative(s.createdAt)} · expires {fmtRelative(s.expiresAt)}
                  </p>
                </div>
                {i === 0 ? (
                  <span className="text-[10px] uppercase tracking-wider text-success px-2 py-0.5 rounded-full bg-success/10">Current</span>
                ) : (
                  <Button size="sm" variant="ghost" className="text-danger h-8" onClick={() => revoke(s.id)}>Revoke</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Audit Log tab ──────────────────────────────────────────────────────────

function AuditLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const refresh = useCallback(async () => {
    const url = filter ? `/api/audit-logs?action=${encodeURIComponent(filter)}` : "/api/audit-logs";
    const res = await fetchApi(url);
    if (res.ok) setLogs(res.logs || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">Audit Log</h3>
          <p className="text-xs text-muted-foreground">{logs.length} entries</p>
        </div>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by action (e.g. auth.login)"
          className="max-w-xs h-8 text-xs"
        />
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-6 rounded bg-white/5 animate-pulse" />)}</div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No audit log entries.</p>
      ) : (
        <div className="font-mono text-xs max-h-[500px] overflow-y-auto -mx-2">
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 px-3 py-2 border-b border-border/20 hover:bg-card/40">
              <span className="text-muted-foreground/70 flex-shrink-0 tabular-nums">
                {new Date(l.createdAt).toLocaleString()}
              </span>
              <span className="text-violet flex-shrink-0 truncate max-w-[200px]">{l.action}</span>
              <span className="text-muted-foreground flex-shrink-0 truncate max-w-[150px]">{l.user?.email || "system"}</span>
              <span className="text-foreground/90 flex-1 break-all">{l.resource ? `${l.resource}` : ""}{l.ipAddress ? ` (${l.ipAddress})` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Preferences tab ────────────────────────────────────────────────────────

function PreferencesTab() {
  const [prefs, setPrefs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchApi("/api/account/preferences").then((res) => {
      if (res.ok) setPrefs(res.preferences || {});
      setLoading(false);
    });
  }, []);

  const update = async (updates: Record<string, any>) => {
    setSaving(true);
    const res = await fetchApi("/api/account/preferences", { method: "PUT", body: updates });
    if (res.ok) { setPrefs(res.preferences); toast.success("Saved"); }
    setSaving(false);
  };

  if (loading) return <Card className="p-5"><div className="h-32 animate-pulse bg-white/5 rounded" /></Card>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Display Preferences</h3>
        <div className="space-y-3">
          <PrefRow label="Compact mode" description="Reduce padding and card sizes">
            <Toggle checked={!!prefs.compactMode} onChange={(v) => update({ compactMode: v })} />
          </PrefRow>
          <PrefRow label="Show advanced metrics" description="Display detailed CPU/RAM/disk breakdowns">
            <Toggle checked={!!prefs.advancedMetrics} onChange={(v) => update({ advancedMetrics: v })} />
          </PrefRow>
          <PrefRow label="Auto-refresh dashboard" description="Poll API every 5s for live updates">
            <Toggle checked={prefs.autoRefresh !== false} onChange={(v) => update({ autoRefresh: v })} />
          </PrefRow>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Notification Preferences</h3>
        <div className="space-y-3">
          <PrefRow label="Worker offline alerts" description="Get notified when a worker goes offline">
            <Toggle checked={!!prefs.notifyWorkerOffline} onChange={(v) => update({ notifyWorkerOffline: v })} />
          </PrefRow>
          <PrefRow label="Workload failure alerts" description="Get notified when a workload fails to start">
            <Toggle checked={!!prefs.notifyWorkloadFailed} onChange={(v) => update({ notifyWorkloadFailed: v })} />
          </PrefRow>
          <PrefRow label="High CPU alerts (>85%)" description="Get notified when a worker's CPU usage exceeds 85%">
            <Toggle checked={!!prefs.notifyCpuHigh} onChange={(v) => update({ notifyCpuHigh: v })} />
          </PrefRow>
        </div>
      </Card>

      {saving && <p className="text-xs text-muted-foreground text-center">Saving…</p>}
    </div>
  );
}

function PrefRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${checked ? "bg-violet" : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

// ─── System tab ─────────────────────────────────────────────────────────────

function SystemTab({ system }: { system: any | null }) {
  if (!system) return <Card className="p-5"><div className="h-32 animate-pulse bg-white/5 rounded" /></Card>;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <SettingsIcon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">System Information</h3>
        </div>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <SettingRow label="Version" value="1.0.0" />
          <SettingRow label="Environment" value={system?.nodeEnv || "—"} />
          <SettingRow label="Uptime" value={`${Math.floor((system?.uptime ?? 0) / 60)}m`} />
          <SettingRow label="Main status" value={system?.main || "—"} />
          <SettingRow label="Workers online" value={`${system?.workers?.online ?? 0}`} />
          <SettingRow label="Workers total" value={`${system?.workers?.total ?? 0}`} />
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Worker Defaults</h3>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <SettingRow label="Heartbeat interval" value={`${system?.config?.heartbeatIntervalMs ?? 10000}ms`} />
          <SettingRow label="Stale threshold" value={`${system?.config?.heartbeatStaleMs ?? 30000}ms`} />
          <SettingRow label="Offline threshold" value={`${system?.config?.heartbeatOfflineMs ?? 60000}ms`} />
          <SettingRow label="Grace period" value={`${Math.floor((system?.config?.gracePeriodMs ?? 300000) / 1000)}s`} />
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">Scheduling</h3>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <SettingRow label="Overcommit" value={system?.config?.overcommitEnabled ? "ENABLED" : "DISABLED"} valueClass={system?.config?.overcommitEnabled ? "text-warning" : "text-success"} />
          <SettingRow label="Minimum CPU" value="1 core" />
          <SettingRow label="CPU reserve" value={`${system?.config?.cpuReserveCores ?? 1} cores`} />
          <SettingRow label="RAM reserve" value={`${system?.config?.ramReserveMb ?? 1024} MB`} />
          <SettingRow label="Disk reserve" value={`${system?.config?.diskReserveGb ?? 5} GB`} />
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3">API Endpoints</h3>
        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/20 border border-border/40 rounded-md p-3 overflow-x-auto">
{`POST   /api/auth/login            POST /api/workloads
POST   /api/auth/logout           GET  /api/workloads
GET    /api/auth/session          GET  /api/workloads/:id
GET    /api/account/sessions      DEL  /api/workloads/:id
GET    /api/account/preferences   POST /api/workloads/:id/clone
POST   /api/account/change-password POST /api/workloads/:id/logs
POST   /api/account/change-email  POST /api/workloads/bulk
GET    /api/api-tokens            GET  /api/workload-templates
POST   /api/api-tokens            POST /api/workload-templates
DELETE /api/api-tokens/:id        GET  /api/alerts
GET    /api/alerts                POST /api/alerts/:id/acknowledge
GET    /api/audit-logs            GET  /api/notifications
GET    /api/registration-tokens   GET  /api/export/workloads?format=csv
POST   /api/registration-tokens   GET  /api/export/nodes?format=csv
DELETE /api/registration-tokens   GET  /api/system/status
GET    /api/nodes                 GET  /api/resources
POST   /api/nodes/register        GET  /api/resources/summary
POST   /api/nodes/heartbeat       GET  /api/metrics
GET    /api/nodes/:id              GET  /api/metrics/history
DELETE /api/nodes/:id              PUT  /api/nodes/:id/metadata
POST   /api/nodes/:id/drain        POST /api/nodes/:id/maintenance
POST   /api/nodes/:id/enable       POST /api/nodes/:id/rotate-token
POST   /api/nodes/:id/disable`}
        </pre>
      </Card>
    </div>
  );
}

function SettingRow({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-muted-foreground text-xs uppercase tracking-wider">{label}</dt>
      <dd className={`font-medium text-sm ${valueClass}`}>{value}</dd>
    </div>
  );
}
