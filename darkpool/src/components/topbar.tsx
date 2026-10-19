"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { Menu, Bell, Search, Settings, LogOut, ChevronRight, Server, Container } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ViewKey, SessionUser } from "@/app/page";

const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  nodes: "Workers",
  "node-detail": "Worker Details",
  workloads: "Workloads",
  terminal: "Terminal",
  storage: "Storage",
  network: "Network",
  logs: "Logs",
  settings: "Settings",
};

export function TopBar({
  view,
  user,
  onMobileNav,
  onLogout,
}: {
  view: ViewKey;
  user: SessionUser;
  onMobileNav: () => void;
  onLogout: () => void;
}) {
  const [online, setOnline] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Connection health poll
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/system/status", { credentials: "same-origin" });
        if (res.ok) {
          setOnline(true);
          setReconnecting(false);
        } else {
          setOnline(false);
          setReconnecting(true);
        }
      } catch {
        setOnline(false);
        setReconnecting(true);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  // Global search (workers + workloads)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const [nodes, workloads] = await Promise.all([
        fetchApi("/api/nodes"),
        fetchApi("/api/workloads"),
      ]);
      const q = searchQuery.toLowerCase();
      const results: any[] = [];
      if (nodes.ok && nodes.nodes) {
        for (const n of nodes.nodes) {
          if (
            n.nodeId.toLowerCase().includes(q) ||
            (n.displayName || "").toLowerCase().includes(q) ||
            n.hostname?.toLowerCase().includes(q)
          ) {
            results.push({ type: "worker", id: n.nodeId, label: n.displayName || n.nodeId, sub: n.nodeId });
          }
        }
      }
      if (workloads.ok && workloads.workloads) {
        for (const w of workloads.workloads) {
          if (
            w.workloadId.toLowerCase().includes(q) ||
            w.name.toLowerCase().includes(q) ||
            (w.nodeId || "").toLowerCase().includes(q)
          ) {
            results.push({ type: "workload", id: w.workloadId, label: w.name, sub: w.workloadId });
          }
        }
      }
      setSearchResults(results.slice(0, 10));
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center h-14 px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMobileNav}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="hidden md:flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">DARKPOOL</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
            <span className="font-medium">{VIEW_TITLES[view]}</span>
          </div>

          <div className="flex-1 max-w-md mx-auto md:mx-0 md:ml-6">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-card/50 text-sm text-muted-foreground hover:bg-card hover:border-border transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Search workers, workloads, logs…</span>
              <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/40">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  reconnecting && "bg-warning animate-pulse",
                  online && !reconnecting && "bg-success pulse-dot text-success",
                  !online && "bg-danger"
                )}
              />
              <span className="hidden md:inline text-xs text-muted-foreground">
                {online && !reconnecting ? "System Online" : reconnecting ? "Reconnecting…" : "Offline"}
              </span>
            </div>

            <Button variant="ghost" size="icon" className="h-9 w-9" title="Notifications">
              <Bell className="w-4 h-4" />
            </Button>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setMenuOpen(!menuOpen)}
                title="Account"
              >
                <div className="w-7 h-7 rounded-full bg-violet/20 flex items-center justify-center text-violet text-xs font-semibold">
                  {(user.email[0] || "A").toUpperCase()}
                </div>
              </Button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border/60 bg-popover shadow-xl py-1 z-50"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-border/40">
                    <p className="text-xs font-medium truncate">{user.email}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{user.role}</p>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); /* TODO settings */ }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    Settings
                  </button>
                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left text-danger"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Command palette / search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 bg-black/70 backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-xl rounded-xl border border-border/60 bg-popover shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workers, workloads…"
                className="border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {searchQuery && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No matches for &ldquo;{searchQuery}&rdquo;
                </p>
              )}
              {!searchQuery && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Type to search workers and workloads…
                </p>
              )}
              {searchResults.map((r) => (
                <a
                  key={`${r.type}-${r.id}`}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold",
                    r.type === "worker" ? "bg-cyan/15 text-cyan" : "bg-violet/15 text-violet"
                  )}>
                    {r.type === "worker" ? <Server className="w-4 h-4" /> : <Container className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.sub}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.type}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
