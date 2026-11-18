#!/usr/bin/env node
/**
 * Stamp a build with the hash of what it was built from.
 *
 * Called at the end of a build (each example's and each fixture's `build` script), so it can only be
 * written by something that actually produced the output. The gates read it; nothing else writes it.
 *
 * Usage: `node scripts/stamp-dist.mjs <kind>` — `kind` is an example's directory name, or
 * `tutorial` / `readme` for a fixture built from a document.
 */
import { existsSync } from "node:fs";

import { distFor, writeStamp } from "./lib/build-stamp.mjs";

const root = new URL("..", import.meta.url).pathname;
const kind = process.argv[2];

if (kind === undefined) {
  console.error("usage: node scripts/stamp-dist.mjs <kind>");
  process.exit(2);
}

const dist = distFor(kind, root);

// A stamp next to nothing is worse than no stamp: it would claim a build that is not there.
if (!existsSync(dist)) {
  console.error(`stamp-dist: no build at ${dist} — is ${kind} a kind that produces one?`);
  process.exit(1);
}

const { hash, files } = writeStamp(kind, root, dist);
console.log(`stamped ${kind}: ${files} input file(s), ${hash.slice(0, 12)}`);
