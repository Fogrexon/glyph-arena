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

const ROOT = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${ROOT}examples/march/src/main.ts`, "utf8");

/** The fields a run owns: module-scope `let`s. A `const` cannot go stale. */
function runScopedState() {
  return [...source.matchAll(/^let\s+(\w+)/gm)].map((match) => match[1]);
}

/** Everything between `createReset()` and the first `reset.run()` — the registrations. */
function resetRegion() {
  const start = source.indexOf("const reset = createReset();");
  assert.ok(start >= 0, "main.ts no longer registers its resets with createReset");
  const end = source.indexOf("reset.run();", start);
  assert.ok(end > start, "no `reset.run()` after the registrations");
  return source.slice(start, end);
}

/**
 * The two fields a run does not own. Each one has to be written here with its reason, so making a
 * third exception is a decision somebody made rather than a name that quietly joined a list.
 */
const KEPT = {
  lastRunMs: "the previous run's time, shown on the result screen",
  runs: "counts the retries, so it is incremented outside the reset",
};

test("every field a run owns is put back by the reset", () => {
  const region = resetRegion();
  const missed = [];

  for (const name of runScopedState()) {
    if (name in KEPT) continue;
    if (!new RegExp(`\\b${name}\\s*=`).test(region)) missed.push(name);
  }

  assert.deepEqual(missed, [], `the reset does not put back: ${missed.join(", ")}`);
});

test("the fields the reset keeps are the ones this file names, and they really are kept", () => {
  const region = resetRegion();
  const state = runScopedState();

  for (const name of Object.keys(KEPT)) {
    assert.ok(state.includes(name), `KEPT names \`${name}\`, which is not module-scope state`);
    // Both directions: a name that is kept by exception and then also reset is an exception that
    // stopped being true, and it hides the next one.
    assert.doesNotMatch(region, new RegExp(`\\b${name}\\s*=`), `KEPT says \`${name}\` is kept, but the reset assigns it`);
  }
});

test("boot and retry are the same path", () => {
  // Two paths is how one of them goes stale — the package's own docs say so. Boot calls `run()`
  // once, the retry path calls it once, and there is no third.
  const calls = source.match(/reset\.run\(\)/g) ?? [];
  assert.equal(calls.length, 2, `expected boot + retry to call reset.run(), found ${calls.length}`);
});
