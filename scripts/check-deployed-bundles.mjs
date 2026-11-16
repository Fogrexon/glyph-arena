#!/usr/bin/env node
/**
 * P6: compare the bundles the site is actually serving with the recorded ones.
 *
 * The published bundle name changes whenever `examples/<demo>/src` changes, and the
 * number of times a "current" name lived in someone's head today was four. This
 * reads the two entry points and compares them against `docs/bundles.json`.
 *
 *   pnpm check:deployed
 *
 * A mismatch is not always a failure of the deploy: it means the record is
 * stale. Update `docs/bundles.json` **in the same PR that touches
 * `examples/pickup-demo/src` or `examples/parry/src`** — then the next person
 * sees "changed, recorded" instead of "changed, unknown".
 *
 * Deliberately not a CI step: it reads the public site over the network, so a
 * flaky connection would fail a pull request for the wrong reason.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const RECORD = join(ROOT, "docs", "bundles.json");
const BASE = process.env.GLYPH_ARENA_BASE ?? "https://fogrexon.github.io/glyph-arena";

const pages = { root: `${BASE}/`, parry: `${BASE}/parry/` };
const recorded = JSON.parse(readFileSync(RECORD, "utf8"));
let failed = 0;

for (const [name, url] of Object.entries(pages)) {
  // Cache-buster: the CDN in front of Pages serves the previous release for a
  // while otherwise, and then this check reports a name that no longer exists.
  const response = await fetch(`${url}?cb=${Date.now()}`);
  if (!response.ok) {
    console.error(`FAIL ${name}: ${url} returned ${response.status}`);
    failed += 1;
    continue;
  }
  const html = await response.text();
  const found = [...html.matchAll(/index-[A-Za-z0-9_-]+\.js/g)].map((match) => match[0]);
  const unique = [...new Set(found)];
  const expected = recorded[name];

  if (unique.length === 0) {
    console.error(`FAIL ${name}: no index-*.js in the page (expected ${expected})`);
    failed += 1;
  } else if (unique.length > 1) {
    console.error(`FAIL ${name}: more than one bundle referenced: ${unique.join(", ")}`);
    failed += 1;
  } else if (unique[0] !== expected) {
    console.error(
      `FAIL ${name}: serving ${unique[0]}, recorded ${expected}` +
        ` — if examples/${name === "root" ? "pickup-demo" : "parry"}/src changed, update docs/bundles.json in the same PR`,
    );
    failed += 1;
  } else {
    console.log(`ok   ${name}: ${unique[0]}`);
  }
}

if (failed > 0) {
  console.error(`deployed bundles: ${failed} mismatch(es)`);
  process.exitCode = 1;
} else {
  console.log("deployed bundles match the record");
}
