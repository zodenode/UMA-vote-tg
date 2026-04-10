import { request } from "undici";

const SUBGRAPH_ID = "41LCrgtCNBQyDiVVyZEuPxbvkBH9BxxLU3nEZst77V8o";

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
  const url = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${SUBGRAPH_ID}`;
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
