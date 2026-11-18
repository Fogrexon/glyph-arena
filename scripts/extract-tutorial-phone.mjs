#!/usr/bin/env node
/**
 * Write `fixtures/tutorial/phone-pad.ts` from the tutorial's `On a phone` zone block.
 *
 * The phone section is four snippets that get spliced into the program above — three of them are
 * inserts into code that already exists, so they cannot be concatenated into a program. The fourth
 * (`createTouchControls`) *is* self-contained, and it is the one that carries the arithmetic that
 * went wrong: three 120 px squares plus margins need 432 px, so on a 390 px phone the right zone and
 * the jump zone overlapped by 30 px and a thumb there walked and jumped at once.
 *
 * So this takes that one block verbatim, appends the single line that exports `buildPad`, and the
 * browser gate probes the zones at 360 / 390 / 414 / 432 px. The harness line is marked, because it
 * is the only thing in the file the tutorial does not say.
 *
 * Usage: `node scripts/extract-tutorial-phone.mjs` (also `pnpm tutorial:extract`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { tutorialPadBlock } from "./lib/tutorial.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DOCS = join(ROOT, "docs", "tutorial.md");
const TARGET = join(ROOT, "fixtures", "tutorial", "phone-pad.ts");

const block = tutorialPadBlock(readFileSync(DOCS, "utf8"), "docs/tutorial.md");

const program = `${block.code}

// harness: the fixture exports it so the browser gate can probe the zones at several widths.
export { buildPad };
`;

let current = null;
try {
  current = readFileSync(TARGET, "utf8");
} catch {
  // first run: there is no generated file yet
}
if (current !== program) writeFileSync(TARGET, program);

console.log(`fixtures/tutorial/phone-pad.ts ← docs/tutorial.md:${block.line} (${block.code.split("\n").length} lines)`);
