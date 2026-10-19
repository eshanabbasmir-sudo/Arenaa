"use client";

import { DarkpoolLogo } from "@/components/login-screen";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Server,
  Container,
  Terminal,
  HardDrive,
  Network,
  ScrollText,
  Settings,
  X,
  LogOut,
} from "lucide-react";
import type { ViewKey, SessionUser } from "@/app/page";
import { Button } from "@/components/ui/button";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "nodes", label: "Workers", icon: Server },
  { key: "workloads", label: "Workloads", icon: Container },
  { key: "terminal", label: "Terminal", icon: Terminal },
  { key: "storage", label: "Storage", icon: HardDrive },
  { key: "network", label: "Network", icon: Network },
  { key: "logs", label: "Logs", icon: ScrollText },
  { key: "settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV: NavItem[] = [
  { key: "dashboard", label: "Home", icon: LayoutDashboard },
  { key: "nodes", label: "Workers", icon: Server },
  { key: "workloads", label: "Workloads", icon: Container },
  { key: "terminal", label: "Terminal", icon: Terminal },
];

export function Sidebar({
  view,
  onNavigate,
  mobileOpen,
  onMobileClose,
  user,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  user: SessionUser;
}) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-[232px] flex-col border-r border-border/50 bg-sidebar/40 backdrop-blur-sm flex-shrink-0">
        <SidebarContent view={view} onNavigate={onNavigate} user={user} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-sidebar border-r border-border/50 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <DarkpoolLogo className="w-7 h-7" />
                <span className="font-semibold tracking-wide">DARKPOOL</span>
              </div>
              <Button variant="ghost" size="icon" onClick={onMobileClose} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <SidebarContent view={view} onNavigate={onNavigate} user={user} />
          </aside>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-sidebar/95 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1 p-2">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key || (item.key === "nodes" && view === "node-detail");
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs transition-colors",
                  active ? "text-violet bg-violet/10" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function SidebarContent({
  view,
  onNavigate,
  user,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  user: SessionUser;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="hidden md:flex items-center gap-2.5 px-5 py-5 border-b border-border/40">
        <DarkpoolLogo className="w-7 h-7" />
        <div className="flex flex-col">
          <span className="font-semibold tracking-wide text-[15px]">DARKPOOL</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
            Control Plane
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            view === item.key ||
            (item.key === "nodes" && view === "node-detail");
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group relative",
                active
                  ? "bg-violet/10 text-violet"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-violet rounded-r-full" />
              )}
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border/40 p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-violet/20 flex items-center justify-center text-violet text-xs font-semibold">
            {(user.email[0] || "A").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user.email}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {user.role}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
