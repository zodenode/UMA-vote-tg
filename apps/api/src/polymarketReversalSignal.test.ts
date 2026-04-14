import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PolymarketEnrichment } from "./polymarketEnrichment.js";
import {
  computePolymarketReversalWatch,
  WEI_1E18,
} from "./polymarketReversalSignal.js";

function pm(
  outcomes: { label: string; mid: string | null }[],
  extra?: Partial<PolymarketEnrichment>
): PolymarketEnrichment {
  return {
    conditionId: "0x" + "a".repeat(64),
    title: "Test",
    slug: null,
    url: null,
    image: null,
    outcomes: outcomes.map((o) => ({
      label: o.label,
      tokenId: "t",
      priceBuy: null,
      priceSell: null,
      mid: o.mid,
    })),
    proposedPriceHint: null,
    fetchedAt: 0,
    ...extra,
  };
}

describe("computePolymarketReversalWatch", () => {
  it("flags strong disagreement when OO favors high side but CLOB disagrees", () => {
    const r = computePolymarketReversalWatch(
      WEI_1E18.toString(),
      pm([
        { label: "Yes", mid: "0.32" },
        { label: "No", mid: "0.68" },
      ])
    );
    assert.equal(r.reversalWatch, true);
    assert.ok(r.reversalWatchReason?.includes("Yes"));
    assert.ok(r.reversalWatchReason?.includes("0.32"));
  });

  it("flags strong disagreement when proposed 0 favors second outcome", () => {
    const r = computePolymarketReversalWatch(
      "0",
      pm([
        { label: "Yes", mid: "0.72" },
        { label: "No", mid: "0.28" },
      ])
    );
    assert.equal(r.reversalWatch, true);
    assert.ok(r.reversalWatchReason?.includes("No"));
  });

  it("flags dead heat when both mids are near 50/50", () => {
    const r = computePolymarketReversalWatch(
      WEI_1E18.toString(),
      pm([
        { label: "A", mid: "0.48" },
        { label: "B", mid: "0.52" },
      ])
    );
    assert.equal(r.reversalWatch, true);
    assert.ok(r.reversalWatchReason?.toLowerCase().includes("50/50"));
  });

  it("returns false when a mid is missing", () => {
    const r = computePolymarketReversalWatch(
      WEI_1E18.toString(),
      pm([
        { label: "Yes", mid: "0.32" },
        { label: "No", mid: null },
      ])
    );
    assert.equal(r.reversalWatch, false);
    assert.equal(r.reversalWatchReason, null);
  });

  it("returns false for three-outcome markets", () => {
    const tri: PolymarketEnrichment = {
      conditionId: "0x" + "b".repeat(64),
      title: "Multi",
      slug: null,
      url: null,
      image: null,
      outcomes: [
        { label: "A", tokenId: "a", priceBuy: null, priceSell: null, mid: "0.2" },
        { label: "B", tokenId: "b", priceBuy: null, priceSell: null, mid: "0.3" },
        { label: "C", tokenId: "c", priceBuy: null, priceSell: null, mid: "0.5" },
      ],
      proposedPriceHint: null,
      fetchedAt: 0,
    };
    const r = computePolymarketReversalWatch(WEI_1E18.toString(), tri);
    assert.equal(r.reversalWatch, false);
  });

  it("returns false when proposed is not clean 0 or 1e18", () => {
    const r = computePolymarketReversalWatch(
      "500000000000000000",
      pm([
        { label: "Yes", mid: "0.1" },
        { label: "No", mid: "0.9" },
      ])
    );
    assert.equal(r.reversalWatch, false);
  });

  it("returns false when market and OO are aligned", () => {
    const r = computePolymarketReversalWatch(
      WEI_1E18.toString(),
      pm([
        { label: "Yes", mid: "0.82" },
        { label: "No", mid: "0.18" },
      ])
    );
    assert.equal(r.reversalWatch, false);
  });

  it("returns false for null enrichment", () => {
    const r = computePolymarketReversalWatch(WEI_1E18.toString(), null);
    assert.equal(r.reversalWatch, false);
  });
});
