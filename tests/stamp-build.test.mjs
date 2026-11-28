// The deploy stamp must never put a query string on JavaScript (it split the entry module in two and
// loaded React twice); stylesheets and the build marker are still stamped.
import assert from "node:assert/strict";
import test from "node:test";
import { stampHtml } from "../scripts/stamp-build.mjs";

const html = `<meta name="ddb-build" content="__DDB_BUILD__">
<script type="module" crossorigin src="/dojo-deckbuilder/assets/index-Djm3StxT.js"></script>
<link rel="modulepreload" crossorigin href="/dojo-deckbuilder/assets/rolldown-runtime-pRHcBP7x.js">
<link rel="stylesheet" crossorigin href="/dojo-deckbuilder/assets/index-D8TnpUNa.css">`;

test("JavaScript URLs are left exactly as built", () => {
  const stamped = stampHtml(html, "1234567890abcdef");
  assert.ok(stamped.includes('src="/dojo-deckbuilder/assets/index-Djm3StxT.js"'));
  assert.ok(stamped.includes('href="/dojo-deckbuilder/assets/rolldown-runtime-pRHcBP7x.js"'));
  assert.ok(!/\.js\?/.test(stamped), "no .js URL may carry a query string");
});

test("stylesheets and the build marker are stamped", () => {
  const stamped = stampHtml(html, "1234567890abcdef");
  assert.ok(stamped.includes('index-D8TnpUNa.css?build=1234567890ab"'));
  assert.ok(stamped.includes('content="1234567890abcdef"'));
});
