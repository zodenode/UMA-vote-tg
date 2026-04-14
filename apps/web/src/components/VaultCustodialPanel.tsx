import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther, isAddress } from "viem";
import { mainnet, polygon } from "wagmi/chains";
import { useAccount, useChainId, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";
import { useCallback, useEffect, useState } from "react";
import { apiPost, getInitData } from "../api";

function openExternal(url: string) {
  window.Telegram?.WebApp?.openLink(url, { try_instant_view: false }) ?? window.open(url, "_blank", "noopener,noreferrer");
}

type Props = {
  /** From votes payload when available; vault status still returns authoritative signing flag. */
  apiVaultEnabled?: boolean;
};

type Balances = { address: string; ethWei: string | null; polWei: string | null };

export default function VaultCustodialPanel(props: Props) {
  const { apiVaultEnabled = false } = props;
  const init = getInitData();
  const qc = useQueryClient();
  const { address: browserAddr, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync, data: depTxHash, isPending: depPending, error: depErr } = useSendTransaction();
  const { isLoading: depConfirming, isSuccess: depSuccess } = useWaitForTransactionReceipt({
    hash: depTxHash,
  });

  const [wdChain, setWdChain] = useState<"1" | "137">("1");
  const [wdTo, setWdTo] = useState("");
  const [wdAmount, setWdAmount] = useState("");
  const [wdBusy, setWdBusy] = useState(false);
  const [wdMsg, setWdMsg] = useState<string | null>(null);

  const [depChain, setDepChain] = useState<"1" | "137">("1");
  const [depAmount, setDepAmount] = useState("");
  const [depMsg, setDepMsg] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["vault-status", init.length],
    queryFn: () =>
      apiPost<{ vaultEnabled: boolean; address: string | null; exportedOnce: boolean }>("/api/vault/status", {
        initData: getInitData(),
      }),
    enabled: Boolean(init),
    staleTime: 45_000,
  });

  const addr = q.data?.address ?? null;

  const bq = useQuery({
    queryKey: ["vault-balances", init.length, addr],
    queryFn: () => apiPost<Balances>("/api/vault/balances", { initData: getInitData() }),
    enabled: Boolean(init && addr),
    staleTime: 20_000,
  });

  const refetchVault = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["vault-status"] });
    await qc.invalidateQueries({ queryKey: ["vault-balances"] });
    await q.refetch();
    await bq.refetch();
  }, [qc, q, bq]);

  useEffect(() => {
    if (depSuccess) void refetchVault();
  }, [depSuccess, refetchVault]);

  async function onWithdraw() {
    setWdMsg(null);
    if (!init || !addr) return;
    const to = wdTo.trim();
    if (!isAddress(to)) {
      setWdMsg("Enter a valid 0x recipient address.");
      return;
    }
    const amt = wdAmount.trim();
    if (!amt) {
      setWdMsg("Enter amount in ETH or POL (e.g. 0.01) or use Max.");
      return;
    }
    let amountWei: string;
    if (amt.toLowerCase() === "max") {
      amountWei = "MAX";
    } else {
      try {
        amountWei = parseEther(amt).toString();
      } catch {
        setWdMsg("Invalid amount.");
        return;
      }
    }
    setWdBusy(true);
    try {
      const out = await apiPost<{ txHash: string; chainId: number }>("/api/vault/withdraw", {
        initData: init,
        chainId: Number(wdChain),
        to,
        amountWei,
      });
      setWdMsg(`Sent · tx ${out.txHash}`);
      setWdAmount("");
      await refetchVault();
    } catch (e) {
      setWdMsg(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setWdBusy(false);
    }
  }

  async function onMaxWithdraw() {
    setWdMsg(null);
    if (!init || !addr) return;
    const to = wdTo.trim();
    if (!isAddress(to)) {
      setWdMsg("Enter recipient first, then Max.");
      return;
    }
    setWdBusy(true);
    try {
      const out = await apiPost<{ txHash: string }>("/api/vault/withdraw", {
        initData: init,
        chainId: Number(wdChain),
        to,
        amountWei: "MAX",
      });
      setWdMsg(`Sent (max) · tx ${out.txHash}`);
      setWdAmount("");
      await refetchVault();
    } catch (e) {
      setWdMsg(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setWdBusy(false);
    }
  }

  async function onDepositFromWallet() {
    setDepMsg(null);
    if (!addr || !isConnected || !browserAddr) {
      setDepMsg("Connect a wallet first.");
      return;
    }
    const raw = depAmount.trim();
    if (!raw) {
      setDepMsg("Enter an amount (e.g. 0.02).");
      return;
    }
    let value: bigint;
    try {
      value = parseEther(raw);
    } catch {
      setDepMsg("Invalid amount.");
      return;
    }
    const targetChain = depChain === "1" ? mainnet.id : polygon.id;
    try {
      if (chainId !== targetChain) await switchChainAsync({ chainId: targetChain });
      await sendTransactionAsync({
        chainId: targetChain,
        to: addr as `0x${string}`,
        value,
      });
      setDepMsg("Confirm in your wallet…");
    } catch (e) {
      setDepMsg(e instanceof Error ? e.message : "Send failed");
    }
  }

  if (!init) {
    return (
      <div className="card">
        <h2>🔐 Custodial vault</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Open this app inside Telegram to use your <b>vault</b> (deposit, withdraw, <code>/vote</code> / Mini App). A
          normal browser has no Telegram session.
        </p>
      </div>
    );
  }

  const st = q.data;
  const signingOk = Boolean(st?.vaultEnabled ?? apiVaultEnabled);
  const bal = bq.data;

  return (
    <div className="card">
      <h2>🔐 Custodial vault</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        One EVM address on the API — <b>deposit</b> from any wallet, <b>withdraw</b> native ETH/POL to an address you
        choose, or vote via Mini App / bot. <b>Custody risk</b> applies.
      </p>
      {q.isPending ? <p className="muted">Loading vault…</p> : null}
      {q.isError ? <p className="muted" style={{ color: "var(--danger)" }}>Could not load vault status.</p> : null}
      {st ? (
        <>
          {!signingOk ? (
            <p className="muted" style={{ color: "var(--danger)", fontSize: 13 }}>
              Signing off until the API has <code>VAULT_MASTER_KEY</code> + <code>ETH_RPC_URL</code> (Polygon needs{" "}
              <code>POLYGON_RPC_URL</code> for POL balances / withdraw).
            </p>
          ) : null}
          {addr ? (
            <>
              <p className="muted" style={{ wordBreak: "break-all", fontSize: 13, marginBottom: 0 }}>
                📬 Vault: <code>{addr}</code>
              </p>
              {bal ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  {bal.ethWei != null ? (
                    <>
                      ⛓ ETH: <b>{formatEther(BigInt(bal.ethWei))}</b>
                    </>
                  ) : (
                    "⛓ ETH: —"
                  )}
                  {" · "}
                  {bal.polWei != null ? (
                    <>
                      💜 POL: <b>{formatEther(BigInt(bal.polWei))}</b>
                    </>
                  ) : (
                    "💜 POL: —"
                  )}
                </p>
              ) : bq.isFetching ? (
                <p className="muted" style={{ fontSize: 12 }}>
                  Loading balances…
                </p>
              ) : null}

              <div
                style={{
                  marginTop: 14,
                  padding: "14px 14px",
                  borderRadius: 10,
                  background: "rgba(127, 127, 127, 0.06)",
                  border: "1px solid rgba(127, 127, 127, 0.2)",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>📥 Deposit (any wallet)</h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  Send <b>ETH</b> on Ethereum or <b>POL</b> on Polygon to the address above — same address on both
                  chains.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-press"
                    onClick={() => void navigator.clipboard.writeText(addr).then(() => window.alert("Address copied."))}
                  >
                    📋 Copy address
                  </button>
                  <button type="button" className="btn btn-secondary btn-press" onClick={() => openExternal(`https://etherscan.io/address/${addr}`)}>
                    Etherscan
                  </button>
                  <button type="button" className="btn btn-secondary btn-press" onClick={() => openExternal(`https://polygonscan.com/address/${addr}`)}>
                    Polygonscan
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 12, marginBottom: 0, fontSize: 11 }}>
                  QR (scan from another device)
                </p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(addr)}`}
                  width={160}
                  height={160}
                  alt=""
                  style={{ marginTop: 8, borderRadius: 8, background: "#fff", padding: 8 }}
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "14px 14px",
                  borderRadius: 10,
                  background: "rgba(59, 130, 246, 0.08)",
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>💳 Deposit from connected wallet</h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                  Sends <b>native</b> ETH or POL from <i>your</i> browser wallet into the vault (you pay gas).
                </p>
                <label className="muted" htmlFor="dep-chain" style={{ fontSize: 12 }}>
                  Network
                </label>
                <select
                  id="dep-chain"
                  className="field"
                  style={{ marginTop: 6 }}
                  value={depChain}
                  onChange={(e) => setDepChain(e.target.value as "1" | "137")}
                >
                  <option value="1">Ethereum (ETH)</option>
                  <option value="137">Polygon (POL)</option>
                </select>
                <label className="muted" htmlFor="dep-amt" style={{ display: "block", marginTop: 10, fontSize: 12 }}>
                  Amount
                </label>
                <input
                  id="dep-amt"
                  className="field"
                  style={{ marginTop: 6 }}
                  placeholder="e.g. 0.02"
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-press"
                  style={{ marginTop: 10 }}
                  disabled={depPending || depConfirming}
                  onClick={() => void onDepositFromWallet()}
                >
                  {depPending || depConfirming ? "Wallet…" : "➡️ Send to vault"}
                </button>
                {depMsg ? (
                  <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    {depMsg}
                  </p>
                ) : null}
                {depErr ? (
                  <p className="muted" style={{ color: "var(--danger)", marginTop: 6, fontSize: 12 }}>
                    {depErr.message}
                  </p>
                ) : null}
                {depSuccess ? (
                  <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    ✅ Deposit tx confirmed. Balances refresh shortly.
                  </p>
                ) : null}
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "14px 14px",
                  borderRadius: 10,
                  background: "rgba(52, 211, 153, 0.08)",
                  border: "1px solid rgba(52, 211, 153, 0.22)",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>📤 Withdraw (vault → you)</h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
                  API signs a native transfer from the vault. Use <b>Max</b> to send everything minus a gas reserve.
                </p>
                <label className="muted" htmlFor="wd-chain" style={{ fontSize: 12 }}>
                  Chain
                </label>
                <select
                  id="wd-chain"
                  className="field"
                  style={{ marginTop: 6 }}
                  value={wdChain}
                  onChange={(e) => setWdChain(e.target.value as "1" | "137")}
                >
                  <option value="1">Ethereum (ETH)</option>
                  <option value="137">Polygon (POL)</option>
                </select>
                <label className="muted" htmlFor="wd-to" style={{ display: "block", marginTop: 10, fontSize: 12 }}>
                  Recipient (0x…)
                </label>
                <input
                  id="wd-to"
                  className="field"
                  style={{ marginTop: 6 }}
                  placeholder="0x…"
                  value={wdTo}
                  onChange={(e) => setWdTo(e.target.value)}
                />
                <label className="muted" htmlFor="wd-amt" style={{ display: "block", marginTop: 10, fontSize: 12 }}>
                  Amount ({wdChain === "1" ? "ETH" : "POL"})
                </label>
                <input
                  id="wd-amt"
                  className="field"
                  style={{ marginTop: 6 }}
                  placeholder="e.g. 0.05 or max"
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn btn-primary btn-press" disabled={wdBusy} onClick={() => void onWithdraw()}>
                    {wdBusy ? "…" : "📤 Withdraw"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-press" disabled={wdBusy} onClick={() => void onMaxWithdraw()}>
                    Max (native)
                  </button>
                </div>
                {wdMsg ? (
                  <p className="muted" style={{ marginTop: 8, fontSize: 12, wordBreak: "break-all" }}>
                    {wdMsg}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted">No vault yet — create one to get a deposit address.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {!addr ? (
              <button
                type="button"
                className="btn btn-primary btn-press"
                disabled={q.isFetching}
                onClick={async () => {
                  try {
                    await apiPost("/api/vault/create", { initData: getInitData() });
                    await refetchVault();
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Create failed");
                  }
                }}
              >
                ➕ Create vault
              </button>
            ) : null}
            {addr && !st.exportedOnce ? (
              <button
                type="button"
                className="btn btn-secondary btn-press"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Export private key ONE time only. Anyone with this key controls the wallet. Continue?"
                    )
                  )
                    return;
                  try {
                    const out = await apiPost<{ privateKey: string; warning?: string }>("/api/vault/export", {
                      initData: getInitData(),
                    });
                    await navigator.clipboard.writeText(out.privateKey);
                    window.alert("Private key copied to clipboard. Store it offline and clear clipboard when done.");
                    await refetchVault();
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Export failed");
                  }
                }}
              >
                🔑 Export key (once)
              </button>
            ) : null}
          </div>
          {st.exportedOnce ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Private key was already exported — cannot export again.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
