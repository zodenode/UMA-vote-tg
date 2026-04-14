import type { ReactElement } from "react";
import { useQueries } from "@tanstack/react-query";
import { apiGet } from "../api";

type Outcome = { label: string; tokenId: string; mid: string | null };

function parseMid(mid: string | null): number | null {
  if (mid == null || mid.trim() === "") return null;
  const n = Number(mid);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

function pieSlices(outcomes: Outcome[]): { label: string; value: number }[] {
  if (outcomes.length === 2) {
    const a0 = parseMid(outcomes[0]!.mid);
    const a1 = parseMid(outcomes[1]!.mid);
    if (a0 != null && a1 != null && Math.abs(a0 + a1 - 1) <= 0.05) {
      return [
        { label: outcomes[0]!.label, value: a0 },
        { label: outcomes[1]!.label, value: a1 },
      ];
    }
    if (a0 != null) {
      return [
        { label: outcomes[0]!.label, value: a0 },
        { label: outcomes[1]!.label, value: Math.max(0, Math.min(1, 1 - a0)) },
      ];
    }
    if (a1 != null) {
      return [
        { label: outcomes[1]!.label, value: a1 },
        { label: outcomes[0]!.label, value: Math.max(0, Math.min(1, 1 - a1)) },
      ];
    }
  }
  const parsed = outcomes.map((o) => ({ label: o.label, v: parseMid(o.mid) }));
  const ok = parsed.filter((x) => x.v != null) as { label: string; v: number }[];
  if (ok.length === 0) return [];
  const sum = ok.reduce((s, x) => s + x.v, 0);
  if (sum <= 0) return ok.map((x) => ({ label: x.label, value: 1 / ok.length }));
  return ok.map((x) => ({ label: x.label, value: x.v / sum }));
}

const CHART_COLORS = ["#5b8def", "#34d399", "#fbbf24", "#f472b6"];

function SvgPie(slices: { label: string; value: number }[]) {
  if (slices.length === 0) return null;
  const cx = 50;
  const cy = 50;
  const r = 40;
  let angle = -Math.PI / 2;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const paths: ReactElement[] = [];
  slices.forEach((sl, i) => {
    const sweep = (sl.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    paths.push(<path key={i} d={d} fill={CHART_COLORS[i % CHART_COLORS.length]!} stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />);
  });
  return (
    <svg viewBox="0 0 100 100" width={112} height={112} aria-hidden>
      {paths}
    </svg>
  );
}

function MiniPriceLine(props: {
  history: { t: number; p: number }[];
  color: string;
  label: string;
}) {
  const { history, color, label } = props;
  const w = 280;
  const h = 72;
  const pad = 4;
  if (history.length < 2) {
    return (
      <div className="pm-chart-row">
        <span className="pm-chart-label">{label}</span>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Not enough history yet.
        </p>
      </div>
    );
  }
  const ts = history.map((x) => x.t);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const dt = t1 - t0 || 1;
  const pts = history
    .map((pt) => {
      const x = pad + ((pt.t - t0) / dt) * (w - pad * 2);
      const y = pad + (1 - pt.p) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="pm-chart-row">
      <span className="pm-chart-label">{label}</span>
      <svg className="pm-chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label} price over time`}>
        <polyline fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts} />
      </svg>
    </div>
  );
}

export default function PolymarketOddsCharts(props: { outcomes: Outcome[] }) {
  const { outcomes } = props;
  const slices = pieSlices(outcomes);
  const chartOutcomes = outcomes.filter((o) => o.tokenId?.trim()).slice(0, 2);

  const historyQueries = useQueries({
    queries: chartOutcomes.map((o) => ({
      queryKey: ["polymarket-prices-history", o.tokenId],
      queryFn: () =>
        apiGet<{ history: { t: number; p: number }[] }>(
          `/api/polymarket/prices-history?tokenId=${encodeURIComponent(o.tokenId)}&interval=1d`
        ),
      staleTime: 60_000,
    })),
  });

  if (slices.length === 0 && chartOutcomes.length === 0) return null;

  return (
    <div className="pm-odds-charts card" style={{ marginTop: 12 }}>
      <h3 className="pm-odds-charts-title">Polymarket snapshot</h3>
      <p className="muted" style={{ margin: "4px 0 12px", fontSize: 12, lineHeight: 1.45 }}>
        <b>Odds pie</b> uses CLOB mid prices (trader-implied), not UMA DVM votes. <b>Lines</b> are Polymarket price history
        (24h-style interval). On-chain DVM votes stay hidden until reveal.
      </p>
      <div className="pm-odds-charts-grid">
        {slices.length > 0 ? (
          <div className="pm-odds-pie-wrap">
            {SvgPie(slices)}
            <ul className="pm-odds-legend">
              {slices.map((s, i) => (
                <li key={s.label}>
                  <span className="pm-legend-swatch" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span>
                    {s.label} <span className="muted">{(s.value * 100).toFixed(1)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            No mid prices yet for a pie chart.
          </p>
        )}
        <div className="pm-odds-lines">
          {chartOutcomes.map((o, i) => {
            const q = historyQueries[i];
            if (q?.isError) {
              return (
                <p key={o.tokenId} className="muted" style={{ fontSize: 12, margin: 0 }}>
                  {o.label}: could not load price history.
                </p>
              );
            }
            const hist = q?.data?.history ?? [];
            return (
              <MiniPriceLine
                key={o.tokenId}
                history={hist}
                color={CHART_COLORS[i % CHART_COLORS.length]!}
                label={o.label}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
