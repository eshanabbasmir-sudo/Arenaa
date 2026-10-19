"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { fetchApi } from "@/lib/fetch-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot, StatusBadge } from "@/components/status-dot";
import { ArrowLeft, Maximize2, Minimize2, RefreshCw, Trash2, X, Terminal as TerminalIcon } from "@/components/icons";
import { fmtRelative } from "@/lib/format";
import { toast } from "sonner";

export function TerminalView({
  workloadId, onBack,
}: {
  workloadId: string | null;
  onBack: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [workload, setWorkload] = useState<any | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load workload
  useEffect(() => {
    if (!workloadId) return;
    fetchApi(`/api/workloads/${workloadId}`).then((res) => {
      if (res.ok && res.workload) setWorkload(res.workload);
      setLoading(false);
    });
  }, [workloadId]);

  // init terminal once container is available AND workload is running
  const initTerminal = useCallback(async () => {
    if (!containerRef.current || !workloadId) return;
    if (workload && workload.status !== "running") return;

    const term = new Terminal({
      fontFamily: "var(--font-geist-mono), JetBrains Mono, Menlo, monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: "bar",
      theme: {
        background: "#07090D",
        foreground: "#E6EAF2",
        cursor: "#7C5CFF",
        cursorAccent: "#07090D",
        selectionBackground: "#7C5CFF44",
        black: "#07090D",
        red: "#F25555",
        green: "#3DD68C",
        yellow: "#F2B544",
        blue: "#4DA8F2",
        magenta: "#7C5CFF",
        cyan: "#4DD4F4",
        white: "#E6EAF2",
        brightBlack: "#5A6473",
        brightRed: "#FF6B6B",
        brightGreen: "#5BDF9F",
        brightYellow: "#FFC562",
        brightBlue: "#6FB8FF",
        brightMagenta: "#9C7CFF",
        brightCyan: "#6DDFF4",
        brightWhite: "#FFFFFF",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.writeln("\x1b[1;35mDARKPOOL Terminal\x1b[0m");
    term.writeln("\x1b[2mConnecting to workspace...\x1b[0m");

    let closed = false;

    // open session
    const res = await fetchApi("/api/terminal/session", {
      method: "POST",
      body: { workloadId },
    });
    if (!res.ok) {
      term.writeln(`\x1b[31mFailed to open session: ${res.error || "unknown"}\x1b[0m`);
      setError(res.error || "Failed to open session");
      return;
    }
    sessionIdRef.current = res.sessionId;
    setConnected(true);
    term.writeln(`\x1b[32mConnected (session ${res.sessionId.slice(0, 16)}...)\x1b[0m`);
    term.writeln("");

    // user input → push to backend
    term.onData((data) => {
      const b64 = btoa(data);
      fetchApi(`/api/terminal/${res.sessionId}`, {
        method: "PUT",
        body: { input: b64 },
      });
    });

    // resize
    term.onResize(({ cols, rows }) => {
      fetchApi(`/api/terminal/${res.sessionId}`, {
        method: "PUT",
        body: { resize: { cols, rows } },
      });
    });

    // poll output
    const poll = setInterval(async () => {
      if (!sessionIdRef.current || closed) return;
      const r = await fetchApi(`/api/terminal/${sessionIdRef.current}`);
      if (r.ok && r.output) {
        try {
          const bytes = Uint8Array.from(atob(r.output), (c) => c.charCodeAt(0));
          term.write(bytes);
        } catch {}
      }
      if (r.exited) {
        term.writeln(`\x1b[33m\n[process exited${r.exitCode !== undefined ? ` code ${r.exitCode}` : ""}]\x1b[0m`);
        setConnected(false);
        clearInterval(poll);
      }
    }, 250);

    return () => {
      closed = true;
      clearInterval(poll);
      // request close on backend
      if (sessionIdRef.current) {
        fetchApi(`/api/terminal/${sessionIdRef.current}`, {
          method: "PUT",
          body: { close: true },
        });
      }
      term.dispose();
      termRef.current = null;
    };
  }, [workloadId, workload]);

  useEffect(() => {
    if (!loading && workload?.status === "running") {
      const cleanup = initTerminal();
      return () => { cleanup?.then?.((fn) => fn?.()); };
    }
  }, [loading, workload, initTerminal]);

  // window resize → refit
  useEffect(() => {
    const onResize = () => {
      if (fitRef.current && termRef.current) {
        try { fitRef.current.fit(); } catch {}
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const close = () => {
    if (sessionIdRef.current) {
      fetchApi(`/api/terminal/${sessionIdRef.current}`, {
        method: "PUT",
        body: { close: true },
      });
    }
    onBack();
  };

  if (!workloadId) {
    return (
      <div className="p-6 md:p-8">
        <Card className="p-8 text-center">
          <TerminalIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium mb-2">No workspace selected</p>
          <Button onClick={onBack} variant="outline">Back to workloads</Button>
        </Card>
      </div>
    );
  }

  if (loading) return <div className="p-6 md:p-8"><div className="h-96 rounded-xl bg-white/5 animate-pulse" /></div>;

  if (workload && workload.status !== "running") {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
        </Button>
        <Card className="p-8 text-center">
          <TerminalIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-base font-medium mb-1">Workspace is not running</p>
          <p className="text-sm text-muted-foreground mb-4">
            Current status: <StatusBadge status={workload.status} />. Start the workspace before opening a terminal.
          </p>
          <Button onClick={onBack} variant="outline">Back to workloads</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${fullscreen ? "fixed inset-0 z-50 p-4 bg-background" : "p-4 md:p-8"}`}>
      {!fullscreen && (
        <div className="flex items-center justify-between mb-3 max-w-7xl mx-auto w-full">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back
          </Button>
        </div>
      )}

      <div className={`flex-1 ${fullscreen ? "" : "max-w-7xl mx-auto w-full"} flex flex-col gap-3`}>
        {/* Terminal top bar */}
        <Card className="p-3 border-border/60 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <StatusDot status={connected ? "running" : "offline"} pulse={connected} />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {workload?.name || workloadId}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {workloadId} · {workload?.nodeName || workload?.nodeId || "—"} · {workload?.image}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  if (termRef.current) {
                    termRef.current.clear();
                  }
                }}
                title="Clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => { if (fitRef.current) fitRef.current.fit(); }}
                title="Refit"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setFullscreen(!fullscreen)}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-danger"
                onClick={close}
                title="Close session"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Terminal body */}
        <div
          ref={containerRef}
          className="flex-1 rounded-lg border border-border/60 overflow-hidden bg-[#07090D] min-h-[400px]"
          style={{ minHeight: fullscreen ? "calc(100vh - 160px)" : "500px" }}
        />

        {/* Info footer */}
        <Card className="p-2.5 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                <StatusBadge status={connected ? "running" : "offline"} />
              </span>
              <span className="text-muted-foreground">
                CPU: <span className="text-foreground font-medium">{workload?.cpuLimit || 1} cores</span>
              </span>
              <span className="text-muted-foreground">
                RAM: <span className="text-foreground font-medium">{workload?.ramLimitMb || 0} MB</span>
              </span>
              <span className="text-muted-foreground">
                Disk: <span className="text-foreground font-medium">{workload?.diskLimitMb || 0} MB</span>
              </span>
            </div>
            <span className="text-muted-foreground">
              Created {fmtRelative(workload?.createdAt)}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
