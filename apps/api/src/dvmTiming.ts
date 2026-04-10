import type { PublicClient } from "viem";
import { MAINNET, votingV2Abi } from "./contracts.js";

export type DvmTiming = {
  phase: "commit" | "reveal";
  roundId: string;
  phaseLengthSec: number;
  chainTimestamp: number;
  secondsLeftInPhase: number;
  phaseEndsAt: number;
  roundEndsAt: number;
  hoursLeftInPhase: number;
};

/**
 * Uses VotingV2 vote timing: Phase alternates Commit/Reveal each phaseLength seconds.
 * @see VoteTiming.sol
 */
export async function getDvmTiming(client: PublicClient): Promise<DvmTiming | null> {
  try {
    const block = await client.getBlock({ blockTag: "latest" });
    const T = Number(block.timestamp);
    const phaseRaw = await client.readContract({
      address: MAINNET.votingV2,
      abi: votingV2Abi,
      functionName: "getVotePhase",
    });
    const roundIdRaw = await client.readContract({
      address: MAINNET.votingV2,
      abi: votingV2Abi,
      functionName: "getCurrentRoundId",
    });
    const phaseLength = await client.readContract({
      address: MAINNET.votingV2,
      abi: votingV2Abi,
      functionName: "voteTiming",
    });
    const roundEnd = await client.readContract({
      address: MAINNET.votingV2,
      abi: votingV2Abi,
      functionName: "getRoundEndTime",
      args: [BigInt(roundIdRaw)],
    });
    const L = Number(phaseLength);
    if (!L || L <= 0) return null;
    const slot = Math.floor(T / L);
    const phaseEnd = (slot + 1) * L;
    const secondsLeftInPhase = Math.max(0, phaseEnd - T);
    const phase: "commit" | "reveal" = Number(phaseRaw) % 2 === 0 ? "commit" : "reveal";
    return {
      phase,
      roundId: String(roundIdRaw),
      phaseLengthSec: L,
      chainTimestamp: T,
      secondsLeftInPhase,
      phaseEndsAt: phaseEnd,
      roundEndsAt: Number(roundEnd),
      hoursLeftInPhase: secondsLeftInPhase / 3600,
    };
  } catch {
    return null;
  }
}
