// Stamps dist/index.html and writes dist/build.json after a production build (run by the Pages workflow).
//
// What is stamped:
//   - __DDB_BUILD__ is replaced with the commit, so the page knows which build it is (stale-tab detection).
//   - Stylesheet URLs get ?build=<short sha> so a cached app shell cannot pair old CSS with a new page.
//
// What is NEVER stamped: JavaScript. Lazy chunks import the entry chunk by its plain file name; if the page
// loaded the entry as "index-xxxx.js?build=abc" the browser would see two different modules, run the entry
// twice and load a second copy of React ("Invalid hook call", blank site). JS file names already carry a
// content hash, so they never need a query string.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function stampHtml(html, build) {
  return html
    .replace("__DDB_BUILD__", build)
    .replace(/((?:src|href)="\/[^/]+\/assets\/[^"?]+\.css)"/g, (_, asset) => `${asset}?build=${build.slice(0, 12)}"`);
}

async function main() {
  const build = process.env.DDB_BUILD;
  if (!build) throw new Error("DDB_BUILD was not provided.");
  const indexPath = "dist/index.html";
  await writeFile(indexPath, stampHtml(await readFile(indexPath, "utf8"), build));
  await writeFile("dist/build.json", `${JSON.stringify({ build })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
