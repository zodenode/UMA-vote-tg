import assert from "node:assert/strict";
import test from "node:test";
import { extractConditionIdFromAncillary, listPolymarketConditionIdCandidates } from "./polymarketEnrichment.js";

function ancFromUtf8(s: string): string {
  return `0x${Buffer.from(s, "utf8").toString("hex")}`;
}

test("listPolymarketConditionIdCandidates prefers conditionId over ancillaryDataHash in JSON", () => {
  const good = `0x${"aa".repeat(32)}`;
  const bad = `0x${"bb".repeat(32)}`;
  const j = { ancillaryDataHash: bad, filler: good, conditionId: good };
  const anc = ancFromUtf8(JSON.stringify(j));
  const list = listPolymarketConditionIdCandidates(anc);
  assert.equal(list[0], good.toLowerCase());
  assert.equal(extractConditionIdFromAncillary(anc), good.toLowerCase());
});

test("listPolymarketConditionIdCandidates deprioritizes questionId vs conditionId", () => {
  const qid = `0x${"11".repeat(32)}`;
  const cid = `0x${"22".repeat(32)}`;
  const j = { questionId: qid, condition_id: cid };
  const anc = ancFromUtf8(JSON.stringify(j));
  const list = listPolymarketConditionIdCandidates(anc);
  assert.equal(list[0], cid.toLowerCase());
  assert.ok(list.includes(qid.toLowerCase()));
});

test("non-JSON text: hex near 'hash' loses to later hex without hash context", () => {
  const bad = `0x${"cc".repeat(32)}`;
  const good = `0x${"dd".repeat(32)}`;
  const text = `ancillaryDataHash: ${bad}\ncondition_id ${good}\n`;
  const anc = ancFromUtf8(text);
  const list = listPolymarketConditionIdCandidates(anc);
  assert.ok(list.indexOf(good.toLowerCase()) < list.indexOf(bad.toLowerCase()));
});
