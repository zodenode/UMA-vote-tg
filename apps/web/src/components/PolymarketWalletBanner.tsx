import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { fetchPolymarketPublicProfile } from "../polymarketPublicProfile";

function dismissKey(address: string) {
  return `uma:pm-profile-dismiss:${address.toLowerCase()}`;
}

/**
 * After wallet connect, checks Polymarket Gamma `public-profile` for the connected EOA.
 * No profile does not prove the wallet never used Polymarket (proxy / different address).
 */
export default function PolymarketWalletBanner() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [found, setFound] = useState<boolean | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [proxyWallet, setProxyWallet] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!address || !isConnected) {
      setPhase("idle");
      setFound(null);
      setLabel(null);
      setProxyWallet(null);
      setCheckError(null);
      return;
    }
    try {
      setDismissed(sessionStorage.getItem(dismissKey(address)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    if (!address || !isConnected || dismissed) return;
    let cancelled = false;
    setPhase("loading");
    setCheckError(null);
    void fetchPolymarketPublicProfile(address).then((r) => {
      if (cancelled) return;
      setPhase("done");
      if (r.status === "found") {
        setFound(true);
        setLabel(r.displayLabel);
        setProxyWallet(r.proxyWallet);
      } else if (r.status === "not_found") {
        setFound(false);
        setLabel(null);
        setProxyWallet(null);
      } else {
        setFound(null);
        setLabel(null);
        setProxyWallet(null);
        setCheckError(r.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, dismissed]);

  if (!isConnected || !address) return null;

  if (phase === "loading") {
    return (
      <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
        Checking Polymarket public profile for this address…
      </p>
    );
  }

  if (dismissed) return null;

  if (phase === "done" && found === true) {
    return (
      <div className="pm-wallet-banner pm-wallet-banner--ok" role="status">
        <p style={{ margin: 0, fontSize: 13 }}>
          Polymarket lists a public profile for this wallet
          {label ? <b> · {label}</b> : null}.
          {proxyWallet ? (
            <span className="muted"> A proxy trading address is on file; signing here still uses your connected wallet.</span>
          ) : null}
        </p>
      </div>
    );
  }

  if (phase === "done" && found === false) {
    return (
      <div className="pm-wallet-banner pm-wallet-banner--warn" role="alert">
        <p style={{ margin: 0, fontSize: 13 }}>
          We did not find a <b>Polymarket public profile</b> for this address. Many traders use a different wallet or a
          Polymarket proxy — you can still continue, or disconnect and connect the address you use on Polymarket.
        </p>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary btn-press"
            onClick={() => {
              try {
                sessionStorage.setItem(dismissKey(address), "1");
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
          >
            Continue with this wallet
          </button>
          <button type="button" className="btn btn-secondary btn-press" onClick={() => disconnect()}>
            Switch wallet
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done" && checkError) {
    return (
      <div className="pm-wallet-banner pm-wallet-banner--warn" role="status">
        <p style={{ margin: 0, fontSize: 13 }}>
          Could not reach Polymarket to verify a public profile ({checkError}). You can still sign in — this check is
          optional.
        </p>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary btn-press"
            onClick={() => {
              try {
                sessionStorage.setItem(dismissKey(address), "1");
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
          >
            Continue anyway
          </button>
          <button type="button" className="btn btn-secondary btn-press" onClick={() => disconnect()}>
            Switch wallet
          </button>
        </div>
      </div>
    );
  }

  return null;
}
