import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import { encodeVoteFocusToken } from "../voteFocusToken";

type PolymarketSearchHit = {
  conditionId: string;
  title: string;
  slug: string;
  image: string | null;
  url: string;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setD(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return d;
}

function tryPolymarketUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    const h = u.hostname.toLowerCase();
    if (h !== "polymarket.com" && !h.endsWith(".polymarket.com")) return false;
    const p = u.pathname.split("/").filter(Boolean);
    return (p[0] === "event" || p[0] === "market") && Boolean(p[1]);
  } catch {
    return false;
  }
}

function shouldSearchPolymarket(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^0x[a-f0-9]{64}$/i.test(t)) return true;
  if (tryPolymarketUrl(t)) return true;
  return t.length >= 2;
}

export default function MarketDisputeFinder({ className = "", id }: { className?: string; id?: string }) {
  const inputId = useId();
  const listId = useId();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const debounced = useDebouncedValue(input, 300);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [noDisputeHit, setNoDisputeHit] = useState<PolymarketSearchHit | null>(null);

  const canSearch = shouldSearchPolymarket(debounced);
  const q = useQuery({
    queryKey: ["polymarket-search", debounced],
    queryFn: () =>
      apiGet<{ results: PolymarketSearchHit[] }>(
        `/api/polymarket/search?q=${encodeURIComponent(debounced.trim())}&limit=10`
      ),
    enabled: canSearch,
    staleTime: 45_000,
  });

  const results = q.data?.results ?? [];

  useEffect(() => {
    setHighlight(0);
  }, [debounced, results.length]);

  const goToDispute = useCallback(
    async (hit: PolymarketSearchHit) => {
      setResolving(true);
      setNoDisputeHit(null);
      try {
        const r = await apiGet<{ found: boolean; disputeId?: string }>(
          `/api/disputes/by-condition?conditionId=${encodeURIComponent(hit.conditionId)}`
        );
        if (r.found && r.disputeId) {
          const token = encodeVoteFocusToken(r.disputeId);
          navigate(`/votes/dispute/${token}`);
          setInput("");
          setOpen(false);
        } else {
          setNoDisputeHit(hit);
          setOpen(false);
        }
      } catch {
        setNoDisputeHit(hit);
        setOpen(false);
      } finally {
        setResolving(false);
      }
    },
    [navigate]
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showList = open && (q.isFetching || results.length > 0);

  return (
    <div
      id={id}
      className={`market-finder${className ? ` ${className}` : ""}`.trim()}
      ref={rootRef}
    >
      <p className="market-finder-label" id={`${inputId}-label`}>
        Find a market in dispute
      </p>
      <p className="market-finder-hint">
        Paste a <strong>Polymarket link</strong>, a <strong>condition id</strong> (0x…), or type to search. You will need{" "}
        <strong>UMA on Ethereum</strong> staked on VotingV2 for vote weight —{" "}
        <Link to="/swap" className="market-finder-inline-link">
          swap on Polygon
        </Link>{" "}
        first if you only hold POL.
      </p>
      <div className="market-finder-field-wrap">
        <input
          id={inputId}
          className="market-finder-input"
          type="search"
          autoComplete="off"
          placeholder="e.g. polymarket.com/event/… or “bitcoin election”"
          aria-labelledby={`${inputId}-label`}
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[highlight] ? `${listId}-opt-${highlight}` : undefined}
          value={input}
          disabled={resolving}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setNoDisputeHit(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((i) => (i + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const hit = results[highlight];
              if (hit) void goToDispute(hit);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {q.isFetching ? <span className="market-finder-spinner" aria-hidden /> : null}
      </div>

      {showList ? (
        <ul id={listId} className="market-finder-list" role="listbox">
          {results.map((hit, i) => (
            <li key={hit.conditionId} id={`${listId}-opt-${i}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`market-finder-option${i === highlight ? " market-finder-option--active" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => void goToDispute(hit)}
              >
                <span className="market-finder-option-img-wrap">
                  {hit.image ? (
                    <img
                      className="market-finder-option-img"
                      src={hit.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(ev) => {
                        (ev.target as HTMLImageElement).style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <span className="market-finder-option-fallback" aria-hidden>
                      ◈
                    </span>
                  )}
                </span>
                <span className="market-finder-option-text">
                  <span className="market-finder-option-title">{hit.title}</span>
                  <span className="market-finder-option-sub">{hit.slug}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {canSearch && !q.isFetching && q.isSuccess && open && results.length === 0 ? (
        <p className="market-finder-empty">No markets matched. Try different words or paste the full Polymarket URL.</p>
      ) : null}

      {resolving ? <p className="market-finder-status">Looking up oracle dispute…</p> : null}

      {noDisputeHit ? (
        <div className="market-finder-followup">
          <p className="market-finder-followup-title">No matching dispute in our index yet</p>
          <p className="market-finder-followup-text">
            We only list active <strong>DisputePrice</strong> flows we have indexed. You can still open the market, get
            UMA, then return here once a dispute row appears — voting and staking context are on each dispute page.
          </p>
          <div className="market-finder-followup-row">
            <a className="landing-btn landing-btn--primary landing-btn--compact" href={noDisputeHit.url} target="_blank" rel="noreferrer">
              Open market
            </a>
            <Link to="/swap" className="landing-btn landing-btn--secondary landing-btn--compact">
              Swap to UMA
            </Link>
            <Link to="/votes" className="landing-btn landing-btn--ghost landing-btn--compact">
              All disputes
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
