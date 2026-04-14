import { useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { mainnet } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  useConnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  VOTING_V2_ADDRESS,
  votingV2VoteAbi,
  computeVoteCommitHash,
  randomVoteSalt,
  loadPendingCommit,
  savePendingCommit,
  clearPendingCommit,
  requestStatusLabel,
  type PendingVoteCommit,
} from "../umaVoting";
import { apiPost, getInitData } from "../api";

type DvmTiming = {
  phase: "commit" | "reveal";
  roundId: string;
  phaseLengthSec: number;
  secondsLeftInPhase: number;
  phaseEndsAt: number;
  roundEndsAt: number;
  hoursLeftInPhase: number;
};

function parsePriceInput(raw: string): bigint | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

function ancillaryToHex(anc: string | null | undefined): Hex {
  if (!anc || anc === "0x") return "0x";
  return anc as Hex;
}

export default function DvmInlineVote(props: {
  identifier: Hex;
  time: string;
  ancillaryData: string | null | undefined;
  proposedPrice: string | null | undefined;
  dvm: DvmTiming | null;
  /** When false, parent page should render a shared wallet connect bar. */
  embedWallet?: boolean;
  /** Dispute key in API index — required for custodial commit/reveal. */
  vaultDisputeKey?: string | null;
  /** API has VAULT_MASTER_KEY + ETH_RPC_URL. */
  vaultSigningEnabled?: boolean;
}) {
  const {
    identifier,
    time,
    ancillaryData: ancRaw,
    proposedPrice,
    dvm,
    embedWallet = false,
    vaultDisputeKey = null,
    vaultSigningEnabled = false,
  } = props;
  const ancillaryData = ancillaryToHex(ancRaw);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  const [priceStr, setPriceStr] = useState(proposedPrice?.trim() ?? "");
  const [voteErr, setVoteErr] = useState<string | null>(null);
  const [pendingSaltPreview, setPendingSaltPreview] = useState<string | null>(null);
  const [useVault, setUseVault] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);

  const { data: requestStatus } = useReadContract({
    address: VOTING_V2_ADDRESS,
    abi: votingV2VoteAbi,
    chainId: mainnet.id,
    functionName: "getPriceRequestStatuses",
    args: [[{ identifier, time: BigInt(time), ancillaryData }]],
    query: { enabled: Boolean(publicClient) },
  });

  const statusRow = requestStatus?.[0];
  const statusLabel = statusRow != null ? requestStatusLabel(Number(statusRow.status)) : null;

  const [lsTick, setLsTick] = useState(0);
  const pending = useMemo(
    () => loadPendingCommit(identifier, time, ancillaryData),
    [identifier, time, ancillaryData, lsTick]
  );

  const { writeContractAsync, data: txHash, isPending: writing, error: writeErr } = useWriteContract();
  const { isLoading: confirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: mainnet.id,
  });

  const wrongChain = isConnected && chainId !== mainnet.id;

  const zero = "0x0000000000000000000000000000000000000000" as Address;

  const { data: effectiveVoter } = useReadContract({
    address: VOTING_V2_ADDRESS,
    abi: votingV2VoteAbi,
    chainId: mainnet.id,
    functionName: "getVoterFromDelegate",
    args: [address ?? zero],
    query: { enabled: Boolean(address && publicClient) },
  });

  const stakeAddr = (effectiveVoter ?? address ?? zero) as Address;

  const { data: stakeData } = useReadContract({
    address: VOTING_V2_ADDRESS,
    abi: votingV2VoteAbi,
    chainId: mainnet.id,
    functionName: "voterStakes",
    args: [stakeAddr],
    query: { enabled: Boolean(address && publicClient) },
  });

  const stakeWei = stakeData?.[0];

  const commitWithPrice = async (price: bigint) => {
    if (!address || !publicClient) {
      setVoteErr("Connect wallet first.");
      return;
    }
    if (dvm?.phase !== "commit") {
      setVoteErr("Commit is only allowed during the DVM commit phase.");
      return;
    }
    try {
      const roundId = await publicClient.readContract({
        address: VOTING_V2_ADDRESS,
        abi: votingV2VoteAbi,
        functionName: "getCurrentRoundId",
      });
      const voter = await publicClient.readContract({
        address: VOTING_V2_ADDRESS,
        abi: votingV2VoteAbi,
        functionName: "getVoterFromDelegate",
        args: [address],
      });
      const salt = randomVoteSalt();
      const hash = computeVoteCommitHash({
        price,
        salt,
        voter: voter as Address,
        time: BigInt(time),
        ancillaryData,
        roundId: BigInt(roundId),
        identifier,
      });
      const h = await writeContractAsync({
        chainId: mainnet.id,
        address: VOTING_V2_ADDRESS,
        abi: votingV2VoteAbi,
        functionName: "commitVote",
        args: [identifier, BigInt(time), ancillaryData, hash],
      });
      const next: PendingVoteCommit = {
        price: price.toString(),
        salt: salt.toString(),
        roundId: roundId.toString(),
        commitTxHash: h,
        updatedAt: Date.now(),
      };
      savePendingCommit(identifier, time, ancillaryData, next);
      setLsTick((n) => n + 1);
    } catch (e) {
      setVoteErr(e instanceof Error ? e.message : "Commit failed");
    }
  };

  const onCommit = async () => {
    setVoteErr(null);
    if (!address || !publicClient) {
      setVoteErr("Connect wallet first.");
      return;
    }
    const price = parsePriceInput(priceStr);
    if (price === null) {
      setVoteErr("Enter a valid integer price (int256), e.g. proposed value from the OO request.");
      return;
    }
    await commitWithPrice(price);
  };

  /** One wallet signature: commit using the OO disputed price already on the request (when present). */
  const onCommitWithProposed = async () => {
    setVoteErr(null);
    if (!address || !publicClient) {
      setVoteErr("Connect wallet first.");
      return;
    }
    const price = proposedPrice != null && proposedPrice !== "" ? parsePriceInput(proposedPrice.trim()) : null;
    if (price === null) {
      setVoteErr("No proposed price on this dispute — enter a price manually or use the official dApp.");
      return;
    }
    setPriceStr(proposedPrice!.trim());
    await commitWithPrice(price);
  };

  const onReveal = async () => {
    setVoteErr(null);
    if (!address || !publicClient) {
      setVoteErr("Connect wallet first.");
      return;
    }
    if (dvm?.phase !== "reveal") {
      setVoteErr("Reveal is only allowed during the DVM reveal phase.");
      return;
    }
    const p = loadPendingCommit(identifier, time, ancillaryData);
    if (!p) {
      setVoteErr("No pending commit found in this browser. Reveal only works with the same wallet and browser that performed the commit.");
      return;
    }
    const price = BigInt(p.price);
    const salt = BigInt(p.salt);
    try {
      await writeContractAsync({
        chainId: mainnet.id,
        address: VOTING_V2_ADDRESS,
        abi: votingV2VoteAbi,
        functionName: "revealVote",
        args: [identifier, BigInt(time), price, ancillaryData, salt],
      });
      clearPendingCommit(identifier, time, ancillaryData);
      setLsTick((n) => n + 1);
    } catch (e) {
      setVoteErr(e instanceof Error ? e.message : "Reveal failed");
    }
  };

  const clearStored = () => {
    clearPendingCommit(identifier, time, ancillaryData);
    setVoteErr(null);
    setLsTick((n) => n + 1);
  };

  const useProposed = () => {
    if (proposedPrice != null && proposedPrice !== "") setPriceStr(proposedPrice.trim());
  };

  const genSaltPreview = () => {
    const s = randomVoteSalt();
    setPendingSaltPreview(s.toString());
  };

  const showVault = Boolean(vaultDisputeKey && getInitData());
  const vaultCanSign = Boolean(vaultSigningEnabled && showVault);

  const vaultCommitWithPrice = async (price: bigint) => {
    if (!vaultDisputeKey) return;
    setVaultBusy(true);
    try {
      const out = await apiPost<{ txHash: string }>("/api/vault/vote/commit", {
        initData: getInitData(),
        disputeKey: vaultDisputeKey,
        price: price.toString(),
      });
      setVaultMsg(`Vault commit sent: ${out.txHash}`);
    } catch (e) {
      setVaultMsg(e instanceof Error ? e.message : "Vault commit failed");
    } finally {
      setVaultBusy(false);
    }
  };

  const onVaultCommit = async () => {
    setVaultMsg(null);
    setVoteErr(null);
    if (!vaultDisputeKey) return;
    if (dvm?.phase !== "commit") {
      setVaultMsg("Commit is only allowed during the DVM commit phase.");
      return;
    }
    const price = parsePriceInput(priceStr);
    if (price === null) {
      setVaultMsg("Enter a valid integer price (int256 wei).");
      return;
    }
    await vaultCommitWithPrice(price);
  };

  const onVaultCommitWithProposed = async () => {
    setVaultMsg(null);
    setVoteErr(null);
    if (!vaultDisputeKey) return;
    if (dvm?.phase !== "commit") {
      setVaultMsg("Commit is only allowed during the DVM commit phase.");
      return;
    }
    const price = proposedPrice != null && proposedPrice !== "" ? parsePriceInput(proposedPrice.trim()) : null;
    if (price === null) {
      setVaultMsg("No proposed price on this dispute.");
      return;
    }
    setPriceStr(proposedPrice!.trim());
    await vaultCommitWithPrice(price);
  };

  const onVaultReveal = async () => {
    setVaultMsg(null);
    setVoteErr(null);
    if (!vaultDisputeKey) return;
    if (dvm?.phase !== "reveal") {
      setVaultMsg("Reveal is only allowed during the DVM reveal phase.");
      return;
    }
    setVaultBusy(true);
    try {
      const out = await apiPost<{ txHash: string }>("/api/vault/vote/reveal", {
        initData: getInitData(),
        disputeKey: vaultDisputeKey,
      });
      setVaultMsg(`Vault reveal sent: ${out.txHash}`);
    } catch (e) {
      setVaultMsg(e instanceof Error ? e.message : "Vault reveal failed");
    } finally {
      setVaultBusy(false);
    }
  };

  return (
    <div className="dvm-vote" style={{ marginTop: 12 }}>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        <b>DVM vote (Ethereum)</b> — even when the dispute started on <b>Polygon OO</b>, commits go to{" "}
        <code>VotingV2</code> on Ethereum. You pay gas. If you clear site data, you lose the salt for reveal unless you
        use the official dApp.
      </p>
      {statusLabel ? (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
          Request status: <b>{statusLabel}</b>
          {statusRow != null ? ` · last round ${String(statusRow.lastVotingRound)}` : null}
        </p>
      ) : null}

      <label className="muted" htmlFor={`price-${identifier}-${time}`} style={{ display: "block", marginTop: 10 }}>
        Price (int256 wei)
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
        <input
          id={`price-${identifier}-${time}`}
          className="field"
          style={{ flex: "1 1 160px", minWidth: 120 }}
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          placeholder="e.g. 1000000000000000000"
          disabled={dvm?.phase !== "commit"}
        />
        {proposedPrice != null && proposedPrice !== "" ? (
          <>
            <button type="button" className="btn btn-secondary btn-press" onClick={useProposed}>
              Use proposed
            </button>
            <button
              type="button"
              className="btn btn-primary btn-press"
              title="Fills the disputed price and opens one commit transaction (you still sign in wallet)."
              disabled={writing || confirming || dvm?.phase !== "commit" || !address || wrongChain}
              onClick={() => void onCommitWithProposed()}
            >
              Commit with proposed price
            </button>
          </>
        ) : null}
      </div>

      {!useVault ? (
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Salt is generated on commit (hidden until reveal).{" "}
          <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={genSaltPreview}>
            Preview random salt
          </button>
          {pendingSaltPreview ? (
            <span style={{ marginLeft: 6, wordBreak: "break-all" }}>sample: {pendingSaltPreview}</span>
          ) : null}
        </p>
      ) : (
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Vault commits store salt on the server so you can reveal from the bot or this app.
        </p>
      )}

      {showVault ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(80, 120, 200, 0.08)",
            border: "1px solid rgba(80, 120, 200, 0.25)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={useVault} onChange={(e) => setUseVault(e.target.checked)} />
            <span>
              <b>Vote with custodial vault</b> (Telegram session, API signs)
            </span>
          </label>
          {!vaultCanSign ? (
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>
              Create a vault on this page first; the API also needs vault + RPC configured for signing.
            </p>
          ) : null}
          {useVault ? (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {proposedPrice != null && proposedPrice !== "" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-press"
                  disabled={vaultBusy || dvm?.phase !== "commit" || !vaultCanSign}
                  onClick={() => void onVaultCommitWithProposed()}
                >
                  {vaultBusy ? "Sending…" : "Commit with proposed (vault)"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary btn-press"
                disabled={vaultBusy || dvm?.phase !== "commit" || !vaultCanSign}
                onClick={() => void onVaultCommit()}
              >
                {vaultBusy ? "Sending…" : "Commit (vault)"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={vaultBusy || dvm?.phase !== "reveal" || !vaultCanSign}
                onClick={() => void onVaultReveal()}
              >
                {vaultBusy ? "Sending…" : "Reveal (vault)"}
              </button>
            </div>
          ) : null}
          {vaultMsg ? (
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 11, wordBreak: "break-all" }}>
              {vaultMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      {!useVault && !isConnected ? (
        <div style={{ marginTop: 10 }}>
          {embedWallet ? (
            <>
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                Connect an Ethereum mainnet wallet (DVM chain) to commit or reveal.
              </p>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginRight: 8, marginTop: 6 }}
                  disabled={connecting}
                  onClick={() => connect({ connector: c, chainId: mainnet.id })}
                >
                  {connecting ? "Connecting…" : c.name}
                </button>
              ))}
            </>
          ) : (
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Connect an Ethereum mainnet wallet using the <b>Wallet</b> section above (DVM lives on Ethereum).
            </p>
          )}
        </div>
      ) : !useVault && wrongChain ? (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>Switch to Ethereum mainnet to vote.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={switching}
            onClick={() => switchChain({ chainId: mainnet.id })}
          >
            {switching ? "Switching…" : "Switch to Ethereum"}
          </button>
        </div>
      ) : !useVault ? (
        <>
          {stakeWei !== undefined && stakeWei === 0n ? (
            <p className="muted" style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>
              No UMA staked on this voter address — commits may succeed but carry no voting weight until you stake on
              VotingV2.
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={writing || confirming || dvm?.phase !== "commit"}
              onClick={() => void onCommit()}
            >
              {writing || confirming ? "Confirm in wallet…" : "Commit vote"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={writing || confirming || dvm?.phase !== "reveal" || !pending}
              onClick={() => void onReveal()}
            >
              {writing || confirming ? "Confirm in wallet…" : "Reveal vote"}
            </button>
            {pending ? (
              <button type="button" className="btn btn-secondary" onClick={clearStored}>
                Clear stored commit
              </button>
            ) : null}
          </div>
          {pending ? (
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Pending commit in this browser (round {pending.roundId}): price <code>{pending.price}</code>
              {pending.commitTxHash ? (
                <>
                  {" "}
                  · tx <code style={{ wordBreak: "break-all" }}>{pending.commitTxHash}</code>
                </>
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}

      {voteErr ? (
        <p className="muted" style={{ color: "var(--danger)", marginTop: 8, fontSize: 12 }}>
          {voteErr}
        </p>
      ) : null}
      {!useVault && writeErr && !voteErr ? (
        <p className="muted" style={{ color: "var(--danger)", marginTop: 8, fontSize: 12 }}>
          {writeErr.message}
        </p>
      ) : null}
      {!useVault && txHash ? (
        <p className="muted" style={{ fontSize: 11, marginTop: 6, wordBreak: "break-all" }}>
          Tx: <code>{txHash}</code>
          {confirming ? " — confirming…" : txSuccess ? " — confirmed" : ""}
        </p>
      ) : null}
    </div>
  );
}
