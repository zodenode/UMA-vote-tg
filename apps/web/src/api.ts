const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

const WEB_PETITION_SESSION_KEY = "umaWebPetitionSession";
const WEB_SESSION_EVENT = "uma-web-petition-session";

function bodyUsesTelegramInit(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const id = (body as { initData?: unknown }).initData;
  return typeof id === "string" && id.trim().length > 0;
}

function httpErrorMessage(status: number, text: string): string {
  try {
    const j = JSON.parse(text) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* ignore */
  }
  return text.trim().slice(0, 800) || `HTTP ${status}`;
}

export function getWebPetitionSession(): string {
  try {
    return sessionStorage.getItem(WEB_PETITION_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function apiGet<T>(path: string, opts?: { withWebAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts?.withWebAuth) {
    const tok = getWebPetitionSession();
    if (tok) headers.authorization = `Bearer ${tok}`;
  }
  const r = await fetch(`${base}${path}`, {
    headers: Object.keys(headers).length ? headers : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(httpErrorMessage(r.status, text));
  return JSON.parse(text) as T;
}

export function setWebPetitionSession(token: string | null) {
  try {
    if (token) sessionStorage.setItem(WEB_PETITION_SESSION_KEY, token);
    else sessionStorage.removeItem(WEB_PETITION_SESSION_KEY);
    window.dispatchEvent(new Event(WEB_SESSION_EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeWebPetitionSession(cb: () => void) {
  window.addEventListener(WEB_SESSION_EVENT, cb);
  return () => window.removeEventListener(WEB_SESSION_EVENT, cb);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const webTok = getWebPetitionSession();
  if (webTok && !bodyUsesTelegramInit(body)) {
    headers.authorization = `Bearer ${webTok}`;
  }
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(httpErrorMessage(r.status, text));
  return JSON.parse(text) as T;
}

export async function webPetitionSignOut(): Promise<void> {
  await apiPost<{ ok: boolean }>("/api/web/petition/sign-out", {});
  setWebPetitionSession(null);
}

export async function webPetitionVerify(signature: string, message: string, issuedAt: string) {
  return apiPost<{ ok: boolean; token: string; userId: string; address: string; ttlDays: number }>(
    "/api/web/petition/verify",
    { message, signature, issuedAt }
  );
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
