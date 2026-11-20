/**
 * The reset a slice gets wrong is the one nobody wrote: a field is added, the line that puts it back
 * is added somewhere else — or not at all — and the miss does not throw. It leaves the last run's
 * value in place, so the second run starts mid-roll.
 *
 * CAMP had exactly that bug (`dodge` was never reset), and it was found by hand. This is the same
 * audit as a gate: it walks the module's `let`s and fails when one of them is not put back by the
 * registrations, so the next field added to this game cannot be forgotten quietly.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { auditReset } from "./reset-audit.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${ROOT}examples/march/src/main.ts`, "utf8");

/**
 * The two fields a run does not own. Each one has to be written here with its reason, so making a
 * third exception is a decision somebody made rather than a name that quietly joined a list.
 */
const KEPT = {
  lastRunMs: "the previous run's time, shown on the result screen",
  runs: "counts the retries, so it is incremented outside the reset",
  frameKeys: "the keys of the last frame, rewritten every frame before anything can read them",
};

const audit = auditReset(`${ROOT}examples/march/src/main.ts`, KEPT);

test("every field a run owns is put back by the reset", () => audit.coversAll());

test("the fields the reset keeps are the ones this file names, and they really are kept", () => audit.keepsKept());

test("boot and retry are the same path", () => {
  // Two paths is how one of them goes stale — the package's own docs say so. Boot calls `run()`
  // once, the retry path calls it once, and there is no third.
  const calls = source.match(/reset\.run\(\)/g) ?? [];
  assert.equal(calls.length, 2, `expected boot + retry to call reset.run(), found ${calls.length}`);
});
