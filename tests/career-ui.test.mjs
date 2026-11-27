// The career summary the shell, Home, setup and the Collection page all read.
import assert from "node:assert/strict";
import test from "node:test";
import { economy } from "../app/career.ts";
import { summarizeCareer } from "../app/career-summary.ts";

const fresh = () => economy.newCareer({ profileId: "test", createdAt: "2026-01-01T00:00:00.000Z", rngSeed: 1 });
const snapshot = (state, status = "career") => ({ status, state, restoredFromBackup: false });

test("a new career starts at Level 1 with nothing earned", () => {
  const summary = summarizeCareer(snapshot(economy.settle(fresh()).state));
  assert.equal(summary.level, 1);
  assert.equal(summary.fraction, 0);
  assert.equal(summary.nextLevel.level, 2);
  assert.ok(summary.nextLevel.merit > 0);
  assert.ok(summary.total > 500);
});

test("progress runs through the current level", () => {
  const state = economy.settle({ ...fresh(), merit: 150 + 25 }).state;
  const summary = summarizeCareer(snapshot(state));
  assert.equal(summary.level, 2);
  assert.ok(summary.fraction > 0 && summary.fraction < 1);
  assert.equal(summary.progress.into, 25);
});

test("no summary without a career to show", () => {
  assert.equal(summarizeCareer(snapshot(null, "unavailable")), null);
  assert.equal(summarizeCareer(snapshot(null, "everything")), null);
});
