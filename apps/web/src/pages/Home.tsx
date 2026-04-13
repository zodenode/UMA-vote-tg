import { Link } from "react-router-dom";

export default function Home() {
  return (
    <>
      <h1>uma.vote</h1>
      <p className="muted">
        Track <b>Polygon</b> disputes, buy <b>UMA</b> on <b>Ethereum</b> for voting weight, commit/reveal in this app,
        or use the official voter dApp anytime.
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
      </div>
      <div className="card">
        <h2>Official voter dApp</h2>
        <p className="muted">All staking and voting happens on vote.umaproject.org (not affiliated).</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            window.Telegram?.WebApp?.openLink("https://vote.umaproject.org/", {
              try_instant_view: false,
            }) ?? window.open("https://vote.umaproject.org/", "_blank")
          }
        >
          Open vote.umaproject.org
        </button>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        Docs:{" "}
        <a href="https://docs.uma.xyz/community/governance" target="_blank" rel="noreferrer">
          UMA governance
        </a>
      </p>
    </>
  );
}
