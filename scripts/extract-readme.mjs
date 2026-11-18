#!/usr/bin/env node
/**
 * Write `fixtures/readme/main.ts` from the umbrella `README.md`'s only `ts` block.
 *
 * That block is the first thing a reader sees on npm, and it is the one document that **freezes
 * inside the tarball until the next version**: `check:readme` only ever proved the module names are
 * listed and that `draw.rect` / `draw.text` appear somewhere. A block that does not compile would
 * ship, and nobody could fix it until the next release.
 *
 * So the block is the source and the compiled file is derived from it, exactly like the tutorial's
 * (`scripts/lib/markdown-program.mjs` is the shared extractor). `packages/glyph-arena/dist` is what
 * the tarball carries, so the published-surface check compiles this file against those emitted
 * declarations rather than the workspace sources.
 *
 * Usage: `node scripts/extract-readme.mjs` (also `pnpm readme:extract`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { singleProgram } from "./lib/markdown-program.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const SOURCE = "packages/glyph-arena/README.md";
const README = join(ROOT, "packages", "glyph-arena", "README.md");
const TARGET = join(ROOT, "fixtures", "readme", "main.ts");

const { code, line } = singleProgram(readFileSync(README, "utf8"), { source: SOURCE });
const program = `${code}\n`;

let current = null;
try {
  current = readFileSync(TARGET, "utf8");
} catch {
  // first run: there is no generated file yet
}

if (current !== program) writeFileSync(TARGET, program);

console.log(`fixtures/readme/main.ts ← ${SOURCE}:${line} (${code.split("\n").length} lines)`);
