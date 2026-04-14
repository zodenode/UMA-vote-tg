/** URL-safe encoding of dispute / focus ids (same as Mini App + bot). */

export function encodeVoteFocusToken(id: string): string {
  const b = new TextEncoder().encode(id);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeVoteFocusToken(token: string): string | null {
  if (!token || token.length > 512) return null;
  try {
    const padLen = (4 - (token.length % 4)) % 4;
    const pad = padLen ? "=".repeat(padLen) : "";
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
