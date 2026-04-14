import { useEffect, useState } from "react";
import OODisputesTeaser from "../components/OODisputesTeaser";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { apiPost, getInitData, getTelegramChat } from "../api";
import VaultCustodialPanel from "../components/VaultCustodialPanel";
import { useSession } from "../session";

const botUser = import.meta.env.VITE_PUBLIC_BOT_USERNAME ?? "YOUR_BOT";

export default function Account() {
  const { session, setSession } = useSession();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [alertsOn, setAlertsOn] = useState(session?.alertsOn ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session) setAlertsOn(session.alertsOn);
  }, [session]);

  async function toggleAlerts(next: boolean) {
    const initData = getInitData();
    if (!initData) {
      setMsg("Open this screen from Telegram to change alerts.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/api/me/alerts", { initData, alertsOn: next });
      setAlertsOn(next);
      setSession((s) => (s ? { ...s, alertsOn: next } : s));
      const chat = getTelegramChat();
      if (chat && (chat.type === "group" || chat.type === "supergroup")) {
        await apiPost("/api/groups/alerts-member", {
          initData,
          chatId: String(chat.id),
          title: chat.title,
          delta: next ? 1 : -1,
        }).catch(() => {});
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to update alerts");
    } finally {
      setBusy(false);
    }
  }

  const refLink =
    session?.refCode && botUser
      ? `https://t.me/${botUser}?start=ref_${session.refCode}`
      : session?.refCode
        ? `(set VITE_PUBLIC_BOT_USERNAME) ref_${session.refCode}`
        : "—";

  async function copyRef() {
    if (!session?.refCode || !botUser || botUser === "YOUR_BOT") {
      setMsg("Set VITE_PUBLIC_BOT_USERNAME in the web env to build a shareable t.me link.");
      return;
    }
    const link = `https://t.me/${botUser}?start=ref_${session.refCode}`;
    await navigator.clipboard.writeText(link);
    setMsg("Referral link copied.");
  }

  function shareReminder() {
    const mini =
      botUser && botUser !== "YOUR_BOT"
        ? `https://t.me/${botUser}?startapp=vote`
        : "Open the uma.vote Mini App → Votes.";
    const text = [
      "UMA DVM vote window — commit & reveal in the Mini App (Ethereum wallet).",
      "",
      mini,
      "",
      "Swap to UMA on Ethereum for voting weight when you are ready.",
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => setMsg("Reminder text copied for your chat."));
  }

  return (
    <>
      <h1>Account</h1>

      <VaultCustodialPanel />

      <div className="card">
        <h2>Wallet (EVM)</h2>
        <p className="muted">
          DVM signing uses an <b>Ethereum mainnet</b> wallet. Telegram Wallet is not a substitute for EVM here.
        </p>
        {!isConnected ? (
          connectors.map((c) => (
            <button
              key={c.uid}
              type="button"
              className="btn btn-primary"
              style={{ marginBottom: 8 }}
              onClick={() => connect({ connector: c })}
            >
              Connect {c.name}
            </button>
          ))
        ) : (
          <>
            <p className="muted">
              <code>{address}</code>
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => disconnect()}>
              Disconnect
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <OODisputesTeaser heading="Indexed OO disputes" limit={5} />
      </div>

      <div className="card">
        <h2>Vote alerts</h2>
        <p className="muted">At most one digest per day while unresolved votes exist (via bot + API).</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={busy || alertsOn}
            onClick={() => toggleAlerts(true)}
          >
            Turn on
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1 }}
            disabled={busy || !alertsOn}
            onClick={() => toggleAlerts(false)}
          >
            Turn off
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Referrals</h2>
        <p className="muted">Your code: {session?.refCode ? <code>{session.refCode}</code> : "Open from bot first"}</p>
        <p className="muted">Link: {typeof refLink === "string" && refLink.startsWith("http") ? refLink : refLink}</p>
        <button type="button" className="btn btn-secondary" onClick={() => copyRef()}>
          Copy referral link
        </button>
      </div>

      <div className="card coming-soon">
        <h2>Discord — coming soon</h2>
        <p className="muted">
          Connect your Discord account so we can <b>auto-post vote reminders</b> (and optional milestones) into a
          channel you choose — same trust rules as Telegram: no vote choices, only timing and links.
        </p>
        <button type="button" className="btn btn-secondary" disabled>
          Connect Discord (soon)
        </button>
      </div>

      <div className="card">
        <h2>Share for friends</h2>
        <p className="muted">Copy a neutral reminder you can paste into any chat.</p>
        <button type="button" className="btn btn-secondary" onClick={shareReminder}>
          Copy reminder text
        </button>
      </div>

      <div className="card">
        <h2>Phase 2 (not in this MVP)</h2>
        <p className="muted">
          In-app <b>staking</b> UI (deposit UMA into VotingV2 from this app) is not in this MVP; commit and reveal are
          already supported on each dispute page. Stake UMA on VotingV2 with the same address you vote from (any
          Ethereum tool you trust), then return here to commit.
        </p>
      </div>

      {msg ? <p className="muted">{msg}</p> : null}
    </>
  );
}
