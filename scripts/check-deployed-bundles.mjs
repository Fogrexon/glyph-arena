#!/usr/bin/env node
/**
 * P6: compare the bundles the site is actually serving with the recorded ones.
 *
 *   pnpm check:deployed                # detect drift, exit 1 on a mismatch
 *   pnpm check:deployed --write        # record what is being served (after a deploy)
 *   pnpm check:deployed --write --pr   # ...and take the record to main through a PR
 *   pnpm check:deployed --pr --dry-run # print the API plan, touch nothing
 *
 * The record has to be written **after** the deploy: a local build cannot know
 * Pages' `--base`, so the local hash never equals the published one.
 *
 * `--pr` exists because `main` is protected (PR required, `verify` required,
 * admins included) and this container has no git credentials — so the record
 * cannot be committed from here by hand, and doing it by hand is what let a
 * dropped file 404 `/runner/` for half an hour. It needs `GITHUB_TOKEN`; without
 * one it says so instead of half-doing the job. The waiting, the file-count
 * assertion and the read-back of `main` are in `./lib/record-pr.mjs`.
 *
 * Deliberately not a CI step: it reads the public site over the network, so a
 * flaky connection would fail a pull request for the wrong reason.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { openRecordPr, planRecordPr, RecordPrError } from "./lib/record-pr.mjs";

const ROOT = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");
const RECORD = join(ROOT, "docs", "bundles.json");
const BASE = process.env.GLYPH_ARENA_BASE ?? "https://fogrexon.github.io/glyph-arena";

const pages = { root: `${BASE}/`, parry: `${BASE}/parry/`, runner: `${BASE}/runner/` };
const recorded = JSON.parse(readFileSync(RECORD, "utf8"));
const write = process.argv.includes("--write");
const pr = process.argv.includes("--pr");
const dryRun = process.argv.includes("--dry-run");
const argValue = (name) => {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};
const repo = argValue("--repo") ?? process.env.GITHUB_REPO ?? "Fogrexon/glyph-arena";
const detected = {};
let failed = 0;

for (const [name, url] of Object.entries(pages)) {
  // Cache-buster: otherwise the CDN in front of Pages can serve the previous
  // release for a while and this check reports a name that no longer exists.
  const expected = recorded[name];
  const response = await fetch(`${url}?cb=${Date.now()}`);
  if (!response.ok) {
    // A page that is not deployed yet is recorded as null; that is not drift.
    if (expected === null && response.status === 404) {
      // Not deployed yet is a legitimate state for the record, so --write keeps
      // the null instead of refusing the whole run: a partially deployed site
      // is exactly when the record needs writing.
      detected[name] = null;
      if (!write) console.log(`ok   ${name}: not deployed yet (recorded null)`);
      continue;
    }
    console.error(`FAIL ${name}: ${url} returned ${response.status}`);
    failed += 1;
    continue;
  }

  const html = await response.text();
  const unique = [...new Set([...html.matchAll(/index-[A-Za-z0-9_-]+\.js/g)].map((m) => m[0]))];

  if (unique.length !== 1) {
    console.error(`FAIL ${name}: expected exactly one index-*.js, found ${unique.length}${unique.length ? ` (${unique.join(", ")})` : ""}`);
    failed += 1;
    continue;
  }

  if (expected === null && !write) {
    console.error(`FAIL ${name}: serving ${unique[0]} but the record is null — run \`pnpm check:deployed --write\` and commit docs/bundles.json`);
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
    console.error("FAIL --write needs every page to serve exactly one bundle each");
    process.exitCode = 1;
  } else if (dryRun) {
    // A dry run must not leave a modified file behind either.
    console.log(`--dry-run: would write ${RECORD}: ${JSON.stringify(detected)}`);
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

if (pr && process.exitCode !== 1) {
  const changed = Object.entries(detected).some(([name, name0]) => recorded[name] !== name0);
  const branch = `chore/record-bundles-${Math.floor(Date.now() / 1000)}`;
  if (!changed) {
    console.log("--pr: the record already matches what is served, nothing to open a PR for");
  } else if (dryRun) {
    console.log(`--pr --dry-run: would record ${JSON.stringify(detected)} on ${branch} in ${repo}`);
    for (const line of planRecordPr({ repo, branch })) console.log(`  ${line}`);
  } else {
    const content = readFileSync(RECORD, "utf8");
    try {
      const result = await openRecordPr({
        token: process.env.GITHUB_TOKEN,
        repo,
        content,
        branch,
        title: `chore(p6): record the deployed bundles (${detected.root ? "root" : ""} ${Object.values(detected).join(", ")})`,
        body:
          "Written by `pnpm check:deployed --write --pr` from what the site is actually serving.\n\n" +
          "Recorded: `" + JSON.stringify(detected) + "`",
      });
      // The PR said it touched the file; main has to actually have it.
      const landed = await fetch(`https://raw.githubusercontent.com/${repo}/${result.main}/docs/bundles.json`);
      if (!landed.ok) throw new RecordPrError(`main ${result.main.slice(0, 8)} has no docs/bundles.json (${landed.status})`);
      const onMain = await landed.text();
      if (onMain.replace(/\s+/g, "") !== content.replace(/\s+/g, "")) {
        throw new RecordPrError(`docs/bundles.json on main ${result.main.slice(0, 8)} is not what this PR sent`);
      }
      console.log(`ok   --pr: #${result.number} merged, main ${result.main.slice(0, 8)}, docs/bundles.json verified on main`);
    } catch (error) {
      console.error(`FAIL --pr: ${error instanceof RecordPrError ? error.message : error.stack}`);
      process.exitCode = 1;
    }
  }
}
