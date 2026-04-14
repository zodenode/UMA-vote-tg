import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { mainnet } from "wagmi/chains";
import { useAccount, useChainId, useConnect, useSignMessage, useSwitchChain } from "wagmi";
import { apiGet, apiPost, getInitData } from "../api";
import { encodeVoteFocusToken } from "../voteUtils";

const botUser = (import.meta.env.VITE_PUBLIC_BOT_USERNAME as string | undefined)?.replace(/^@/, "")?.trim();

type PetitionPublic = {
  id: string;
  hidden?: boolean;
  title: string;
  body: string | null;
  imageUrl?: string | null;
  disputeKey?: string | null;
  conditionId?: string | null;
  disputeFocusToken?: string | null;
  polymarketUrl?: string | null;
  signatureCount: number;
  verifiedSignatureCount?: number;
  createdAt?: string;
  legalNote?: string;
};

export default function PetitionDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = (rawId ?? "").trim().toLowerCase();
  const initData = getInitData();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync, isPending: signing } = useSignMessage();

  const wrongChain = isConnected && chainId !== mainnet.id;

  const q = useQuery({
    queryKey: ["petition", id, initData.length],
    queryFn: () =>
      initData
        ? apiPost<PetitionPublic>("/api/me/petition/fetch", { initData, petitionId: id })
        : apiGet<PetitionPublic>(`/api/petitions/${encodeURIComponent(id)}`),
    enabled: Boolean(id && /^[a-f0-9]+$/.test(id)),
  });

  const walletQ = useQuery({
    queryKey: ["wallet-status", initData.length],
    queryFn: () => apiPost<{ linked: boolean; address: string | null }>("/api/me/wallet/status", { initData }),
    enabled: Boolean(initData.length),
  });

  const linkMut = useMutation({
    mutationFn: async () => {
      const ch = await apiPost<{ message: string; issuedAt: string }>("/api/me/wallet/link-challenge", { initData });
      const signature = await signMessageAsync({ message: ch.message });
      return apiPost<{ ok: boolean; address: string }>("/api/me/wallet/link", {
        initData,
        message: ch.message,
        signature,
        issuedAt: ch.issuedAt,
      });
    },
    onSuccess: () => {
      setMsg("Wallet linked.");
      void qc.invalidateQueries({ queryKey: ["wallet-status", initData.length] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const signMut = useMutation({
    mutationFn: async () => {
      const ch = await apiPost<{ message: string; issuedAt: string; linkedAddress: string }>(
        "/api/me/petition/sign-challenge",
        { initData, petitionId: id }
      );
      if (address && ch.linkedAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connect the same wallet you linked, or switch accounts in your wallet app.");
      }
      const signature = await signMessageAsync({ message: ch.message });
      return apiPost<{ ok: boolean; signatureCount: number; verifiedSignatureCount: number }>(
        "/api/me/petition/sign",
        {
          initData,
          petitionId: id,
          message: ch.message,
          signature,
          issuedAt: ch.issuedAt,
          comment: comment.trim() || undefined,
        }
      );
    },
    onSuccess: (d) => {
      setMsg(`Signed. Verified: ${d.verifiedSignatureCount} · Total: ${d.signatureCount}`);
      void qc.invalidateQueries({ queryKey: ["petition", id, initData.length] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/petitions/${id}` : "";
  const telegramShare =
    botUser && id ? `https://t.me/${botUser}?startapp=${encodeURIComponent(`petition_${id}`)}` : "";

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`Copied ${label}.`);
    } catch {
      setMsg(`Could not copy — select and copy manually.`);
    }
  };

  if (!id || !/^[a-f0-9]+$/.test(id)) {
    return (
      <>
        <h1>Petition</h1>
        <div className="card">
          <p className="muted">Invalid link.</p>
          <Link to="/" className="btn btn-secondary btn-press">
            Home
          </Link>
        </div>
      </>
    );
  }

  if (q.isPending) {
    return (
      <>
        <h1>Petition</h1>
        <div className="card" aria-busy>
          <p className="muted">Loading…</p>
        </div>
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        <h1>Petition</h1>
        <div className="card">
          <p className="muted">Could not load this petition.</p>
          <Link to="/petitions" className="btn btn-secondary btn-press">
            All petitions
          </Link>
        </div>
      </>
    );
  }

  const p = q.data!;
  const linked = walletQ.data?.linked;
  const linkedAddress = walletQ.data?.address ?? null;
  const disputeToken =
    p.disputeFocusToken ?? (p.disputeKey ? encodeVoteFocusToken(p.disputeKey) : null);

  return (
    <>
      <Link to="/petitions" className="votes-back-link">
        ← Petitions
      </Link>
      <h1 className="votes-detail-title">Community petition</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {p.createdAt ? `Created ${p.createdAt}` : null}
      </p>

      {p.imageUrl ? (
        <div className="petition-hero-img-wrap" style={{ marginTop: 12 }}>
          <img src={p.imageUrl} alt="" className="petition-hero-img" />
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>{p.title}</h2>
        {p.body ? (
          <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{p.body}</p>
        ) : (
          <p className="muted">This petition is not publicly available.</p>
        )}
        <p style={{ marginTop: 12 }}>
          <b>Signatures:</b> {p.signatureCount}
          {typeof p.verifiedSignatureCount === "number" ? (
            <>
              {" "}
              · <b>Wallet-verified:</b> {p.verifiedSignatureCount}
            </>
          ) : null}
        </p>
        {p.legalNote ? (
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            {p.legalNote}
          </p>
        ) : null}
      </div>

      {(p.disputeKey || p.polymarketUrl) && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Linked dispute / market</h3>
          {disputeToken ? (
            <p style={{ marginTop: 8 }}>
              <Link className="btn btn-secondary btn-press" to={`/votes/dispute/${encodeURIComponent(disputeToken)}`}>
                Open indexed dispute
              </Link>
            </p>
          ) : null}
          {p.polymarketUrl ? (
            <p style={{ marginTop: 8 }}>
              <a
                href={p.polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-press"
                onClick={(e) => {
                  if (window.Telegram?.WebApp?.openLink) {
                    e.preventDefault();
                    window.Telegram.WebApp.openLink(p.polymarketUrl!, { try_instant_view: false });
                  }
                }}
              >
                Polymarket
              </a>
            </p>
          ) : null}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Share</h3>
        <p className="muted" style={{ marginTop: 4 }}>
          Share this page URL or open the bot with a deep link so friends land in Telegram.
        </p>
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {pageUrl ? (
            <button type="button" className="btn btn-secondary btn-press" onClick={() => void copyText("page URL", pageUrl)}>
              Copy page link
            </button>
          ) : null}
          {telegramShare ? (
            <button
              type="button"
              className="btn btn-secondary btn-press"
              onClick={() => void copyText("Telegram Mini App link", telegramShare)}
            >
              Copy t.me Mini App link
            </button>
          ) : null}
        </div>
      </div>

      {initData && p.body != null && !p.hidden ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Wallet link & sign</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            Verified signatures must use the same Ethereum wallet you link here (personal signature, no gas).
          </p>

          {!isConnected ? (
            <div style={{ marginTop: 10 }}>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  className="btn btn-primary btn-press"
                  style={{ marginRight: 8, marginTop: 6 }}
                  disabled={connecting}
                  onClick={() => connect({ connector: c, chainId: mainnet.id })}
                >
                  {connecting ? "Connecting…" : `Connect ${c.name}`}
                </button>
              ))}
            </div>
          ) : wrongChain ? (
            <div style={{ marginTop: 10 }}>
              <p className="muted">Switch to Ethereum mainnet for a consistent signing experience.</p>
              <button
                type="button"
                className="btn btn-primary btn-press"
                disabled={switching}
                onClick={() => switchChain({ chainId: mainnet.id })}
              >
                {switching ? "Switching…" : "Switch to Ethereum"}
              </button>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 10 }}>
              Connected <code>{address?.slice(0, 6)}…{address?.slice(-4)}</code>
            </p>
          )}

          {walletQ.isPending ? (
            <p className="muted" style={{ marginTop: 10 }}>
              Checking linked wallet…
            </p>
          ) : linked && linkedAddress ? (
            <p style={{ marginTop: 10 }}>
              Linked wallet: <code>{linkedAddress.slice(0, 6)}…{linkedAddress.slice(-4)}</code>
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-press"
              style={{ marginTop: 10 }}
              disabled={!isConnected || wrongChain || linkMut.isPending || signing}
              onClick={() => {
                setMsg(null);
                linkMut.mutate();
              }}
            >
              {linkMut.isPending || signing ? "Confirm in wallet…" : "Link connected wallet to Telegram"}
            </button>
          )}

          <label className="muted" htmlFor="petition-comment" style={{ display: "block", marginTop: 14, marginBottom: 6 }}>
            Optional short comment
          </label>
          <textarea
            id="petition-comment"
            className="field"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional (may appear on operator export)"
            maxLength={200}
            style={{ width: "100%", resize: "vertical" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-press"
            style={{ marginTop: 10 }}
            disabled={
              signMut.isPending ||
              signing ||
              !linked ||
              !isConnected ||
              wrongChain ||
              (Boolean(linkedAddress && address) && linkedAddress!.toLowerCase() !== address!.toLowerCase())
            }
            onClick={() => {
              setMsg(null);
              signMut.mutate();
            }}
          >
            {signMut.isPending || signing ? "Signing…" : "Sign petition (wallet)"}
          </button>
          {msg ? <p className="muted" style={{ marginTop: 10 }}>{msg}</p> : null}
        </div>
      ) : !initData ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted">Open this page from the Telegram Mini App to link a wallet and sign.</p>
        </div>
      ) : null}
    </>
  );
}
