import { Link } from "react-router-dom";

type MockCard = {
  key: string;
  title: string;
  topic: string;
  image: string;
  participation: string;
  stakeLabel: string;
  phase: string;
  votesHint: string;
};

/**
 * Illustrative dispute cards when the votes API is unreachable.
 * Not live data — motion and copy are decorative so the landing feed still feels alive.
 */
const MOCK_CARDS: MockCard[] = [
  {
    key: "m1",
    title: "Lakers vs. Celtics — total points over 215.5?",
    topic: "Sports",
    image: "https://picsum.photos/seed/umavote-sport/640/360",
    participation: "44% est.",
    stakeLabel: "2.1M UMA",
    phase: "Commit",
    votesHint: "128 wallets",
  },
  {
    key: "m2",
    title: "ETH above $3,200 on snapshot date?",
    topic: "Crypto",
    image: "https://picsum.photos/seed/umavote-eth/640/360",
    participation: "51% est.",
    stakeLabel: "3.4M UMA",
    phase: "Reveal",
    votesHint: "204 wallets",
  },
  {
    key: "m3",
    title: "Fed cuts benchmark rate before July?",
    topic: "Macro",
    image: "https://picsum.photos/seed/umavote-macro/640/360",
    participation: "38% est.",
    stakeLabel: "1.6M UMA",
    phase: "Commit",
    votesHint: "91 wallets",
  },
  {
    key: "m4",
    title: "Oscar — Best Picture winner resolved?",
    topic: "Culture",
    image: "https://picsum.photos/seed/umavote-film/640/360",
    participation: "62% est.",
    stakeLabel: "890K UMA",
    phase: "Reveal",
    votesHint: "76 wallets",
  },
  {
    key: "m5",
    title: "Super Bowl LIX — NFC champion market",
    topic: "Sports",
    image: "https://picsum.photos/seed/umavote-sb/640/360",
    participation: "47% est.",
    stakeLabel: "2.8M UMA",
    phase: "Commit",
    votesHint: "156 wallets",
  },
  {
    key: "m6",
    title: "EU policy headline — OO assertion disputed",
    topic: "Geopolitics",
    image: "https://picsum.photos/seed/umavote-eu/640/360",
    participation: "33% est.",
    stakeLabel: "1.2M UMA",
    phase: "Commit",
    votesHint: "64 wallets",
  },
];

function Card({ c, index }: { c: MockCard; index: number }) {
  const tilt = index % 2 === 0 ? -1.25 : 1.25;
  return (
    <div className="landing-contingency-card" style={{ transform: `rotate(${tilt}deg)` }} aria-hidden>
      <div className="landing-contingency-card__visual">
        <img src={c.image} alt="" width={640} height={360} loading="lazy" decoding="async" />
        <div className="landing-contingency-card__visual-shade" aria-hidden />
        <span className="landing-contingency-card__ribbon">Sample</span>
      </div>
      <div className="landing-contingency-card__body">
        <div className="landing-contingency-card__tags">
          <span className="landing-contingency-card__tag">Polygon OO</span>
          <span className="landing-contingency-card__tag landing-contingency-card__tag--soft">{c.topic}</span>
        </div>
        <p className="landing-contingency-card__title">{c.title}</p>
        <div className="landing-contingency-card__stats">
          <div className="landing-contingency-card__stat">
            <span className="landing-contingency-card__stat-k">DVM phase</span>
            <span className="landing-contingency-card__stat-v">{c.phase}</span>
          </div>
          <div className="landing-contingency-card__stat">
            <span className="landing-contingency-card__stat-k">Stake (illustr.)</span>
            <span className="landing-contingency-card__stat-v">{c.stakeLabel}</span>
          </div>
          <div className="landing-contingency-card__stat">
            <span className="landing-contingency-card__stat-k">Participation</span>
            <span className="landing-contingency-card__stat-v">{c.participation}</span>
          </div>
          <div className="landing-contingency-card__stat">
            <span className="landing-contingency-card__stat-k">Voters (illustr.)</span>
            <span className="landing-contingency-card__stat-v">{c.votesHint}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackStrip({ prefix }: { prefix: string }) {
  return (
    <>
      {MOCK_CARDS.map((c, i) => (
        <Card key={`${prefix}-${c.key}`} c={c} index={i} />
      ))}
    </>
  );
}

export default function LandingDisputesContingencyCarousel() {
  return (
    <div className="landing-contingency">
      <p className="landing-contingency__note">
        Stylized <strong>offline preview</strong> — numbers are placeholders.{" "}
        <Link to="/votes" className="landing-feed-link">
          Open votes
        </Link>{" "}
        when the API is up.
      </p>
      <div
        className="landing-contingency__viewport"
        role="region"
        aria-label="Illustrative dispute cards shown when the API is offline"
      >
        <div className="landing-contingency__fade landing-contingency__fade--left" aria-hidden />
        <div className="landing-contingency__fade landing-contingency__fade--right" aria-hidden />
        <div className="landing-contingency__track">
          <div className="landing-contingency__strip">
            <TrackStrip prefix="a" />
          </div>
          <div className="landing-contingency__strip" aria-hidden>
            <TrackStrip prefix="b" />
          </div>
        </div>
      </div>
    </div>
  );
}
