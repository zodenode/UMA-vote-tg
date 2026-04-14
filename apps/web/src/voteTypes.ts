export type DvmTiming = {
  phase: "commit" | "reveal";
  roundId: string;
  phaseLengthSec: number;
  secondsLeftInPhase: number;
  phaseEndsAt: number;
  roundEndsAt: number;
  hoursLeftInPhase: number;
};

export type PolymarketOutcome = {
  label: string;
  tokenId: string;
  priceBuy: string | null;
  priceSell: string | null;
  mid: string | null;
};

export type PolymarketBlock = {
  conditionId: string;
  title: string | null;
  slug: string | null;
  url: string | null;
  image?: string | null;
  outcomes: PolymarketOutcome[];
  proposedPriceHint: string | null;
  fetchedAt: number;
  error?: string;
} | null;

export type Dispute = {
  id: string;
  chainId: number;
  requester?: string;
  proposer?: string;
  disputer?: string;
  identifier: string;
  timestamp: string;
  ancillaryData?: string;
  proposedPrice?: string | null;
  source: string;
  topics: string[];
  bondWei: string | null;
  totalStakeWei: string | null;
  dvmRoundId: string | null;
  voterDappUrl: string;
  etherscanUrl: string;
  txHash: string;
  blockNumber?: number;
  polymarket?: PolymarketBlock;
  /** Polymarket CLOB vs OO proposed price heuristic; not a DVM prediction */
  reversalWatch?: boolean;
  reversalWatchReason?: string | null;
};

export type VoteReq = {
  id: string;
  time: string;
  identifierId: string;
  ancillaryData: string | null;
  roundId: string | null;
  participationPct: string | null;
};

export type VotesPayload = {
  requests: VoteReq[];
  disputes: Dispute[];
  dvm: DvmTiming | null;
  rpcConfigured: boolean;
  polygonOoConfigured: boolean;
  subgraphError?: string;
  requestsSource?: "subgraph" | "rpc";
  vaultEnabled?: boolean;
};

export type DisputeDetailPayload = {
  dispute: Dispute;
  dvm: DvmTiming | null;
  vaultEnabled: boolean;
  rpcConfigured: boolean;
  polygonOoConfigured: boolean;
};
