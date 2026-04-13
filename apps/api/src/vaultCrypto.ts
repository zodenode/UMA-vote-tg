import crypto from "node:crypto";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

/** Parse VAULT_MASTER_KEY: 64 hex chars or base64 encoding 32 bytes. */
export function parseVaultMasterKey(raw: string | undefined): Buffer {
  if (!raw?.trim()) {
    throw new Error("VAULT_MASTER_KEY is not set");
  }
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, "hex");
  }
  const b = Buffer.from(t, "base64");
  if (b.length !== KEY_LENGTH) {
    throw new Error("VAULT_MASTER_KEY must be 32 bytes (64 hex chars or base64)");
  }
  return b;
}

export function encryptPrivateKey(
  masterKey: Buffer,
  privateKeyHex: `0x${string}`
): { iv: string; ciphertextB64: string; authTagB64: string } {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error("Invalid master key length");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv, { authTagLength: 16 });
  const body = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  if (!/^[0-9a-fA-F]{64}$/.test(body)) {
    throw new Error("Invalid private key hex");
  }
  const plain = Buffer.from(body, "hex");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    ciphertextB64: enc.toString("base64"),
    authTagB64: authTag.toString("base64"),
  };
}

export function decryptPrivateKey(
  masterKey: Buffer,
  ivB64: string,
  ciphertextB64: string,
  authTagB64: string
): `0x${string}` {
  const iv = Buffer.from(ivB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv, { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  const hex = plain.toString("hex");
  return `0x${hex}` as `0x${string}`;
}
