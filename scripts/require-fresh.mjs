#!/usr/bin/env node
/**
 * Gate-side CLI for `lib/build-stamp.mjs`: refuse to read a build that is older than its sources.
 *
 * For the gates whose "run" is a `tsc` invocation in a `package.json` script (`check:readme-example`,
 * `typecheck:public-api`), this is the whole integration: put it first in the script line.
 *
 * Usage:
 *   node scripts/require-fresh.mjs package:glyph-arena   # the umbrella's dist only
 *   node scripts/require-fresh.mjs --packages            # every packages/<name>/dist
 */
import { requireFresh, requireFreshPackages } from "./lib/build-stamp.mjs";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("usage: node scripts/require-fresh.mjs <kind...> | --packages");
  process.exit(2);
}

if (args.includes("--packages")) requireFreshPackages(root);

for (const kind of args.filter((arg) => arg !== "--packages")) requireFresh(kind, root);
