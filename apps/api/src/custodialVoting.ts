import type Database from "better-sqlite3";
import {
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  isAddress,
  getAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, polygon } from "viem/chains";
import crypto from "node:crypto";
import { MAINNET } from "./contracts.js";
import { toHttpRpcUrl } from "./disputePoll.js";
import { decryptPrivateKey } from "./vaultCrypto.js";
import { getDvmTiming } from "./dvmTiming.js";

const votingV2Abi = [
  {
    inputs: [],
    name: "getVotePhase",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentRoundId",
    outputs: [{ type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "caller", type: "address" }],
    name: "getVoterFromDelegate",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "identifier", type: "bytes32" },
      { name: "time", type: "uint256" },
      { name: "ancillaryData", type: "bytes" },
      { name: "hash", type: "bytes32" },
    ],
    name: "commitVote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "identifier", type: "bytes32" },
      { name: "time", type: "uint256" },
      { name: "price", type: "int256" },
      { name: "ancillaryData", type: "bytes" },
      { name: "salt", type: "int256" },
    ],
    name: "revealVote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function randomVoteSalt(): bigint {
  const buf = crypto.randomBytes(32);
  let x = 0n;
  for (const b of buf) x = (x << 8n) | BigInt(b);
  const MOD = 2n ** 256n;
  const HALF = 2n ** 255n;
  return x >= HALF ? x - MOD : x;
}

function computeVoteCommitHash(params: {
  price: bigint;
  salt: bigint;
  voter: Address;
  time: bigint;
  ancillaryData: Hex;
  roundId: bigint;
  identifier: Hex;
}): Hex {
  return keccak256(
    encodePacked(
      ["int256", "int256", "address", "uint256", "bytes", "uint256", "bytes32"],
      [
        params.price,
        params.salt,
        params.voter,
        params.time,
        params.ancillaryData,
        params.roundId,
        params.identifier,
      ]
    )
  );
}

function ancillaryToHex(raw: string): Hex {
  const s = raw.trim();
  if (!s || s === "0x") return "0x";
  return s.startsWith("0x") ? (s as Hex) : (`0x${s}` as Hex);
}

function identifierToHex(id: string): Hex {
  const s = id.trim();
  if (s.startsWith("0x")) return s as Hex;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return `0x${s}` as Hex;
  return s as Hex;
}

export type VaultRow = {
  telegram_id: string;
  address: string;
  enc_private_key: Buffer;
  iv: string;
  auth_tag: string;
  key_version: number;
  exported_once: number;
};

function ciphertextToB64(enc: Buffer): string {
  return Buffer.from(enc).toString("base64");
}

export function getVault(db: Database.Database, telegramId: string): VaultRow | undefined {
  return db
    .prepare(
      `SELECT telegram_id, address, enc_private_key, iv, auth_tag, key_version, exported_once FROM user_vaults WHERE telegram_id = ?`
    )
    .get(telegramId) as VaultRow | undefined;
}

export function createVaultForUser(
  db: Database.Database,
  telegramId: string,
  address: string,
  ciphertext: Buffer,
  iv: string,
  authTagB64: string
): void {
  db.prepare(
    `INSERT INTO user_vaults (telegram_id, address, enc_private_key, iv, auth_tag, key_version, exported_once)
     VALUES (?, ?, ?, ?, ?, 1, 0)`
  ).run(telegramId, address, ciphertext, iv, authTagB64);
}

function decryptVaultKey(masterKey: Buffer, vault: VaultRow): `0x${string}` {
  const ctB64 = ciphertextToB64(vault.enc_private_key);
  return decryptPrivateKey(masterKey, vault.iv, ctB64, vault.auth_tag);
}

export async function custodialCommitVote(opts: {
  db: Database.Database;
  masterKey: Buffer;
  publicClient: PublicClient;
  ethRpcUrl: string;
  telegramId: string;
  disputeKey: string;
  dispute: {
    dispute_key: string;
    identifier: string;
    timestamp: string;
    ancillary_data: string;
  };
  price: bigint;
}): Promise<{ txHash: Hex }> {
  const vault = getVault(opts.db, opts.telegramId);
  if (!vault) throw new Error("No vault for user");

  const dvm = await getDvmTiming(opts.publicClient);
  if (!dvm || dvm.phase !== "commit") {
    throw new Error("DVM is not in commit phase (or RPC unavailable)");
  }

  const pk = decryptVaultKey(opts.masterKey, vault);
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(toHttpRpcUrl(opts.ethRpcUrl)),
  });

  const identifier = identifierToHex(opts.dispute.identifier);
  const time = BigInt(opts.dispute.timestamp);
  const ancillaryData = ancillaryToHex(opts.dispute.ancillary_data);
  const roundId = await opts.publicClient.readContract({
    address: MAINNET.votingV2,
    abi: votingV2Abi,
    functionName: "getCurrentRoundId",
  });
  const voter = await opts.publicClient.readContract({
    address: MAINNET.votingV2,
    abi: votingV2Abi,
    functionName: "getVoterFromDelegate",
    args: [account.address],
  });
  const salt = randomVoteSalt();
  const commitHash = computeVoteCommitHash({
    price: opts.price,
    salt,
    voter: voter as Address,
    time,
    ancillaryData,
    roundId: BigInt(roundId),
    identifier,
  });

  const txHash = await walletClient.writeContract({
    address: MAINNET.votingV2,
    abi: votingV2Abi,
    functionName: "commitVote",
    args: [identifier, time, ancillaryData, commitHash],
    chain: mainnet,
    account,
  });

  const roundStr = String(roundId);
  opts.db
    .prepare(
      `INSERT INTO vault_vote_commits (
        telegram_id, dispute_key, identifier, timestamp, ancillary_data, round_id,
        price, salt, commit_tx_hash, revealed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
      ON CONFLICT(telegram_id, identifier, timestamp, ancillary_data, round_id) DO UPDATE SET
        dispute_key = excluded.dispute_key,
        price = excluded.price,
        salt = excluded.salt,
        commit_tx_hash = excluded.commit_tx_hash,
        revealed = 0,
        reveal_tx_hash = NULL,
        updated_at = datetime('now')`
    )
    .run(
      opts.telegramId,
      opts.disputeKey,
      opts.dispute.identifier,
      opts.dispute.timestamp,
      opts.dispute.ancillary_data,
      roundStr,
      opts.price.toString(),
      salt.toString(),
      txHash
    );

  return { txHash };
}

