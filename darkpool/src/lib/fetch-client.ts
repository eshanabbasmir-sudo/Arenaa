// DARKPOOL client-side fetch helper.
// All API calls go through this. Auto-handles JSON and errors.

export async function fetchApi<T = any>(path: string, init: RequestInit & { body?: any } = {}): Promise<T & { ok?: boolean; error?: string }> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
  };
  if (init.body && typeof init.body === "object" && !(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  try {
    const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text, ok: false }; }
    if (!res.ok) {
      return { ok: false, status: res.status, error: json.error || `HTTP ${res.status}` } as any;
    }
    return json;
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error" } as any;
  }
}
