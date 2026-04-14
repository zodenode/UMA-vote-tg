import { Link } from "react-router-dom";

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
