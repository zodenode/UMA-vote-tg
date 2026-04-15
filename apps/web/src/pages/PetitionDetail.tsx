import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { mainnet } from "wagmi/chains";
import { useAccount, useChainId, useConnect, useSignMessage, useSwitchChain } from "wagmi";
import { apiGet, apiPost, getInitData } from "../api";
import PetitionSignerSocialStrip, { type SignerFace } from "../components/PetitionSignerSocialStrip";
import { encodeVoteFocusToken } from "../voteUtils";
import { useWebPetitionSessionToken } from "../useWebPetitionSessionToken";
import {
  applyPetitionShareMeta,
  buildPetitionShareCopy,
  restoreDefaultShareMeta,
} from "../petitionShareMeta";

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
  signerPreview?: SignerFace[];
  signerPreviewNote?: string | null;
};

type PetitionSignerRow = {
  signedAt: string;
  wallet: string | null;
  walletVerified: boolean;
  illustrativeTotalPaidUsd: number | null;
  illustrativePotentialWonIfOverturnedUsd: number | null;
  emailVerified: boolean;
};

type PetitionSignersPayload = {
  signers: PetitionSignerRow[];
  amountNote: string;
  emailNote: string;
};

function formatUsdTable(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function shortWallet(w: string, head = 6, tail = 4): string {
  if (w.length <= head + tail + 3) return w;
  return `${w.slice(0, head)}…${w.slice(-tail)}`;
}

export default function PetitionDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = (rawId ?? "").trim().toLowerCase();
  const initData = getInitData();
  const trimmedInit = initData.trim();
  const webTok = useWebPetitionSessionToken();
  const hasMeAuth = Boolean(trimmedInit || webTok);
  const sessionKey = `${trimmedInit ? "tg" : "no"}:${trimmedInit.length}:${webTok ? webTok.slice(0, 10) : "nw"}`;
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "signers">("overview");

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync, isPending: signing } = useSignMessage();

  const wrongChain = isConnected && chainId !== mainnet.id;

  const meFetchBody = useMemo(() => {
    const b: { petitionId: string; initData?: string } = { petitionId: id };
    if (trimmedInit) b.initData = trimmedInit;
    return b;
  }, [id, trimmedInit]);

  const meWalletStatusBody = useMemo(() => (trimmedInit ? { initData: trimmedInit } : {}), [trimmedInit]);

  const q = useQuery({
    queryKey: ["petition", id, sessionKey],
    queryFn: () =>
      hasMeAuth
        ? apiPost<PetitionPublic>("/api/me/petition/fetch", meFetchBody)
        : apiGet<PetitionPublic>(`/api/petitions/${encodeURIComponent(id)}`),
    enabled: Boolean(id && /^[a-f0-9]+$/.test(id)),
  });

  const signersPath = useMemo(() => {
    const b = `/api/petitions/${encodeURIComponent(id)}/signers`;
    return trimmedInit ? `${b}?initData=${encodeURIComponent(trimmedInit)}` : b;
  }, [id, trimmedInit]);

  const showSignersTab = Boolean(
    q.isSuccess &&
      q.data &&
      (!q.data.hidden || q.data.body != null)
  );

  const signersQ = useQuery({
    queryKey: ["petition-signers", id, trimmedInit, sessionKey],
    queryFn: () => apiGet<PetitionSignersPayload>(signersPath, { withWebAuth: true }),
    enabled: Boolean(
      id &&
        /^[a-f0-9]+$/.test(id) &&
        detailTab === "signers" &&
        showSignersTab
    ),
  });

  useEffect(() => {
    setDetailTab("overview");
  }, [id]);

  useEffect(() => {
    if (q.data?.hidden && q.data.body == null) {
      setDetailTab("overview");
    }
  }, [q.data?.hidden, q.data?.body]);

  useEffect(() => {
    if (!id || !/^[a-f0-9]+$/.test(id)) return undefined;
    if (!q.isSuccess || !q.data) return undefined;
    const d = q.data;
    if (d.hidden && d.body == null) {
      restoreDefaultShareMeta();
      return undefined;
    }
    const canonical = `${window.location.origin}/petitions/${id}`;
    const copy = buildPetitionShareCopy(d.title, d.body ?? null);
    applyPetitionShareMeta({
      pageTitle: copy.pageTitle,
      ogTitle: copy.ogTitle,
      description: copy.description,
      pageCanonicalUrl: canonical,
      imageUrl: d.imageUrl ?? null,
    });
    return () => {
      restoreDefaultShareMeta();
    };
  }, [id, q.isSuccess, q.data]);

  const walletQ = useQuery({
    queryKey: ["wallet-status", sessionKey],
    queryFn: () => apiPost<{ linked: boolean; address: string | null }>("/api/me/wallet/status", meWalletStatusBody),
    enabled: hasMeAuth,
  });

  const linkMut = useMutation({
    mutationFn: async () => {
      const ch = await apiPost<{ message: string; issuedAt: string }>("/api/me/wallet/link-challenge", {
        initData: trimmedInit,
      });
      const signature = await signMessageAsync({ message: ch.message });
      return apiPost<{ ok: boolean; address: string }>("/api/me/wallet/link", {
        initData: trimmedInit,
        message: ch.message,
        signature,
        issuedAt: ch.issuedAt,
      });
    },
    onSuccess: () => {
      setMsg("Wallet linked.");
      void qc.invalidateQueries({ queryKey: ["wallet-status", sessionKey] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const signBodyBase = useMemo(() => {
    const b: { petitionId: string; initData?: string } = { petitionId: id };
    if (trimmedInit) b.initData = trimmedInit;
    return b;
  }, [id, trimmedInit]);

  const signMut = useMutation({
    mutationFn: async () => {
      const ch = await apiPost<{ message: string; issuedAt: string; linkedAddress: string }>(
        "/api/me/petition/sign-challenge",
        signBodyBase
      );
      if (address && ch.linkedAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connect the same wallet you linked, or switch accounts in your wallet app.");
      }
      const signature = await signMessageAsync({ message: ch.message });
      return apiPost<{ ok: boolean; signatureCount: number; verifiedSignatureCount: number }>("/api/me/petition/sign", {
        ...signBodyBase,
        message: ch.message,
        signature,
        issuedAt: ch.issuedAt,
        comment: comment.trim() || undefined,
      });
    },
    onSuccess: (d) => {
      setMsg(`Signed. Verified: ${d.verifiedSignatureCount} · Total: ${d.signatureCount}`);
      void qc.invalidateQueries({ queryKey: ["petition", id, sessionKey] });
      void qc.invalidateQueries({ queryKey: ["petition-signers", id] });
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
          <Link to="/petitions/browse" className="btn btn-secondary btn-press">
            Browse petitions
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

      {showSignersTab ? (
        <div className="petition-detail-tabs" role="tablist" aria-label="Petition sections">
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "overview"}
            className={`petition-detail-tab ${detailTab === "overview" ? "petition-detail-tab--active" : ""}`}
            onClick={() => setDetailTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={detailTab === "signers"}
            className={`petition-detail-tab ${detailTab === "signers" ? "petition-detail-tab--active" : ""}`}
            onClick={() => setDetailTab("signers")}
          >
            Signers
            {typeof p.verifiedSignatureCount === "number" ? (
              <span className="petition-detail-tab__count">{p.verifiedSignatureCount}</span>
            ) : null}
          </button>
        </div>
      ) : null}

      {detailTab === "overview" ? (
        <>
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
            {typeof p.verifiedSignatureCount === "number" &&
            (p.verifiedSignatureCount > 0 || (p.signerPreview?.length ?? 0) > 0) ? (
              <div style={{ marginTop: 14 }}>
                <PetitionSignerSocialStrip
                  signerPreview={p.signerPreview ?? []}
                  verifiedCount={p.verifiedSignatureCount}
                  maxFaces={5}
                  note={p.signerPreviewNote ?? null}
                />
                <p className="muted petition-detail-social-hint" style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.4 }}>
                  Hover faces for wallet + illustrative total paid (red) and overturn upside (green) — not live PnL.
                </p>
              </div>
            ) : null}
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
        </>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Signers</h2>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            <b>Amount lost</b> uses an illustrative <b>total paid</b> seed (not your real on-chain cost).{" "}
            <b>Potential won if overturned</b> is an illustrative upside seed — not a promise of recovery.{" "}
            <b>Email verified</b> is reserved for a future optional step. Wallet signatures prove control of the linked
            address; they do not prove Polymarket position or fills on this market.
          </p>
          {signersQ.isPending ? <p className="muted" style={{ marginTop: 12 }}>Loading signers…</p> : null}
          {signersQ.isError ? (
            <p className="muted" style={{ marginTop: 12 }}>
              Could not load the signer list.
            </p>
          ) : null}
          {signersQ.data ? (
            <>
              <div className="petition-signers-scroll">
                <table className="petition-signers-table">
                  <thead>
                    <tr>
                      <th scope="col">Wallet</th>
                      <th scope="col">
                        Amount lost{" "}
                        <span className="petition-signers-th-sub">(total paid, illustr.)</span>
                      </th>
                      <th scope="col">
                        Potential won{" "}
                        <span className="petition-signers-th-sub">(if overturned, illustr.)</span>
                      </th>
                      <th scope="col" className="petition-signers-table__tick">
                        Email verified
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {signersQ.data.signers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="petition-signers-table__empty muted">
                          No signatures yet.
                        </td>
                      </tr>
                    ) : (
                      signersQ.data.signers.map((row, idx) => (
                        <tr key={`${row.signedAt}-${idx}`}>
                          <td className="petition-signers-table__wallet">
                            {row.wallet ? (
                              <code title={row.wallet}>{shortWallet(row.wallet, 8, 6)}</code>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {row.illustrativeTotalPaidUsd != null ? (
                              <span
                                className="petition-signers-money petition-signers-money--loss"
                                title={signersQ.data!.amountNote}
                              >
                                {formatUsdTable(row.illustrativeTotalPaidUsd)}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {row.illustrativePotentialWonIfOverturnedUsd != null ? (
                              <span
                                className="petition-signers-money petition-signers-money--win"
                                title={signersQ.data!.amountNote}
                              >
                                {formatUsdTable(row.illustrativePotentialWonIfOverturnedUsd)}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="petition-signers-table__tick">
                            {row.emailVerified ? (
                              <Check className="petition-signers-table__check" strokeWidth={2.5} aria-label="Verified" />
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ marginTop: 12, fontSize: 11, lineHeight: 1.45 }}>
                {signersQ.data.emailNote}
              </p>
            </>
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

      {hasMeAuth && p.body != null && !p.hidden ? (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Wallet link & sign</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            {trimmedInit
              ? "Verified signatures must use the same Ethereum wallet you link here (personal signature, no gas)."
              : "You signed in on the web with this wallet — use it to add a verified signature (personal signature, no gas)."}
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
              {trimmedInit ? "Linked wallet" : "Signing wallet"}:{" "}
              <code>{linkedAddress.slice(0, 6)}…{linkedAddress.slice(-4)}</code>
            </p>
          ) : trimmedInit ? (
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
          ) : (
            <p className="muted" style={{ marginTop: 10 }}>
              Connect the same wallet you used to sign in on the <Link to="/petitions/new">New petition</Link> page.
            </p>
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
      ) : !hasMeAuth ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted">
            To add a wallet-verified signature, open from the Telegram Mini App or{" "}
            <Link to="/petitions/new">sign in with Ethereum</Link> in the browser, then return here.
          </p>
        </div>
      ) : null}
    </>
  );
}
