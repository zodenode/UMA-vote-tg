import { useEffect, useState } from "react";
import type { DvmTiming } from "../voteTypes";
import { formatDurationClock, formatEnDateTime } from "../voteUtils";

type Props = {
  dvm: DvmTiming;
};

/**
 * Fixed footer: live DVM commit/reveal countdown, phase progress, and local timestamps.
 */
export default function DvmPhaseStickyBar({ dvm }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [dvm.phaseEndsAt, dvm.roundId]);

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const secLeft = Math.max(0, dvm.phaseEndsAt - nowSec);
  const L = Math.max(1, dvm.phaseLengthSec);
  const progressPct = Math.min(100, Math.max(0, ((L - secLeft) / L) * 100));
  const phaseLabel = dvm.phase === "commit" ? "Commit phase" : "Reveal phase";
  const phaseEndLocal = formatEnDateTime(dvm.phaseEndsAt * 1000);
  const roundEndLocal = formatEnDateTime(dvm.roundEndsAt * 1000);

  return (
    <footer className="votes-dvm-sticky" role="status" aria-live="polite">
      <div className="votes-dvm-sticky__inner">
        <div className="votes-dvm-sticky__row">
          <span className="votes-dvm-sticky__badge">DVM round {dvm.roundId}</span>
          <span className="votes-dvm-sticky__phase">
            <strong>{phaseLabel}</strong>
            <span className="votes-dvm-sticky__timer" aria-label="Time remaining in this phase">
              {formatDurationClock(secLeft)} left
            </span>
          </span>
        </div>
        <div
          className="votes-dvm-sticky__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          aria-label={`${phaseLabel} progress`}
        >
          <div className="votes-dvm-sticky__fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="votes-dvm-sticky__meta">
          <span>
            Phase ends (local): <time dateTime={new Date(dvm.phaseEndsAt * 1000).toISOString()}>{phaseEndLocal}</time>
          </span>
          <span className="votes-dvm-sticky__dot" aria-hidden>
            ·
          </span>
          <span>
            Round ends (local): <time dateTime={new Date(dvm.roundEndsAt * 1000).toISOString()}>{roundEndLocal}</time>
          </span>
        </div>
        <div className="votes-dvm-sticky__clock muted">
          Your local time:{" "}
          <time dateTime={new Date(nowMs).toISOString()}>{formatEnDateTime(nowMs, { dateStyle: "medium", timeStyle: "medium" })}</time>
        </div>
      </div>
    </footer>
  );
}
