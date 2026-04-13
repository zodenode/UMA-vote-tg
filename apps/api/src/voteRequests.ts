import type { PublicClient } from "viem";
import { fetchActivePriceRequests, type PriceRequestSummary } from "./umaSubgraph.js";
import { fetchActivePriceRequestsFromRpc } from "./umaVotingFromRpc.js";

export async function loadActivePriceRequests(
  graphKey: string | undefined,
  ethClient: PublicClient | null,
  limit: number
): Promise<{
  requests: PriceRequestSummary[];
  subgraphError?: string;
  requestsSource?: "subgraph" | "rpc";
}> {
  const sub = await fetchActivePriceRequests(graphKey, limit);
  if (sub.ok) {
    return { requests: sub.requests, requestsSource: "subgraph" };
  }

  const graphErr = sub.error;
  if (ethClient) {
    const rpc = await fetchActivePriceRequestsFromRpc(ethClient, limit);
    if (rpc.ok) {
      return {
        requests: rpc.requests,
        requestsSource: "rpc",
        subgraphError: graphErr,
      };
    }
    return {
      requests: [],
      subgraphError: `${graphErr} (on-chain fallback failed: ${rpc.error})`,
    };
  }

  return { requests: [], subgraphError: graphErr };
}
