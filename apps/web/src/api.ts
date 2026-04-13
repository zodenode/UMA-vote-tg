const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

export function getStartParam(): string | null {
  try {
    const u = window.Telegram?.WebApp?.initDataUnsafe as { start_param?: string } | undefined;
    if (u?.start_param && typeof u.start_param === "string") return u.start_param;
  } catch {
    /* ignore */
  }
  try {
    const h = window.location.hash.slice(1);
    if (h) {
      const q = new URLSearchParams(h);
      const fromHash = q.get("tgWebAppStartParam");
      if (fromHash) return fromHash;
    }
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get("tgWebAppStartParam") ?? q.get("startapp");
  } catch {
    return null;
  }
}

export function getTelegramChat(): { id: number; title?: string; type?: string } | null {
  const u = window.Telegram?.WebApp?.initDataUnsafe as {
    chat?: { id: number; title?: string; type?: string };
  } | undefined;
  return u?.chat ?? null;
}
