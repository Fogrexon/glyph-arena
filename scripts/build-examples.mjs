#!/usr/bin/env node
/**
 * Build every example that declares a page, with the base path its own declaration implies.
 *
 * The workflow used to carry one `pnpm --filter … build` line per example, each with its own
 * `PARRY_BASE` / `RUNNER_BASE` / `CAMP_BASE` variable. Three lists that have to agree — the filter,
 * the variable name, and the published path — and the day a fourth example was added, only two of
 * them were updated: CAMP was built, published, and linked from nowhere.
 *
 * So the declaration is the only list. `glyphArenaPage.path` says where the site puts the bundle,
 * so it also says what `base` vite needs: `/glyph-arena/` + path. Every example's vite config reads
 * `GLYPH_BASE`, which is this script's whole job.
 *
 * Usage: `node scripts/build-examples.mjs` (from the repository root, after `pnpm install`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { SITE_BASE, publishedExamples } from "./assemble-site.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const EXAMPLES = `${ROOT}examples`;

const examples = publishedExamples(EXAMPLES);

for (const example of examples) {
  const base = `${SITE_BASE}${example.page.replace(/^\//, "")}`;
  console.log(`building ${example.name} → ${base}`);

  const result = spawnSync("pnpm", ["--filter", example.package, "build"], {
    cwd: ROOT,
    env: { ...process.env, GLYPH_BASE: base },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${example.name}: build failed (${result.status ?? result.signal})`);
  }

  // A filter that matches nothing exits 0 and prints a line: the build has to be checked by what
  // it produced, not by the exit code alone (this is how a page can be "built" and never appear).
  if (!existsSync(`${example.dist}/index.html`)) {
    throw new Error(`${example.name}: built without producing ${example.dist}/index.html`);
  }
}
