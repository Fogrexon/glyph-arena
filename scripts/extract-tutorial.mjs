#!/usr/bin/env node
/**
 * Write `fixtures/tutorial/main.ts` from the tutorial's "The whole file" block.
 *
 * The fixture is a real pnpm workspace package, so `pnpm -r typecheck` and `pnpm -r build` compile
 * and bundle it with no extra workflow step. This script is what those two scripts run first: the
 * only file that is compiled is the one extracted from the docs, so the docs cannot describe a
 * program that does not compile.
 *
 * It is deliberately quiet and idempotent — the same docs in, the same bytes out — because it runs
 * twice per CI run (typecheck, then build) and a timestamp or a "wrote" line would make the two
 * steps look different when nothing changed.
 *
 * Usage: `node scripts/extract-tutorial.mjs` (also `pnpm tutorial:extract`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { wholeFileProgram } from "./lib/tutorial.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DOCS = join(ROOT, "docs", "tutorial.md");
const TARGET = join(ROOT, "fixtures", "tutorial", "main.ts");

const { code, line } = wholeFileProgram(readFileSync(DOCS, "utf8"), "docs/tutorial.md");
const program = `${code}\n`;

let current = null;
try {
  current = readFileSync(TARGET, "utf8");
} catch {
  // first run: there is no generated file yet
}

if (current !== program) writeFileSync(TARGET, program);

console.log(`fixtures/tutorial/main.ts ← docs/tutorial.md:${line} (${code.split("\n").length} lines)`);
