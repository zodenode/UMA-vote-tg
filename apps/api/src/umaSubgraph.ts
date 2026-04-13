import { request } from "undici";

/** Default UMA mainnet VotingV2 subgraph (Subgraph ID). Override with VOTING_SUBGRAPH_ID if Studio shows a new id. */
const DEFAULT_SUBGRAPH_ID = "41LCrgtCNBQyDiVVyZEuPxbvkBH9BxxLU3nEZst77V8o";
/**
 * Decentralized network queries use the Arbitrum gateway (see The Graph docs). The legacy
 * `gateway.thegraph.com` host often returns "subgraph not found" for the same id + key.
 */
const DEFAULT_GATEWAY_BASE = "https://gateway-arbitrum.network.thegraph.com/api";

const ACTIVE_REQUESTS_QUERY = `
  query ActiveRequests($first: Int!) {
    priceRequests(
      where: { isResolved: false }
      first: $first
      orderBy: time
      orderDirection: desc
    ) {
      id
      time
      isResolved
      ancillaryData
      identifier {
        id
        isSupported
      }
      latestRound {
        roundId
        tokenVoteParticipationPercentage
        votersAmount
      }
    }
  }
`;

export type PriceRequestSummary = {
  id: string;
  time: string;
  identifierId: string;
  ancillaryData: string | null;
  roundId: string | null;
  participationPct: string | null;
};

export async function fetchActivePriceRequests(
  apiKey: string | undefined,
  first = 15
): Promise<{ ok: true; requests: PriceRequestSummary[] } | { ok: false; error: string }> {
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Missing THEGRAPH_API_KEY. Add a key from https://thegraph.com/docs/en/subgraphs/querying/managing-api-keys/",
    };
  }
  const gatewayBase = (process.env.THEGRAPH_GATEWAY_BASE ?? DEFAULT_GATEWAY_BASE).replace(/\/$/, "");
  const subgraphId = process.env.VOTING_SUBGRAPH_ID ?? DEFAULT_SUBGRAPH_ID;
  const url = `${gatewayBase}/${apiKey}/subgraphs/id/${subgraphId}`;
  try {
    const res = await request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: ACTIVE_REQUESTS_QUERY, variables: { first } }),
    });
    const body = (await res.body.json()) as {
      data?: {
        priceRequests: Array<{
          id: string;
          time: string;
          isResolved: boolean;
          ancillaryData: string | null;
          identifier: { id: string };
          latestRound: { roundId: string; tokenVoteParticipationPercentage?: string } | null;
        }>;
      };
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      return { ok: false, error: body.errors.map((e) => e.message).join("; ") };
    }
    const raw = body.data?.priceRequests ?? [];
    const requests: PriceRequestSummary[] = raw.map((r) => ({
      id: r.id,
      time: r.time,
      identifierId: r.identifier.id,
      ancillaryData: r.ancillaryData,
      roundId: r.latestRound?.roundId ?? null,
      participationPct: r.latestRound?.tokenVoteParticipationPercentage ?? null,
    }));
    return { ok: true, requests };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Subgraph request failed" };
  }
}