export async function custodialRevealVote(opts: {
  db: Database.Database;
  masterKey: Buffer;
  publicClient: PublicClient;
  ethRpcUrl: string;
  telegramId: string;
  disputeKey: string;
}): Promise<{ txHash: Hex }> {
  const vault = getVault(opts.db, opts.telegramId);
  if (!vault) throw new Error("No vault for user");

  const row = opts.db
    .prepare(
      `SELECT * FROM vault_vote_commits WHERE telegram_id = ? AND dispute_key = ? AND revealed = 0 ORDER BY id DESC LIMIT 1`
    )
    .get(opts.telegramId, opts.disputeKey) as
    | {
        id: number;
        identifier: string;
        timestamp: string;
        ancillary_data: string;
        price: string;
        salt: string;
      }
    | undefined;
  if (!row) throw new Error("No pending commit for this dispute in vault");

  const dvm = await getDvmTiming(opts.publicClient);
  if (!dvm || dvm.phase !== "reveal") {
    throw new Error("DVM is not in reveal phase (or RPC unavailable)");
  }

  const pk = decryptVaultKey(opts.masterKey, vault);
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(toHttpRpcUrl(opts.ethRpcUrl)),
  });

  const identifier = identifierToHex(row.identifier);
  const time = BigInt(row.timestamp);
  const ancillaryData = ancillaryToHex(row.ancillary_data);
  const price = BigInt(row.price);
  const salt = BigInt(row.salt);

  const txHash = await walletClient.writeContract({
    address: MAINNET.votingV2,
    abi: votingV2Abi,
    functionName: "revealVote",
    args: [identifier, time, price, ancillaryData, salt],
    chain: mainnet,
    account,
  });

  opts.db
    .prepare(
      `UPDATE vault_vote_commits SET revealed = 1, reveal_tx_hash = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(txHash, row.id);

  return { txHash };
}

const NATIVE_TRANSFER_GAS = 21_000n;

/** Balance minus a conservative native transfer fee (legacy gas price × 21k × 1.2). */
export async function maxNativeWithdrawWei(publicClient: PublicClient, vaultAddress: Address): Promise<bigint> {
  const bal = await publicClient.getBalance({ address: vaultAddress });
  const gasPrice = await publicClient.getGasPrice();
  const fee = (gasPrice * NATIVE_TRANSFER_GAS * 120n) / 100n;
  return bal > fee ? bal - fee : 0n;
}

export async function custodialWithdrawNative(opts: {
  db: Database.Database;
  masterKey: Buffer;
  telegramId: string;
  chainId: 1 | 137;
  to: Address;
  /** Amount recipient receives; gas is paid from the same balance on top. */
  amountWei: bigint;
  ethRpcUrl: string;
  polygonRpcUrl: string;
  publicClient: PublicClient;
}): Promise<{ txHash: Hex }> {
  if (opts.amountWei <= 0n) throw new Error("Amount must be positive");
  if (!isAddress(opts.to)) throw new Error("Invalid recipient");
  const to = getAddress(opts.to);
  const vault = getVault(opts.db, opts.telegramId);
  if (!vault) throw new Error("No vault for user");
  const pk = decryptVaultKey(opts.masterKey, vault);
  const account = privateKeyToAccount(pk);
  if (getAddress(account.address) === to) throw new Error("Recipient cannot be the vault itself");
  const chain: Chain = opts.chainId === 137 ? polygon : mainnet;
  const rpc = opts.chainId === 137 ? opts.polygonRpcUrl : opts.ethRpcUrl;
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(toHttpRpcUrl(rpc)),
  });
  const bal = await opts.publicClient.getBalance({ address: account.address });
  const gasPrice = await opts.publicClient.getGasPrice();
  const gasReserve = (gasPrice * NATIVE_TRANSFER_GAS * 120n) / 100n;
  if (bal < opts.amountWei + gasReserve) {
    throw new Error("Insufficient balance for amount plus gas");
  }
  const txHash = await walletClient.sendTransaction({
    chain,
    account,
    to,
    value: opts.amountWei,
  });
  return { txHash };
}
