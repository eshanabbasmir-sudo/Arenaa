// BigInt-safe JSON serializer.
// Prisma returns BigInt for BigInt columns; JSON.stringify throws on BigInt by default.

export function toJson(obj: unknown): any {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
}

// Convert BigInt values in a record to Numbers (lossy for >2^53 but fine for our magnitudes).
export function serializeForJson<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj) as unknown as T;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(serializeForJson) as unknown as T;
  if (obj instanceof Date) return obj as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = serializeForJson(v);
  }
  return out as unknown as T;
}
