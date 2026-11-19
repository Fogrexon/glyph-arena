/**
 * One scanner, four gates — and the scanner has tests of its own.
 *
 * `march`, `parry`, `pickup` and `runner` each keep a `*-reset.test.mjs` that answers the same two
 * questions: *is every field a run owns put back by the registrations?* and *are the fields the
 * reset deliberately keeps still kept?* Everything except the answer is the same, so it lives here.
 * A seventh slice's gate is a KEPT list, two calls, and whatever is specific to that game — five
 * lines and no chance of writing a slightly different scanner.
 *
 * **Why this module has tests** (it is the one thing the four gates trust): a scanner that returns
 * "nothing missing" for *every* input turns all four gates green forever and is indistinguishable
 * from a correct one in the logs. So `scripts/reset-audit.test.mjs` feeds it fixtures that must be
 * red, including the one that matters most here: `x === 1` in the registrations is a comparison,
 * not a reset, and must not count as putting `x` back.
 *
 * **The blind spot, named rather than discovered later.** This walks `let`s. A `const` collection
 * that a run empties (`errorSamples.length = 0`) is a field a run owns with a `const` binding, and
 * the scan cannot see it: `const` also covers assets, scene nodes and input devices, so scanning
 * them would make every list a paragraph of "not run state". A slice with one registers it by hand
 * and pins it in its own test; `pickup` and `parry` both do.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** How every slice in this repository starts its registrations. */
const HEADER = "const reset = createReset();";

/** `let`s at the slice's own scope: module scope, or the top of its `main()`. */
export function scopedLets(source) {
  return [...source.matchAll(/^( {0,2})let\s+(\w+)/gm)].map((match) => match[2]);
}

/**
 * The registrations: from `createReset()` to the first thing after them that is not one.
 *
 * Three endings are legal and all four slices use one of them: `reset.run();` (march booting at
 * module scope), a top-level `function` (parry/pickup/runner, where the old body became one call),
 * or a module-level `const`/`let`.
 */
export function resetRegion(source, label = "the slice") {
  const start = source.indexOf(HEADER);
  assert.ok(start >= 0, `${label} no longer registers its resets with createReset`);
  const rest = source.slice(start);
  const ends = [/\n\s*function /, /\nconst /, /\nlet /, /\nreset\.run\(\);/].map((pattern) => {
    const found = pattern.exec(rest);
    return found === null ? Number.POSITIVE_INFINITY : found.index;
  });
  const end = Math.min(...ends);
  assert.ok(Number.isFinite(end), `${label}: the registrations run to the end of the file`);
  return rest.slice(0, end);
}

/** The three ways a slice puts a field back: assignment, emptying a collection, clearing a map. */
export function resetsField(region, name) {
  return (
    new RegExp(`\\b${name}\\s*=(?!=)`).test(region) ||
    new RegExp(`\\b${name}\\.length\\s*=\\s*0\\b`).test(region) ||
    new RegExp(`\\b${name}\\.(?:clear|splice)\\(`).test(region)
  );
}

/**
 * The fields that are neither put back nor named as kept.
 *
 * `(?!=)` is load-bearing: without it `x === 1` reads as an assignment and a comparison that happens
 * to mention a field counts as resetting it.
 */
export function missingFields(state, region, kept = {}) {
  return state.filter((name) => {
    if (name in kept) return false;
    return !resetsField(region, name);
  });
}

/**
 * Read one slice and answer both questions about it.
 *
 * ```js
 * const audit = auditReset(`${ROOT}examples/parry/src/main.ts`, KEPT);
 * test("every field a run owns is put back by the reset", () => audit.coversAll());
 * test("the fields the reset keeps are the ones this file names", () => audit.keepsKept());
 * ```
 */
export function auditReset(path, kept = {}) {
  return auditSource(readFileSync(path, "utf8"), kept, path);
}

/** The same audit over text — so the scanner can be given a fixture in its own tests. */
export function auditSource(source, kept = {}, label = "the slice") {
  const state = scopedLets(source);
  const region = resetRegion(source, label);
  const missed = missingFields(state, region, kept);
  return {
    source,
    state,
    region,
    missed,
    /** Every field a run owns is assigned inside the registrations. */
    coversAll() {
      assert.deepEqual(missed, [], `the reset does not put back: ${missed.join(", ")}`);
    },
    /**
     * Every name in KEPT is really declared, and really is kept. Both directions: a field that is
     * kept by exception and then also reset is an exception that stopped being true, and it hides
     * the next one.
     */
    keepsKept() {
      for (const name of Object.keys(kept)) {
        assert.ok(state.includes(name), `KEPT names \`${name}\`, which is not state this file declares`);
        assert.doesNotMatch(
          region,
          new RegExp(`\\b${name}\\s*=(?!=)`),
          `KEPT says \`${name}\` is kept, but the reset assigns it`,
        );
      }
    },
  };
}
