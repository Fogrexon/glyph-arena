#!/usr/bin/env node
/**
 * P6: compare the bundles the site is actually serving with the recorded ones.
 *
 *   pnpm check:deployed          # detect drift, exit 1 on a mismatch
 *   pnpm check:deployed --write  # record what is being served (after a deploy)
 *
 * The record has to be written **after** the deploy: a local build cannot know
 * Pages' `--base`, so the local hash never equals the published one.
 *
 * Deliberately not a CI step: it reads the public site over the network, so a
 * flaky connection would fail a pull request for the wrong reason.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const RECORD = join(ROOT, "docs", "bundles.json");
const BASE = process.env.GLYPH_ARENA_BASE ?? "https://fogrexon.github.io/glyph-arena";

const pages = { root: `${BASE}/`, parry: `${BASE}/parry/` };
const recorded = JSON.parse(readFileSync(RECORD, "utf8"));
const write = process.argv.includes("--write");
const detected = {};
let failed = 0;

for (const [name, url] of Object.entries(pages)) {
  // Cache-buster: otherwise the CDN in front of Pages can serve the previous
  // release for a while and this check reports a name that no longer exists.
  const response = await fetch(`${url}?cb=${Date.now()}`);
  if (!response.ok) {
    console.error(`FAIL ${name}: ${url} returned ${response.status}`);
    failed += 1;
    continue;
  }

  const html = await response.text();
  const unique = [...new Set([...html.matchAll(/index-[A-Za-z0-9_-]+\.js/g)].map((m) => m[0]))];
  const expected = recorded[name];

  if (unique.length !== 1) {
    console.error(`FAIL ${name}: expected exactly one index-*.js, found ${unique.length}${unique.length ? ` (${unique.join(", ")})` : ""}`);
    failed += 1;
    continue;
  }

  detected[name] = unique[0];
  if (unique[0] !== expected && !write) {
    console.error(
      `FAIL ${name}: serving ${unique[0]}, recorded ${expected}` +
        ` — run \`pnpm check:deployed --write\` after the deploy and commit docs/bundles.json`,
    );
    failed += 1;
  } else if (!write) {
    console.log(`ok   ${name}: ${unique[0]}`);
  }
}

if (write) {
  if (Object.keys(detected).length !== Object.keys(pages).length) {
    console.error("FAIL --write needs both pages to serve exactly one bundle each");
    process.exitCode = 1;
  } else {
    writeFileSync(RECORD, `${JSON.stringify({ ...recorded, ...detected }, null, 2)}\n`);
    console.log(`wrote ${RECORD}: ${JSON.stringify(detected)}`);
  }
} else if (failed > 0) {
  console.error(`deployed bundles: ${failed} mismatch(es)`);
  process.exitCode = 1;
} else {
  console.log("deployed bundles match the record");
}
