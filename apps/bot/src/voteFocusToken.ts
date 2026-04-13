import { Buffer } from "node:buffer";

/** Match apps/web/src/voteFocusToken.ts for bot deep links (base64url, no padding). */

export function encodeVoteFocusToken(id: string): string {
  return Buffer.from(id, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
