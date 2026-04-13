import { useQuery } from "@tanstack/react-query";
import { apiPost, getInitData } from "../api";

function openExternal(url: string) {
  window.Telegram?.WebApp?.openLink(url, { try_instant_view: false }) ?? window.open(url, "_blank", "noopener,noreferrer");
}

type Props = {
  /** From votes payload when available; vault status still returns authoritative signing flag. */
  apiVaultEnabled?: boolean;
};

export default function VaultCustodialPanel(props: Props) {
  const { apiVaultEnabled = false } = props;
  const init = getInitData();
  const q = useQuery({
    queryKey: ["vault-status", init.length],
    queryFn: () =>
      apiPost<{ vaultEnabled: boolean; address: string | null; exportedOnce: boolean }>("/api/vault/status", {
        initData: getInitData(),
      }),
    enabled: Boolean(init),
    staleTime: 45_000,
  });

  if (!init) {
    return (
      <div className="card">
        <h2>Custodial vault</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Open this app inside Telegram to create or use your <b>custodial vault</b> (one address for deposits, bot{" "}
          <code>/vote</code>/<code>/reveal</code>, and Mini App signing). In a normal browser there is no Telegram session
          to verify.
        </p>
      </div>
    );
  }

  const st = q.data;
  const signingOk = Boolean(st?.vaultEnabled ?? apiVaultEnabled);
  const addr = st?.address ?? null;

  return (
    <div className="card">
      <h2>Custodial vault</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Your <b>vault</b> is one EVM address held encrypted on the API — use it from the bot or this Mini App for
        commits without WalletConnect. <b>Custody:</b> the operator can sign txs this app allows; loss of DB + master key
        can drain the wallet.
      </p>
      {q.isPending ? <p className="muted">Loading vault…</p> : null}
      {q.isError ? <p className="muted" style={{ color: "var(--danger)" }}>Could not load vault status.</p> : null}
      {st ? (
        <>
          {!signingOk ? (
            <p className="muted" style={{ color: "var(--danger)", fontSize: 13 }}>
              Vault signing is off until the API has <code>VAULT_MASTER_KEY</code> and <code>ETH_RPC_URL</code>. You can
              still create an address and deposit.
            </p>
          ) : null}
          {addr ? (
            <>
              <p className="muted" style={{ wordBreak: "break-all", fontSize: 13, marginBottom: 0 }}>
                Vault address: <code>{addr}</code>
              </p>

              <div
                style={{
                  marginTop: 16,
                  padding: "14px 14px",
                  borderRadius: 10,
                  background: "rgba(127, 127, 127, 0.06)",
                  border: "1px solid rgba(127, 127, 127, 0.2)",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Deposit ETH or POL</h3>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  This is the <b>same</b> address on every chain. In your exchange or wallet, choose the network before
                  sending.
                </p>
                <ul className="muted" style={{ margin: "10px 0 12px", paddingLeft: 18, fontSize: 13 }}>
                  <li style={{ marginBottom: 8 }}>
                    <b>Ethereum mainnet</b> — Send <b>ETH</b> for gas on DVM <code>commitVote</code> /{" "}
                    <code>revealVote</code>. Send <b>UMA</b> here for staking weight on VotingV2 (use the official voter
                    dApp to stake/delegate from this address).
                  </li>
                  <li>
                    <b>Polygon</b> — Send <b>POL</b> (native gas) if you use this vault on Polygon (e.g. other apps or
                    future Polygon txs).
                  </li>
                </ul>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void navigator.clipboard.writeText(addr).then(() => window.alert("Address copied."))}
                  >
                    Copy address
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => openExternal(`https://etherscan.io/address/${addr}`)}>
                    Etherscan
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openExternal(`https://polygonscan.com/address/${addr}`)}
                  >
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
            </>
          ) : (
            <p className="muted">No vault yet — create one to get a deposit address.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {!addr ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={q.isFetching}
                onClick={async () => {
                  try {
                    await apiPost("/api/vault/create", { initData: getInitData() });
                    await q.refetch();
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Create failed");
                  }
                }}
              >
                Create custodial vault
              </button>
            ) : null}
            {addr && !st.exportedOnce ? (
              <button
                type="button"
                className="btn btn-secondary"
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
                    await q.refetch();
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : "Export failed");
                  }
                }}
              >
                Export key (once)
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
