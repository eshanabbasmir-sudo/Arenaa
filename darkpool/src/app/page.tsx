"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchApi } from "@/lib/fetch-client";
import { LoginScreen, DarkpoolLogo } from "@/components/login-screen";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { DashboardView } from "@/components/views/dashboard";
import { NodesView } from "@/components/views/nodes";
import { NodeDetail } from "@/components/views/node-detail";
import { WorkloadsView } from "@/components/views/workloads";
import { TerminalView } from "@/components/views/terminal";
import { StorageView } from "@/components/views/storage";
import { NetworkView } from "@/components/views/network";
import { LogsView } from "@/components/views/logs";
import { SettingsView } from "@/components/views/settings";
import { Toaster as ToastToaster } from "@/components/ui/sonner";

export type ViewKey =
  | "dashboard"
  | "nodes"
  | "node-detail"
  | "workloads"
  | "terminal"
  | "storage"
  | "network"
  | "logs"
  | "settings";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function Page() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const checkSession = useCallback(async () => {
    const res = await fetchApi("/api/auth/session");
    if (res.ok && res.user) {
      setUser(res.user);
    } else {
      setUser(null);
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse">
          <DarkpoolLogo className="w-12 h-12" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogged={checkSession} />;
  }

  const openNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setView("node-detail");
  };

  const openTerminal = (workloadId: string) => {
    setSelectedWorkloadId(workloadId);
    setView("terminal");
  };

  const navigate = (v: ViewKey) => {
    setView(v);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar
        view={view}
        onNavigate={navigate}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        user={user}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          view={view}
          user={user}
          onMobileNav={() => setMobileNavOpen(true)}
          onLogout={async () => {
            await fetchApi("/api/auth/logout", { method: "POST" });
            setUser(null);
          }}
        />
        <main className="flex-1 overflow-auto">
          {view === "dashboard" && (
            <DashboardView onOpenNode={openNode} onNavigate={navigate} />
          )}
          {view === "nodes" && <NodesView onOpenNode={openNode} />}
          {view === "node-detail" && selectedNodeId && (
            <NodeDetail nodeId={selectedNodeId} onBack={() => navigate("nodes")} onOpenTerminal={openTerminal} />
          )}
          {view === "workloads" && (
            <WorkloadsView onOpenTerminal={openTerminal} />
          )}
          {view === "terminal" && (
            <TerminalView workloadId={selectedWorkloadId} onBack={() => navigate("workloads")} />
          )}
          {view === "storage" && <StorageView onOpenNode={openNode} />}
          {view === "network" && <NetworkView onOpenNode={openNode} />}
          {view === "logs" && <LogsView />}
          {view === "settings" && <SettingsView user={user} />}
        </main>
      </div>
      <ToastToaster />
    </div>
  );
}
