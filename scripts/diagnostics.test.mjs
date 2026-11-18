import assert from "node:assert/strict";
import { test } from "node:test";

import { quietDiagnostic } from "./lib/diagnostics.mjs";

/** The shape GitHub's runner turns into an `##[error]` annotation. */
const ANNOTATED = /^\s*.+?\(\d+,\d+\):\s*(?:error|warning)\s+\w+:/;

test("a tsc diagnostic loses its position, so CI stops annotating the line", () => {
  // The line the P6 wait actually printed on 2026-11-18, from `main`'s CI log.
  const raw =
    `tutorial.ts(11,3): error TS2305: Module '"@fogrexon/glyph-arena"' has no exported member 'tagIn'.`;
  const quiet = quietDiagnostic(raw);

  assert.equal(
    quiet,
    `tutorial.ts: TS2305: Module '"@fogrexon/glyph-arena"' has no exported member 'tagIn'.`,
  );
  assert.equal(ANNOTATED.test(raw), true, "the raw line is the shape the runner annotates");
  assert.equal(ANNOTATED.test(quiet), false, "the quiet line must not match it");
});

test("keeps the file, the code and the message — only the position goes", () => {
  const quiet = quietDiagnostic(`packages/x/src/index.ts(3,9): error TS1005: ';' expected.`);

  assert.match(quiet, /packages\/x\/src\/index\.ts: TS1005: ';' expected\.$/);
});

test("leaves a line that is not a diagnostic alone", () => {
  for (const line of [
    "PEND P6: npm serves @fogrexon/glyph-arena@0.4.0, which cannot run the documents on main",
    "tutorial.ts: TS2305: already quiet",
    "",
  ]) {
    assert.equal(quietDiagnostic(line), line);
  }
});

test("handles a Windows path, where the drive colon comes first", () => {
  const quiet = quietDiagnostic(`C:\\work\\tutorial.ts(11,3): error TS2305: nope.`);

  assert.equal(quiet, `C:\\work\\tutorial.ts: TS2305: nope.`);
});
