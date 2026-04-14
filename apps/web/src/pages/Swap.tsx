import { useCallback, useEffect, useRef, useState } from "react";
import OODisputesTeaser from "../components/OODisputesTeaser";
import { formatUnits, parseEther } from "viem";
import { polygon } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  useConnect,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";

const UMA_DECIMALS = 18;
const QUOTE_DEBOUNCE_MS = 480;
const SWAP_CHAIN = polygon;

/** Wagmi names the browser-extension connector "Injected" — it is MetaMask, Rabby, etc. injecting `window.ethereum`. */
function friendlyConnectorLabel(name: string): string {
  if (name === "Injected") return "Browser wallet (MetaMask, Rabby, …)";
  return name;
}

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
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const [polAmount, setPolAmount] = useState("0.01");
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { sendTransaction, data: txHash, isPending: sending, error: sendErr } = useSendTransaction();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const fetchQuote = useCallback(async () => {
    abortRef.current?.abort();
    if (!address) {
      setQuote(null);
      setQuoteErr(null);
      return;
    }

    let wei: bigint;
    try {
      wei = parseEther(polAmount.trim() || "0");
    } catch {
      setQuote(null);
      setQuoteErr("Invalid POL amount.");
      return;
    }
    if (wei <= 0n) {
      setQuote(null);
      setQuoteErr("Amount must be greater than zero.");
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setQuoting(true);
    setQuoteErr(null);

    try {
      const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const params = new URLSearchParams({
        chainId: String(SWAP_CHAIN.id),
        sellToken: "POL",
        sellAmount: wei.toString(),
        takerAddress: address,
      });
      const r = await fetch(`${base}/api/swap/quote?${params.toString()}`, { signal: ac.signal });
      const j = (await r.json()) as { quote?: Record<string, unknown> };
      if (ac.signal.aborted) return;
      if (!r.ok) {
        setQuote(null);
        setQuoteErr(formatQuoteError(j));
        return;
      }
      setQuote(j.quote ?? (j as Record<string, unknown>));
    } catch (e) {
      if (ac.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
      setQuote(null);
      setQuoteErr(e instanceof Error ? e.message : "Quote failed");
    } finally {
      if (!ac.signal.aborted) setQuoting(false);
    }
  }, [address, polAmount]);

  useEffect(() => {
    if (!isConnected || !address) {
      setQuote(null);
      setQuoteErr(null);
      abortRef.current?.abort();
      return;
    }
    setQuote(null);
    const t = window.setTimeout(() => void fetchQuote(), QUOTE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [polAmount, isConnected, address, fetchQuote]);

  async function onSwap() {
    if (!quote) return;
    const to = quote.to as `0x${string}` | undefined;
    const data = quote.data as `0x${string}` | undefined;
    const value = quote.value as string | undefined;
    if (!to || !data) {
      setQuoteErr("Invalid quote payload from 0x.");
      return;
    }
    try {
      if (chainId !== SWAP_CHAIN.id) {
        await switchChainAsync?.({ chainId: SWAP_CHAIN.id });
      }
    } catch {
      setQuoteErr("Switch to Polygon in your wallet to swap.");
      return;
    }
    sendTransaction({
      chainId: SWAP_CHAIN.id,
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

  const wrongChain = isConnected && chainId !== SWAP_CHAIN.id;

  return (
    <div className="swap-page">
      <header className="swap-hero fade-in-up">
        <div className="swap-hero-glow" aria-hidden />
        <h1 className="swap-title">Swap to UMA</h1>
        <p className="muted swap-sub">
          Polygon · Pay with <b>POL</b> (native gas token) · 0x routing · You keep custody — we never hold funds.
        </p>
        <p className="muted swap-sub" style={{ fontSize: 12, marginTop: 6 }}>
          <b>Injected</b> in the list below means a wallet extension (e.g. MetaMask) that talks to this site through{" "}
          <code>window.ethereum</code> — not a separate product name.
        </p>
      </header>

      {!isConnected ? (
        <div className="card swap-card fade-in-up" style={{ animationDelay: "0.05s" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Connect a wallet on <b>Polygon</b> to quote and swap POL → UMA.
          </p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="btn btn-primary btn-press"
              style={{ marginTop: 12 }}
              disabled={connecting}
              onClick={() => connect({ connector: c, chainId: SWAP_CHAIN.id })}
            >
              {connecting ? "Connecting…" : friendlyConnectorLabel(c.name)}
            </button>
          ))}
        </div>
      ) : (
        <div className="card swap-card swap-connected fade-in-up" style={{ animationDelay: "0.05s" }}>
          <div className="swap-connected-row">
            <span className="swap-pulse-dot" aria-hidden />
            <span className="muted">Connected</span>
            <code className="swap-address">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </code>
          </div>
          {wrongChain ? (
            <div style={{ marginTop: 12 }}>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Switch to <b>Polygon</b> to see balances and send the swap.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-press"
                style={{ marginTop: 10 }}
                disabled={switching}
                onClick={() => void switchChainAsync?.({ chainId: SWAP_CHAIN.id })}
              >
                {switching ? "Switching…" : "Switch to Polygon"}
              </button>
            </div>
          ) : null}
        </div>
      )}

      <div className="card swap-card fade-in-up" style={{ animationDelay: "0.1s" }}>
        <label className="swap-label" htmlFor="pol-in">
          You pay
        </label>
        <div className="swap-input-row">
          <input
            id="pol-in"
            className="field swap-field"
            inputMode="decimal"
            value={polAmount}
            onChange={(e) => setPolAmount(e.target.value)}
          />
          <span className="swap-input-suffix">POL</span>
        </div>
        {isConnected && address ? (
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            {quoting ? "Fetching quote…" : quote ? "Quote ready — review below." : quoteErr ? "" : "Enter an amount to quote."}
          </p>
        ) : null}
      </div>

      {quoting ? (
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

      {quote && !quoting ? (
        <div className="card swap-card swap-quote fade-in-up" style={{ animationDelay: "0.12s" }}>
          <h2 className="swap-quote-heading">You receive</h2>
          {umaOutDisplay ? (
            <p className="swap-uma-amount">
              <span className="swap-uma-value">{umaOutDisplay}</span>
              <span className="swap-uma-ticker">UMA</span>
            </p>
          ) : (
            <p className="muted">
              Amount in API response — check raw <code>buyAmount</code>.
            </p>
          )}
          {routeHint ? <p className="muted swap-route">{routeHint}</p> : null}
          <p className="muted swap-disclaimer">
            Slippage ~1% (API default). POL gas is extra. UMA on Polygon is for Polygon apps (e.g. markets);{" "}
            <b>Ethereum DVM voting</b> still uses UMA on mainnet. Confirm the full transaction in your wallet.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-press"
            style={{ marginTop: 14 }}
            disabled={sending || confirming || !isConnected || wrongChain}
            onClick={() => void onSwap()}
          >
            {sending || confirming ? (
              <>
                <span className="btn-spinner light" aria-hidden />
                Confirm in wallet…
              </>
            ) : wrongChain ? (
              "Switch to Polygon to swap"
            ) : (
              "Swap"
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

      <div style={{ marginTop: 20 }}>
        <OODisputesTeaser heading="Oracle disputes while you swap" className="fade-in-up" limit={5} />
      </div>
    </div>
  );
}
