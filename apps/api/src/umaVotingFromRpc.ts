import type { Hex, PublicClient } from "viem";
import { keccak256, parseAbiItem } from "viem";
import { MAINNET } from "./contracts.js";
import type { PriceRequestSummary } from "./umaSubgraph.js";

/** Matches VotingV2 `RequestAdded` (see UMAprotocol/subgraphs votingV2 mappings). */
const requestAddedEvent = parseAbiItem(
  "event RequestAdded(address indexed requester, uint256 indexed roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData, bool isGovernance)"
);

const votingV2StatusAbi = [
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
] as const;

/** Same id shape as the voting subgraph (`getPriceRequestId` in UMA subgraph helpers). */
export function priceRequestSubgraphId(identifier: Hex, time: bigint, ancillaryData: Hex): string {
  const idLower = identifier.toLowerCase() as Hex;
  const hash = keccak256(ancillaryData);
  return `${idLower}-${time.toString()}-${hash}`;
}

function isUnresolvedStatus(status: number): boolean {
  // Aligns with subgraph `isResolved: false` — exclude Resolved (2) and To delete (4).
  return status !== 2 && status !== 4;
}

/**
 * Lists unresolved DVM price requests by scanning `RequestAdded` logs on VotingV2, then
 * filtering with `getPriceRequestStatuses`. Works without The Graph when `ETH_RPC_URL` is set.
 */
export async function fetchActivePriceRequestsFromRpc(
  client: PublicClient,
  first: number,
  opts?: { lookbackBlocks?: bigint; logChunkSize?: bigint }
): Promise<{ ok: true; requests: PriceRequestSummary[] } | { ok: false; error: string }> {
  const lookback =
    opts?.lookbackBlocks ??
    BigInt(Math.max(5000, Number(process.env.VOTING_REQUEST_LOG_LOOKBACK_BLOCKS ?? "80000") || 80_000));
  const chunk =
    opts?.logChunkSize ??
    BigInt(Math.max(500, Number(process.env.VOTING_REQUEST_LOG_CHUNK_BLOCKS ?? "1999") || 1999));
  /** Stop scanning older blocks once we have enough distinct requests (recent activity is usually enough). */
  const stopAfterUnique = Math.max(40, Number(process.env.VOTING_REQUEST_LOG_STOP_UNIQUE ?? "140") || 140);

  try {
    const latest = await client.getBlockNumber();
    const minBlock = latest > lookback ? latest - lookback + 1n : 0n;

    type Row = { identifier: Hex; time: bigint; ancillaryData: Hex; blockNumber: bigint };
    const best = new Map<string, Row>();

    let end = latest;
    while (end >= minBlock && best.size < stopAfterUnique) {
      const span = chunk - 1n;
      let start = end > span ? end - span : minBlock;
      if (start < minBlock) start = minBlock;

      const logs = await client.getLogs({
        address: MAINNET.votingV2,
        event: requestAddedEvent,
        fromBlock: start,
        toBlock: end,
      });

      for (const log of logs) {
        if (!log.args || typeof log.args.time !== "bigint") continue;
        const identifier = log.args.identifier as Hex;
        const time = log.args.time;
        const ancillaryData = (log.args.ancillaryData ?? "0x") as Hex;
        const id = priceRequestSubgraphId(identifier, time, ancillaryData);
        const blockNumber = log.blockNumber ?? 0n;
        const prev = best.get(id);
        if (!prev || blockNumber >= prev.blockNumber) {
          best.set(id, { identifier, time, ancillaryData, blockNumber });
        }
      }

      if (start === minBlock) break;
      end = start - 1n;
    }

    const rows = [...best.values()].sort((a, b) => {
      if (a.time === b.time) return a.blockNumber > b.blockNumber ? 1 : -1;
      return a.time > b.time ? -1 : 1;
    });

    const scanCap = Math.max(first * 6, 60);
    const candidates = rows.slice(0, scanCap);
    const STATUS_BATCH = 40;
    const unresolved: PriceRequestSummary[] = [];

    for (let i = 0; i < candidates.length && unresolved.length < first; i += STATUS_BATCH) {
      const batch = candidates.slice(i, i + STATUS_BATCH);
      const tuples = batch.map((c) => ({
        identifier: c.identifier,
        time: c.time,
        ancillaryData: c.ancillaryData,
      }));

      const statuses = await client.readContract({
        address: MAINNET.votingV2,
        abi: votingV2StatusAbi,
        functionName: "getPriceRequestStatuses",
        args: [tuples],
      });

      for (let j = 0; j < batch.length; j++) {
        const st = statuses[j];
        if (!st) continue;
        const sn = Number(st.status);
        if (!isUnresolvedStatus(sn)) continue;

        const c = batch[j]!;
        unresolved.push({
          id: priceRequestSubgraphId(c.identifier, c.time, c.ancillaryData),
          time: c.time.toString(),
          identifierId: c.identifier,
          ancillaryData: c.ancillaryData,
          roundId: st.lastVotingRound != null ? String(st.lastVotingRound) : null,
          participationPct: null,
        });
        if (unresolved.length >= first) break;
      }
    }

    return { ok: true, requests: unresolved };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "RPC voting request scan failed" };
  }
}
