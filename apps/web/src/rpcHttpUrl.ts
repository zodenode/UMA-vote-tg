/** viem `http()` transport expects http(s): — same mapping as API `toHttpRpcUrl`. */
export function rpcHttpUrl(rpcUrl: string | undefined): string | undefined {
  if (!rpcUrl?.trim()) return undefined;
  const t = rpcUrl.trim();
  if (t.startsWith("wss://")) return `https://${t.slice(6)}`;
  if (t.startsWith("ws://")) return `http://${t.slice(5)}`;
  return t;
}
