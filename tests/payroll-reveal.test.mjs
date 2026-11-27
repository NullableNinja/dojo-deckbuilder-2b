// The payroll slip's reveal order: plain data, no browser.
import assert from "node:assert/strict";
import test from "node:test";
import { revealBeats, revealState } from "../app/payroll-reveal.ts";

const payroll = (over = {}) => ({
  eligible: true, reason: null,
  lines: [{ id: "loss", merit: 40, stubs: 1 }, { id: "bonus", merit: 10 }],
  merit: 50, tickets: 0, stubs: 1, levelBefore: 1, levelAfter: 1, levels: [],
  stubsExchanged: 0, ticketsConverted: 0, meritFromTickets: 0, unlocked: { characters: [], bosses: [] }, ...over,
});
const input = (p, over = {}) => ({ payroll: p, meritAfter: 50, before: { level: 1, into: 0, span: 150 }, after: { level: 1, into: 50, span: 150 }, ...over });

test("pay lines play in order, then the meter, then the stamp", () => {
  const i = input(payroll());
  const beats = revealBeats(i);
  assert.deepEqual(beats.map((b) => b.kind), ["line", "line", "meter", "stamp"]);
  const start = revealState(i, beats, 0);
  assert.deepEqual(start.totals, { merit: 0, tickets: 0, stubs: 0 });
  assert.equal(start.meter.pct, 0);
  assert.equal(start.merit, 0);
  const mid = revealState(i, beats, 1);
  assert.deepEqual(mid.totals, { merit: 40, tickets: 0, stubs: 1 });
  assert.equal(mid.linesShown, 1);
  const end = revealState(i, beats, beats.length);
  assert.deepEqual(end.totals, { merit: 50, tickets: 0, stubs: 1 });
  assert.equal(end.meter.pct, 33);
  assert.equal(end.merit, 50);
  assert.equal(end.stamped, true);
});

test("a level-up fills the meter, bursts, resets, then fills toward the next level", () => {
  const i = input(payroll({ merit: 120, lines: [{ id: "win", merit: 120 }], levelAfter: 2 }), { meritAfter: 220, before: { level: 1, into: 100, span: 150 }, after: { level: 2, into: 70, span: 300 } });
  const beats = revealBeats(i);
  assert.deepEqual(beats.map((b) => b.kind), ["line", "meter", "level-up", "meter", "meter", "stamp"]);
  const full = revealState(i, beats, 2);
  assert.deepEqual(full.meter, { pct: 100, level: 1 });
  assert.equal(full.merit, 150, "the full bar reads the level's threshold, not past it");
  assert.equal(full.levelUpShown, false);
  const burst = revealState(i, beats, 3);
  assert.equal(burst.levelUpShown, true);
  const reset = revealState(i, beats, 4);
  assert.deepEqual(reset.meter, { pct: 0, level: 2, reset: true });
  const end = revealState(i, beats, beats.length);
  assert.deepEqual(end.meter, { pct: 23, level: 2 });
  assert.equal(end.merit, 220);
});

test("stub exchanges and collection conversions get their own beat", () => {
  const i = input(payroll({ stubsExchanged: 1, ticketsConverted: 1, meritFromTickets: 25 }), { meritAfter: 75 });
  assert.deepEqual(revealBeats(i).map((b) => b.kind), ["line", "line", "exchange", "collection", "meter", "stamp"]);
  assert.equal(revealState(i, revealBeats(i), 0).merit, 0);
});
