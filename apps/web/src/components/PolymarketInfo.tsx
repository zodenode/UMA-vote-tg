import type { PolymarketBlock } from "../voteTypes";

export default function PolymarketInfo(props: {
  pm: NonNullable<PolymarketBlock>;
  reversalWatch?: boolean;
}) {
  const { pm, reversalWatch } = props;
  const title = pm.title?.trim() ? pm.title : "Unknown market";
  const link = pm.url;
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(127, 127, 127, 0.08)",
        border: "1px solid rgba(127, 127, 127, 0.2)",
      }}
    >
      {pm.image ? (
        <img
          src={pm.image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            maxHeight: 160,
            objectFit: "cover",
            borderRadius: 6,
            marginBottom: 10,
            display: "block",
          }}
        />
      ) : null}
      <p style={{ margin: 0, fontSize: 13 }}>
        <b>Polymarket</b> <span className="muted">(informational, not advice)</span>
      </p>
      {link ? (
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
          <button
            type="button"
            className="btn btn-secondary btn-press"
            style={{ fontSize: 12 }}
            onClick={() => window.Telegram?.WebApp?.openLink(link, { try_instant_view: false }) ?? window.open(link, "_blank")}
          >
            {title}
          </button>
        </p>
      ) : (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          {title}
        </p>
      )}
      {pm.outcomes?.length ? (
        <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12 }}>
          {pm.outcomes.map((o) => (
            <li key={o.tokenId}>
              <b>{o.label}</b>
              {o.mid != null ? ` — mid ${o.mid}` : ""}
              {o.mid == null && o.priceBuy != null ? ` — buy ${o.priceBuy}` : ""}
              {o.mid == null && o.priceBuy == null && o.priceSell != null ? ` — sell ${o.priceSell}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {pm.proposedPriceHint ? (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 11 }}>
          OO proposed (hint): {pm.proposedPriceHint}
        </p>
      ) : null}
      {pm.error ? (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 11, color: "var(--danger)" }}>
          {pm.error}
        </p>
      ) : null}
      {reversalWatch ? (
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 11 }}>
          <b>Reversal watch</b> (heuristic) — full rationale is in the banner under the page title (CLOB vs OO{" "}
          <code>proposedPrice</code>).
        </p>
      ) : null}
    </div>
  );
}
