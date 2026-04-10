import type Database from "better-sqlite3";
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbiItem,
  type Hex,
  type PublicClient,
} from "viem";
import { mainnet } from "viem/chains";
import { MAINNET, ooV2Abi } from "./contracts.js";
import { classifyDispute, voterDappDeepLink } from "./disputeClassifier.js";

const disputePriceAbi = parseAbiItem(
  "event DisputePrice(address indexed requester, address indexed proposer, address indexed disputer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice)"
);

export function createEthClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
}

export async function pollDisputePriceLogs(
  db: Database.Database,
  client: PublicClient,
  log: { info: (o: object) => void; error: (o: object) => void }
): Promise<number> {
  const cursorRow = db.prepare(`SELECT last_block FROM oo_poll_cursor WHERE id=1`).get() as {
    last_block: number;
  };
  let fromBlock = BigInt(cursorRow.last_block);
  const latest = await client.getBlockNumber();

  if (fromBlock === 0n) {
    const lookback = BigInt(process.env.OO_LOOKBACK_BLOCKS ?? "4000");
    fromBlock = latest > lookback ? latest - lookback : 0n;
  } else {
    fromBlock = fromBlock + 1n;
  }

  if (fromBlock > latest) {
    db.prepare(`UPDATE oo_poll_cursor SET last_block = ? WHERE id=1`).run(Number(latest));
    return 0;
  }

  const logs = await client.getLogs({
    address: MAINNET.optimisticOracleV2,
    event: disputePriceAbi,
    fromBlock,
    toBlock: latest,
  });

  let inserted = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO disputed_queries (
      dispute_key, requester, proposer, disputer, identifier, timestamp, ancillary_data,
      proposed_price, tx_hash, block_number, log_index, bond_wei, total_stake_wei, source_label, topic_tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const polySet = new Set(
    (process.env.POLYMARKET_REQUESTER_ADDRESSES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  for (const lg of logs) {
    const decoded = decodeEventLog({
      abi: [disputePriceAbi],
      data: lg.data,
      topics: lg.topics,
    });
    if (decoded.eventName !== "DisputePrice") continue;
    const args = decoded.args as {
      requester: `0x${string}`;
      proposer: `0x${string}`;
      disputer: `0x${string}`;
      identifier: Hex;
      timestamp: bigint;
      ancillaryData: Hex;
      proposedPrice: bigint;
    };
    const eventKey = `${lg.transactionHash!.toLowerCase()}:${lg.logIndex}`;
    let bondWei: string | null = null;
    let totalStakeWei: string | null = null;
    try {
      const req = await client.readContract({
        address: MAINNET.optimisticOracleV2,
        abi: ooV2Abi,
        functionName: "getRequest",
        args: [args.requester, args.identifier, args.timestamp, args.ancillaryData],
      });
      const r = req as {
        requestSettings: { bond: bigint };
        finalFee: bigint;
      };
      bondWei = r.requestSettings.bond.toString();
      totalStakeWei = (r.requestSettings.bond + r.finalFee).toString();
    } catch {
      // enrichment optional
    }
    const { sourceLabel, topicTags } = classifyDispute({
      ancillaryData: args.ancillaryData,
      requester: args.requester,
      polymarketRequesters: polySet,
    });
    const result = insert.run(
      eventKey,
      args.requester.toLowerCase(),
      args.proposer.toLowerCase(),
      args.disputer.toLowerCase(),
      args.identifier.toLowerCase(),
      args.timestamp.toString(),
      args.ancillaryData,
      args.proposedPrice.toString(),
      lg.transactionHash!,
      Number(lg.blockNumber),
      lg.logIndex,
      bondWei,
      totalStakeWei,
      sourceLabel,
      JSON.stringify(topicTags)
    );
    if (result.changes > 0) inserted++;
  }

  db.prepare(`UPDATE oo_poll_cursor SET last_block = ? WHERE id=1`).run(Number(latest));
  if (inserted > 0) log.info({ msg: "DisputePrice logs indexed", inserted, latest: latest.toString() });
  return inserted;
}

export function rowToDisputeApi(
  row: {
    dispute_key: string;
    requester: string;
    proposer: string;
    disputer: string;
    identifier: string;
    timestamp: string;
    ancillary_data: string;
    proposed_price: string;
    tx_hash: string;
    block_number: number;
    bond_wei: string | null;
    total_stake_wei: string | null;
    source_label: string | null;
    topic_tags: string | null;
  },
  dvmRoundId: string | null
) {
  const ancillaryData = row.ancillary_data as Hex;
  const identifier = row.identifier as Hex;
  const ts = BigInt(row.timestamp);
  return {
    id: row.dispute_key,
    requester: row.requester,
    proposer: row.proposer,
    disputer: row.disputer,
    identifier: row.identifier,
    timestamp: row.timestamp,
    ancillaryData: row.ancillary_data,
    proposedPrice: row.proposed_price,
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    bondWei: row.bond_wei,
    totalStakeWei: row.total_stake_wei,
    source: row.source_label ?? "Other",
    topics: (() => {
      try {
        return JSON.parse(row.topic_tags ?? "[]") as string[];
      } catch {
        return ["general"];
      }
    })(),
    dvmRoundId,
    voterDappUrl: voterDappDeepLink({ identifier, timestamp: ts, ancillaryData }),
    etherscanUrl: `https://etherscan.io/tx/${row.tx_hash}`,
  };
}
