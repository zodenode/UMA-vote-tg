import { useState } from "react";
import { formatUnits, parseEther } from "viem";
import { useAccount, useConnect, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

const UMA = "0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828";
const UMA_DECIMALS = 18;

function formatQuoteError(j: unknown): string {
  if (!j || typeof j !== "object") return "Quote failed";
  const o = j as { error?: string; details?: { message?: string; reason?: string; name?: string } };
  const base = o.error ?? "Quote failed";
  const d = o.details;
  if (d && typeof d === "object") {
    const extra = d.message ?? d.reason ?? d.name;
    if (extra && extra !== base) return `${base}: ${extra}`;
  }
  return base;
}

export default function Swap() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const [ethAmount, setEthAmount] = useState("0.01");
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { sendTransaction, data: txHash, isPending: sending, error: sendErr } = useSendTransaction();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  async function fetchQuote() {
    setQuoteErr(null);
    setQuote(null);
    if (!address) {
      setQuoteErr("Connect a wallet first.");
      return;
    }
    let wei: bigint;
    try {
      wei = parseEther(ethAmount || "0");
    } catch {
      setQuoteErr("Invalid ETH amount.");
      return;
    }
    if (wei <= 0n) {
      setQuoteErr("Amount must be greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const params = new URLSearchParams({
        sellToken: "ETH",
        buyToken: UMA,
        sellAmount: wei.toString(),
        takerAddress: address,
      });
      const r = await fetch(`${base}/api/swap/quote?${params.toString()}`);
      const j = await r.json();
      if (!r.ok) {
        setQuoteErr(formatQuoteError(j));
        return;
      }
      setQuote((j as { quote: Record<string, unknown> }).quote ?? j);
    } catch (e) {
      setQuoteErr(e instanceof Error ? e.message : "Quote failed");
    } finally {
      setLoading(false);
    }
  }

  function execute() {
    if (!quote) return;
    const to = quote.to as `0x${string}` | undefined;
    const data = quote.data as `0x${string}` | undefined;
    const value = quote.value as string | undefined;
    if (!to || !data) {
      setQuoteErr("Invalid quote payload from 0x.");
      return;
    }
    sendTransaction({
      to,
      data,
      value: value ? BigInt(value) : undefined,
    });
  }

  const buyAmount = quote?.buyAmount as string | undefined;
  let umaOutDisplay: string | null = null;
  if (buyAmount) {
    try {
      umaOutDisplay = Number(formatUnits(BigInt(buyAmount), UMA_DECIMALS)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      });
    } catch {
      umaOutDisplay = buyAmount;
    }
  }

  const route = quote?.route as { fills?: { source?: string }[] } | undefined;
  const routeHint =
    route?.fills?.length && route.fills[0]?.source
      ? `via ${route.fills.map((f) => f.source).filter(Boolean).join(" → ")}`
      : null;

  return (
    <div className="swap-page">
      <header className="swap-hero fade-in-up">
        <div className="swap-hero-glow" aria-hidden />
        <h1 className="swap-title">Swap to UMA</h1>
        <p className="muted swap-sub">
          Ethereum mainnet · 0x routing · You keep custody — we never hold funds.
        </p>
      </header>

      {!isConnected ? (
        <div className="card swap-card fade-in-up" style={{ animationDelay: "0.05s" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Connect a wallet to get a quote and swap.
          </p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="btn btn-primary btn-press"
              style={{ marginTop: 12 }}
              disabled={connecting}
              onClick={() => connect({ connector: c })}
            >
              {connecting ? "Connecting…" : c.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="card swap-card swap-connected fade-in-up" style={{ animationDelay: "0.05s" }}>
          <div className="swap-connected-row">
            <span className="swap-pulse-dot" aria-hidden />
            <span className="muted">Connected</span>
            <code className="swap-address">{address?.slice(0, 6)}…{address?.slice(-4)}</code>
          </div>
        </div>
      )}

      <div className="card swap-card fade-in-up" style={{ animationDelay: "0.1s" }}>
        <label className="swap-label" htmlFor="eth">
          You pay
        </label>
        <div className="swap-input-row">
          <input
            id="eth"
            className="field swap-field"
            inputMode="decimal"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            disabled={loading}
          />
          <span className="swap-input-suffix">ETH</span>
        </div>
        <button
          type="button"
          className={`btn btn-secondary btn-press${loading ? " btn-loading" : ""}`}
          style={{ marginTop: 14 }}
          disabled={loading || !isConnected}
          onClick={() => fetchQuote()}
        >
          {loading ? (
            <>
              <span className="btn-spinner" aria-hidden />
              Fetching quote…
            </>
          ) : (
            "Get quote"
          )}
        </button>
      </div>

      {loading ? (
        <div className="card swap-card swap-skel fade-in-up" style={{ animationDelay: "0.12s" }}>
          <div className="skeleton" style={{ width: "40%" }} />
          <div className="skeleton" style={{ width: "75%" }} />
          <div className="skeleton" style={{ width: "55%" }} />
        </div>
      ) : null}

      {quoteErr ? (
        <div
          className="card swap-card swap-error fade-in-up"
          style={{ animationDelay: "0.08s" }}
          role="alert"
        >
          <p className="swap-error-title">Quote unavailable</p>
          <p className="swap-error-msg">{quoteErr}</p>
        </div>
      ) : null}

      {quote && !loading ? (
        <div className="card swap-card swap-quote fade-in-up" style={{ animationDelay: "0.12s" }}>
          <h2 className="swap-quote-heading">You receive</h2>
          {umaOutDisplay ? (
            <p className="swap-uma-amount">
              <span className="swap-uma-value">{umaOutDisplay}</span>
              <span className="swap-uma-ticker">UMA</span>
            </p>
          ) : (
            <p className="muted">Amount in API response — check raw <code>buyAmount</code>.</p>
          )}
          {routeHint ? <p className="muted swap-route">{routeHint}</p> : null}
          <p className="muted swap-disclaimer">
            Slippage ~1% (API default). Gas is extra. Confirm the full transaction in your wallet.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-press"
            style={{ marginTop: 14 }}
            disabled={sending || confirming}
            onClick={execute}
          >
            {sending || confirming ? (
              <>
                <span className="btn-spinner light" aria-hidden />
                Confirm in wallet…
              </>
            ) : (
              "Execute swap"
            )}
          </button>
          {sendErr ? (
            <p className="muted swap-send-err" style={{ color: "var(--danger)", marginTop: 10 }}>
              {sendErr.message}
            </p>
          ) : null}
          {txHash ? (
            <p className="muted" style={{ marginTop: 10, wordBreak: "break-all" }}>
              Tx: <code>{txHash}</code>
              {isSuccess ? " — confirmed" : confirming ? " — confirming…" : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
