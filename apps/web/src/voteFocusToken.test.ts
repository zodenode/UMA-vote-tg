import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeVoteFocusToken, encodeVoteFocusToken } from "./voteFocusToken.js";

describe("voteFocusToken", () => {
  it("round-trips a dispute id used in /votes/dispute/:token links", () => {
    const id = "polymarket:137:0xabc:12345";
    const token = encodeVoteFocusToken(id);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(!token.includes("="));
    assert.equal(decodeVoteFocusToken(token), id);
  });

  it("round-trips unicode", () => {
    const id = "测试 🔗";
    const token = encodeVoteFocusToken(id);
    assert.equal(decodeVoteFocusToken(token), id);
  });

  it("returns null for oversized tokens (Telegram start_param limit)", () => {
    assert.equal(decodeVoteFocusToken("x".repeat(513)), null);
  });

  it("returns null for invalid base64url", () => {
    assert.equal(decodeVoteFocusToken("!!!"), null);
  });
});
