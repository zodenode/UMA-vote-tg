import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, useConnect, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

const UMA = "0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828";

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
        setQuoteErr((j as { error?: string }).error ?? "Quote failed");
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
    sendTransaction({ to, data, value: value ? BigInt(value) : undefined });
  }

  const buyAmount = quote?.buyAmount as string | undefined;

  return (
    <>
      <h1>Swap to UMA</h1>
      <p className="muted">
        <b>Network:</b> Ethereum mainnet. Quotes via 0x. Gas is separate. This MVP does not custody funds.
      </p>

      {!isConnected ? (
        <div className="card">
          <p className="muted">Connect an in-browser Ethereum wallet (e.g. MetaMask mobile browser).</p>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="btn btn-primary"
              style={{ marginBottom: 8 }}
              disabled={connecting}
              onClick={() => connect({ connector: c })}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            Connected <code>{address?.slice(0, 6)}…{address?.slice(-4)}</code>
          </p>
        </div>
      )}

      <div className="card">
        <label className="muted" htmlFor="eth">
          Sell ETH amount
        </label>
        <input
          id="eth"
          className="field"
          style={{ marginTop: 8 }}
          inputMode="decimal"
          value={ethAmount}
          onChange={(e) => setEthAmount(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 12 }}
          disabled={loading || !isConnected}
          onClick={() => fetchQuote()}
        >
          {loading ? "Getting quote…" : "Get quote"}
        </button>
      </div>

      {quoteErr ? (
        <div className="card">
          <p style={{ color: "var(--danger)" }}>{quoteErr}</p>
        </div>
      ) : null}

      {quote ? (
        <div className="card">
          <h2>Quote</h2>
          {buyAmount ? (
            <p className="muted">
              Est. UMA out (raw): <code>{buyAmount}</code>
            </p>
          ) : null}
          <p className="muted">
            Integrator fee (if configured) is disclosed by the API as{" "}
            <code>buyTokenPercentageFee</code> to 0x — see 0x response in network tab for exact bps.
          </p>
          <p className="muted">
            <b>Disclaimer:</b> Slippage and routing can change. You sign the transaction in your wallet.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            disabled={sending || confirming}
            onClick={execute}
          >
            {sending || confirming ? "Confirm in wallet…" : "Execute swap"}
          </button>
          {sendErr ? (
            <p className="muted" style={{ color: "var(--danger)", marginTop: 8 }}>
              {sendErr.message}
            </p>
          ) : null}
          {txHash ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Tx: <code>{txHash}</code>
              {isSuccess ? " — confirmed" : confirming ? " — confirming…" : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
