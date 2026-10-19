// DARKPOOL dispatch queue.
// Simple in-memory instruction queue (since SQLite doesn't have LISTEN/NOTIFY in our setup,
// and we want immediate pickup). In production, swap for Redis/BullMQ.

// Each node has its own queue. Instructions are best-effort; if the agent misses one,
// it should also poll GET /api/workloads/assigned for full reconciliation.

export type InstructionType =
  | "start_workload"
  | "stop_workload"
  | "delete_workload"
  | "rotate_token"
  | "ping"
  | "exec_terminal";

export interface Instruction {
  id: string;
  type: InstructionType;
  nodeId: string; // public nodeId (worker-xxx)
  payload: Record<string, unknown>;
  createdAt: number;
}

const queues = new Map<string, Instruction[]>();

export function enqueueInstruction(nodeId: string, type: InstructionType, payload: Record<string, unknown> = {}): string {
  const id = `instr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const instr: Instruction = {
    id,
    type,
    nodeId,
    payload,
    createdAt: Date.now(),
  };
  if (!queues.has(nodeId)) queues.set(nodeId, []);
  queues.get(nodeId)!.push(instr);
  return id;
}

export function dequeueInstructions(nodeId: string, max = 50): Instruction[] {
  const q = queues.get(nodeId);
  if (!q || q.length === 0) return [];
  const out = q.splice(0, max);
  return out;
}

export function peekInstructions(nodeId: string): number {
  return queues.get(nodeId)?.length ?? 0;
}

// Terminal sessions: each terminal session maps to a workload + node.
// We route terminal bytes via a per-session channel.
export interface TerminalChannel {
  sessionId: string;
  nodeId: string;
  workloadId: string;
  // input buffers (from client → agent)
  inputBuffer: Uint8Array[];
  // output buffers (from agent → client)
  outputBuffer: Uint8Array[];
  // subscribers waiting for output
  outputWaiters: Array<() => void>;
  // subscribers waiting for input
  inputWaiters: Array<() => void>;
  // exit signals
  closed: boolean;
  exited: boolean;
  exitCode?: number;
  resizeQueue: Array<{ cols: number; rows: number }>;
}

const terminals = new Map<string, TerminalChannel>();

export function createTerminalChannel(sessionId: string, nodeId: string, workloadId: string): TerminalChannel {
  const ch: TerminalChannel = {
    sessionId,
    nodeId,
    workloadId,
    inputBuffer: [],
    outputBuffer: [],
    outputWaiters: [],
    inputWaiters: [],
    closed: false,
    exited: false,
    resizeQueue: [],
  };
  terminals.set(sessionId, ch);
  return ch;
}

export function getTerminalChannel(sessionId: string): TerminalChannel | undefined {
  return terminals.get(sessionId);
}

export function closeTerminalChannel(sessionId: string) {
  const ch = terminals.get(sessionId);
  if (ch) {
    ch.closed = true;
    ch.exited = true;
    ch.outputWaiters.forEach((fn) => fn());
    ch.inputWaiters.forEach((fn) => fn());
  }
  terminals.delete(sessionId);
}

export function listTerminalsForNode(nodeId: string): TerminalChannel[] {
  const out: TerminalChannel[] = [];
  for (const ch of terminals.values()) {
    if (ch.nodeId === nodeId) out.push(ch);
  }
  return out;
}

// Helper: push bytes from client to agent input buffer
export function pushTerminalInput(sessionId: string, data: Uint8Array) {
  const ch = terminals.get(sessionId);
  if (!ch || ch.closed) return;
  ch.inputBuffer.push(data);
  ch.inputWaiters.forEach((fn) => fn());
  ch.inputWaiters.length = 0;
}

// Helper: agent reads pending input
export function drainTerminalInput(sessionId: string): Uint8Array | null {
  const ch = terminals.get(sessionId);
  if (!ch) return null;
  if (ch.inputBuffer.length === 0) return null;
  const chunks = ch.inputBuffer.splice(0);
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// Helper: agent pushes output bytes
export function pushTerminalOutput(sessionId: string, data: Uint8Array) {
  const ch = terminals.get(sessionId);
  if (!ch || ch.closed) return;
  ch.outputBuffer.push(data);
  ch.outputWaiters.forEach((fn) => fn());
  ch.outputWaiters.length = 0;
}

// Helper: client reads pending output (non-blocking). Returns null if no data.
export function drainTerminalOutput(sessionId: string): Uint8Array | null {
  const ch = terminals.get(sessionId);
  if (!ch) return null;
  if (ch.outputBuffer.length === 0) return null;
  const chunks = ch.outputBuffer.splice(0);
  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// Mark agent exit
export function markTerminalExited(sessionId: string, exitCode: number) {
  const ch = terminals.get(sessionId);
  if (!ch) return;
  ch.exited = true;
  ch.exitCode = exitCode;
  ch.outputWaiters.forEach((fn) => fn());
}
