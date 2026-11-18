#!/usr/bin/env node
/**
 * Write every program `fixtures/tutorial` compiles, out of `docs/tutorial.md`.
 *
 * The fixture is a real pnpm workspace package, so `pnpm -r typecheck` and `pnpm -r build` compile
 * and bundle these with no extra workflow step. This script is what those two run first: the only
 * files compiled are the ones extracted from the docs, so the tutorial cannot describe a program
 * that does not compile.
 *
 * One script for all three, because a per-file list here would be the fourth place to remember when
 * a program is added — and the visible failure of forgetting is a green build that never compiled
 * the new block.
 *
 *   main.ts        the desktop program (`## The whole file`) — what a reader copies first
 *   phone-pad.ts   the same phone program plus one harness line — the browser gate probes the pad
 *                  it builds at 360/390/414/432 px (the program itself stays verbatim, so the file
 *                  the gate runs is the file a reader copies)
 *   phone-whole.ts the phone program (`## The whole file, on a phone`) — the same game driven by a
 *                  pad, the only way `fitToWindow`'s resize hook, `measureCanvas` and
 *                  `toCanvasPoint` get compiled and run instead of merely described
 *
 * It is deliberately quiet and idempotent — the same docs in, the same bytes out — because it runs
 * twice per CI run (typecheck, then build) and a timestamp or a "wrote" line would make the two
 * steps look different when nothing changed.
 *
 * Usage: `node scripts/extract-tutorials.mjs` (also `pnpm tutorial:extract`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { phonePair } from "./lib/tutorial.mjs";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "..");
const DOCS = join(ROOT, "docs", "tutorial.md");
const FIXTURE = join(ROOT, "fixtures", "tutorial");

const markdown = readFileSync(DOCS, "utf8");

// Extracts both whole files and enforces what makes them one program: balanced `phone-begin/end`
// markers and no more than MAX_SEGMENTS of them. The outside must match too, but that is an
// assertion in `test:scripts` (a check that fails, not a script that refuses to write).
const pair = phonePair(markdown, "docs/tutorial.md");

/** The harness line is the one thing in `phone-pad.ts` the tutorial does not say, so it says so. */
const PAD_HARNESS =
  "\n// harness: the fixture exports it so the browser gate can probe the zones at several widths.\nexport { buildPad };\n";

const targets = [
  {
    file: "main.ts",
    note: "the whole file",
    build: () => ({ code: `${pair.desktop.code}\n`, line: pair.desktop.line, lines: pair.desktop.code.split("\n").length }),
  },
  {
    file: "phone-pad.ts",
    note: "the pad",
    build: () => ({
      code: `${pair.phone.code}\n${PAD_HARNESS}`,
      line: pair.phone.line,
      lines: pair.phone.code.split("\n").length,
    }),
  },
  {
    file: "phone-whole.ts",
    note: "the whole file, on a phone",
    build: () => ({ code: `${pair.phone.code}\n`, line: pair.phone.line, lines: pair.phone.code.split("\n").length }),
  },
];

const report = [];

for (const target of targets) {
  const { code, line, lines } = target.build();
  const path = join(FIXTURE, target.file);

  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    // first run: there is no generated file yet
  }

  if (current !== code) writeFileSync(path, code);
  report.push(`fixtures/tutorial/${target.file} ← docs/tutorial.md:${line} ${target.note} (${lines} lines)`);
}

console.log(report.join("\n"));
