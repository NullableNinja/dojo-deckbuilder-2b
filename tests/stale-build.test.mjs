// A stale tab reloads itself once after a deploy, never in a loop.
import assert from "node:assert/strict";
import test from "node:test";
import { claimStaleBuildReload, STALE_BUILD_WINDOW_MS } from "../app/stale-build.ts";

const memoryStore = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

test("the first failed file load may reload the page", () => {
  assert.equal(claimStaleBuildReload(memoryStore(), 1_000_000), true);
});

test("a second failure inside the window does not reload again", () => {
  const store = memoryStore();
  assert.equal(claimStaleBuildReload(store, 1_000_000), true);
  assert.equal(claimStaleBuildReload(store, 1_000_000 + STALE_BUILD_WINDOW_MS - 1), false);
});

test("after the window passes, a later deploy may reload once more", () => {
  const store = memoryStore();
  claimStaleBuildReload(store, 1_000_000);
  assert.equal(claimStaleBuildReload(store, 1_000_000 + STALE_BUILD_WINDOW_MS), true);
});

test("blocked or missing storage never auto-reloads, so a page cannot loop", () => {
  assert.equal(claimStaleBuildReload(null, 5), false);
  const blocked = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(claimStaleBuildReload(blocked, 5), false);
});
