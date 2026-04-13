import { keccak256, encodePacked, type Address, type Hex } from "viem";

/** UMA mainnet VotingV2 — matches apps/api/src/contracts.ts */
export const VOTING_V2_ADDRESS = "0x004395edb43EFca9885CEdad51EC9fAf93Bd34ac" as const;

/**
 * Matches VotingV2.revealVote check:
 * keccak256(abi.encodePacked(price, salt, voter, time, ancillaryData, uint256(currentRoundId), identifier))
 */
export function computeVoteCommitHash(params: {
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

/** Cryptographic int256 salt; do not reuse across votes. */
export function randomVoteSalt(): bigint {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let x = 0n;
  for (const b of buf) x = (x << 8n) | BigInt(b);
  const MOD = 2n ** 256n;
  const HALF = 2n ** 255n;
  return x >= HALF ? x - MOD : x;
}

export const votingV2VoteAbi = [
  {
    inputs: [],
    name: "getVotePhase",
    outputs: [{ internalType: "enum VotingAncillaryInterface.Phase", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCurrentRoundId",
    outputs: [{ internalType: "uint32", name: "", type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "caller", type: "address" }],
    name: "getVoterFromDelegate",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        name: "requests",
        type: "tuple[]",
        components: [
          { name: "identifier", type: "bytes32" },
          { name: "time", type: "uint256" },
          { name: "ancillaryData", type: "bytes" },
        ],
      },
    ],
    name: "getPriceRequestStatuses",
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "status", type: "uint8" },
          { name: "lastVotingRound", type: "uint32" },
        ],
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "voterStakes",
    outputs: [
      { internalType: "uint128", name: "stake", type: "uint128" },
      { internalType: "uint128", name: "pendingUnstake", type: "uint128" },
      { internalType: "uint128", name: "rewardsPaidPerToken", type: "uint128" },
      { internalType: "uint128", name: "outstandingRewards", type: "uint128" },
      { internalType: "int128", name: "unappliedSlash", type: "int128" },
      { internalType: "uint64", name: "nextIndexToProcess", type: "uint64" },
      { internalType: "uint64", name: "unstakeTime", type: "uint64" },
      { internalType: "address", name: "delegate", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "identifier", type: "bytes32" },
      { internalType: "uint256", name: "time", type: "uint256" },
      { internalType: "bytes", name: "ancillaryData", type: "bytes" },
      { internalType: "bytes32", name: "hash", type: "bytes32" },
    ],
    name: "commitVote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "identifier", type: "bytes32" },
      { internalType: "uint256", name: "time", type: "uint256" },
      { internalType: "int256", name: "price", type: "int256" },
      { internalType: "bytes", name: "ancillaryData", type: "bytes" },
      { internalType: "int256", name: "salt", type: "int256" },
    ],
    name: "revealVote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const LS_PREFIX = "umaVotePending:v1:";

export type PendingVoteCommit = {
  price: string;
  salt: string;
  roundId: string;
  commitTxHash?: string;
  updatedAt: number;
};

export function pendingVoteStorageKey(identifier: Hex, time: string, ancillaryData: Hex): string {
  return `${LS_PREFIX}${identifier}:${time}:${ancillaryData}`;
}

export function loadPendingCommit(
  identifier: Hex,
  time: string,
  ancillaryData: Hex
): PendingVoteCommit | null {
  try {
    const raw = localStorage.getItem(pendingVoteStorageKey(identifier, time, ancillaryData));
    if (!raw) return null;
    const j = JSON.parse(raw) as PendingVoteCommit;
    if (typeof j.price !== "string" || typeof j.salt !== "string" || typeof j.roundId !== "string")
      return null;
    return j;
  } catch {
    return null;
  }
}

export function savePendingCommit(
  identifier: Hex,
  time: string,
  ancillaryData: Hex,
  data: PendingVoteCommit
): void {
  localStorage.setItem(pendingVoteStorageKey(identifier, time, ancillaryData), JSON.stringify(data));
}

export function clearPendingCommit(identifier: Hex, time: string, ancillaryData: Hex): void {
  localStorage.removeItem(pendingVoteStorageKey(identifier, time, ancillaryData));
}

export function requestStatusLabel(status: number): string {
  const labels = ["Not requested", "Active", "Resolved", "Future", "To delete"] as const;
  return labels[status] ?? `Unknown (${status})`;
}
