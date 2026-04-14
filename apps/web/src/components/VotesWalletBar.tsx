import { mainnet } from "wagmi/chains";
import { useAccount, useConnect, useChainId, useSwitchChain } from "wagmi";

const walletConnectConfigured = Boolean(
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim()
);

export default function VotesWalletBar() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== mainnet.id;

  return (
    <div className="card">
      <h2>Wallet</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Disputes usually appear on <b>Polygon</b> first. Commit and reveal are signed on <b>Ethereum mainnet</b> — connect
        your wallet below.
        {!walletConnectConfigured ? (
          <>
            {" "}
            <span className="muted">
              (WalletConnect is not configured for this build; use an injected wallet such as MetaMask when the browser
              supports it.)
            </span>
          </>
        ) : null}
      </p>
      {!isConnected ? (
        <div style={{ marginTop: 8 }}>
          {connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="btn btn-primary btn-press"
              style={{ marginRight: 8, marginTop: 6 }}
              disabled={connecting}
              onClick={() => connect({ connector: c, chainId: mainnet.id })}
            >
              {connecting ? "Connecting…" : c.name}
            </button>
          ))}
        </div>
      ) : wrongChain ? (
        <div style={{ marginTop: 8 }}>
          <p className="muted">Switch to Ethereum mainnet to vote.</p>
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
        <p className="muted" style={{ marginTop: 8 }}>
          Connected <code>{address?.slice(0, 6)}…{address?.slice(-4)}</code>
        </p>
      )}
    </div>
  );
}
