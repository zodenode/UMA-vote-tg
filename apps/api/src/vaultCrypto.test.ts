import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptPrivateKey, decryptPrivateKey, parseVaultMasterKey } from "./vaultCrypto.js";

describe("vaultCrypto", () => {
  it("round-trips a private key", () => {
    const master = Buffer.alloc(32, 7);
    const pk =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
    const enc = encryptPrivateKey(master, pk);
    const out = decryptPrivateKey(master, enc.iv, enc.ciphertextB64, enc.authTagB64);
    assert.equal(out, pk);
  });

  it("parseVaultMasterKey accepts hex", () => {
    const hex = "01".repeat(32);
    const b = parseVaultMasterKey(hex);
    assert.equal(b.length, 32);
    assert.equal(b[0], 1);
  });
});
