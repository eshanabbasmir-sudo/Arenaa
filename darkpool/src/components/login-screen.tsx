"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";

export function LoginScreen({ onLogged }: { onLogged: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      toast.error("Please enter both email and password");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchApi("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password },
      });
      if (res.ok) {
        toast.success("Logged in");
        onLogged();
      } else {
        toast.error(res.error || "Invalid email or password");
      }
    } catch (e: any) {
      toast.error(e?.message || "Login failed — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      {/* ambient gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--violet), transparent 60%)" }}
        />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <DarkpoolLogo className="w-14 h-14 mb-4" />
          <h1 className="text-3xl font-semibold tracking-tight">DARKPOOL</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One control plane. Multiple machines. One resource pool.
          </p>
        </div>

        <Card className="p-7 bg-card/80 backdrop-blur-sm border-border/60">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@admin.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-violet hover:bg-violet/90">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border/60">
            <div className="flex items-start gap-3 text-xs text-muted-foreground">
              <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground/80 mb-1">Default admin</p>
                <p>
                  Email: <code className="bg-muted/40 px-1 rounded">admin@admin.com</code>
                  {" · "}
                  Password: <code className="bg-muted/40 px-1 rounded">admin123!</code>
                </p>
                <p className="mt-1.5 text-muted-foreground/70">
                  Change these in production via the <code className="bg-muted/40 px-1 rounded">DEFAULT_ADMIN_EMAIL</code> / <code className="bg-muted/40 px-1 rounded">DEFAULT_ADMIN_PASSWORD</code> env vars.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          DARKPOOL v1.0.0 · Distributed VPS Resource Pool
        </p>
      </div>
    </div>
  );
}

export function DarkpoolLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* central node + 4 satellites */}
      <line x1="20" y1="20" x2="8" y2="8" stroke="var(--violet)" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="20" x2="32" y2="8" stroke="var(--violet)" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="20" x2="8" y2="32" stroke="var(--violet)" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="20" x2="32" y2="32" stroke="var(--violet)" strokeWidth="1.5" opacity="0.5" />
      <circle cx="8" cy="8" r="3" fill="var(--cyan)" />
      <circle cx="32" cy="8" r="3" fill="var(--cyan)" />
      <circle cx="8" cy="32" r="3" fill="var(--cyan)" />
      <circle cx="32" cy="32" r="3" fill="var(--cyan)" />
      <circle cx="20" cy="20" r="6" fill="var(--violet)" />
      <circle cx="20" cy="20" r="3" fill="white" opacity="0.6" />
    </svg>
  );
}
