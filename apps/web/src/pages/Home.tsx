import { Link } from "react-router-dom";
import OODisputesTeaser from "../components/OODisputesTeaser";

export default function Home() {
  return (
    <>
      <h1>uma.vote</h1>
      <p className="muted">
        Track <b>Polygon</b> disputes, buy <b>UMA</b> on <b>Ethereum</b> for voting weight, and commit/reveal on{" "}
        <b>VotingV2</b> from this Mini App.
      </p>
      <div className="card">
        <span className="badge">MVP</span>
        <h2>Next step</h2>
        <p className="muted">Swap ETH → UMA, or open votes to see what is live.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <Link to="/swap" className="btn btn-primary" style={{ textDecoration: "none", flex: 1 }}>
            Get UMA
          </Link>
          <Link to="/votes" className="btn btn-secondary" style={{ textDecoration: "none", flex: 1 }}>
            Active votes
          </Link>
        </div>
        <Link
          to="/petitions"
          className="btn btn-secondary"
          style={{ textDecoration: "none", display: "block", marginTop: 10, textAlign: "center" }}
        >
          Petitions
        </Link>
      </div>

      <div style={{ marginTop: 16 }}>
        <OODisputesTeaser heading="Indexed oracle disputes" />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>FAQ</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Quick answers if you already use wallets and bridges but are new to UMA&apos;s dispute flow.
        </p>

        <details className="home-faq-item">
          <summary className="home-faq-summary">How much UMA do I need to vote?</summary>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            There is no protocol minimum. <b>Voting weight</b> is proportional to how much UMA you have{" "}
            <b>staked</b> in <code>VotingV2</code> on <b>Ethereum mainnet</b> — not how much sits in your wallet.
            Smaller stakes still count; gas costs matter more at low sizes. UMA&apos;s voter program offers{" "}
            <b>ETH gas rebates</b> when you stake at least about <b>1,000 UMA</b> (see their{" "}
            <a href="https://docs.uma.xyz/using-uma/voting-walkthrough/voting-gas-rebates" target="_blank" rel="noreferrer">
              gas rebate walkthrough
            </a>
            ).
          </p>
        </details>

        <details className="home-faq-item">
          <summary className="home-faq-summary">How does UMA dispute voting work? (DVM basics)</summary>
          <div className="muted" style={{ marginTop: 10, fontSize: "0.875rem", lineHeight: 1.45 }}>
            <p style={{ margin: "0 0 10px" }}>
              <b>Two layers.</b> Apps post data through UMA&apos;s <b>Optimistic Oracle</b> on chains such as{" "}
              <b>Polygon</b>. If someone disputes a value, the question goes to the <b>DVM</b> (Data Verification
              Mechanism): token holders vote on the correct outcome on <b>Ethereum</b>.
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <b>Your checklist.</b> Hold <b>UMA on Ethereum</b>, stake it in the official voter dApp (
              <a href="https://vote.umaproject.org/" target="_blank" rel="noreferrer">
                vote.umaproject.org
              </a>
              ) so it is deposited in <code>VotingV2</code>, keep <b>ETH</b> on the same wallet for transaction fees,
              then during an active round use <b>commit</b> (submit a hash of your vote) and later <b>reveal</b>{" "}
              (publish the vote that matches the hash). Votes are hidden until the reveal window so voters cannot copy
              each other blindly.
            </p>
            <p style={{ margin: 0 }}>
              This Mini App lists disputes and can run <b>commit / reveal</b> against <code>VotingV2</code> once your
              address is staked — open <Link to="/votes">Active votes</Link> from a dispute or the votes tab.
            </p>
          </div>
        </details>

        <details className="home-faq-item">
          <summary className="home-faq-summary">Why Polygon here but Ethereum for voting?</summary>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Many integrations (for example Polymarket) use the OO on <b>Polygon</b> for speed and cost, so dispute
            events are indexed there. The <b>DVM vote</b> and <b>staking</b> always live on <b>Ethereum mainnet</b>. You
            bridge or buy assets accordingly: track disputes on Polygon, stake and vote with UMA + ETH on Ethereum.
          </p>
        </details>

        <details className="home-faq-item">
          <summary className="home-faq-summary">What happens if I commit without staking?</summary>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            The transaction might still go through, but with <b>zero staked UMA</b> your vote has <b>no weight</b> until
            you stake on <code>VotingV2</code> for that voter address (or your delegate&apos;s effective stake).
          </p>
        </details>
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Docs:{" "}
        <a href="https://docs.uma.xyz/community/governance" target="_blank" rel="noreferrer">
          UMA governance
        </a>
        {" · "}
        <a href="https://docs.uma.xyz/using-uma/voting-walkthrough" target="_blank" rel="noreferrer">
          Voting walkthrough
        </a>
      </p>
    </>
  );
}
