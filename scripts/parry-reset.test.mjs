/**
 * Parry's reset, as a gate — the same audit CAMP's missing `dodge` taught, applied to the file.
 *
 * The hand-written `resetRun()` was eighteen straight assignments and it had already dropped two
 * fields: `wrapCount` (published to the harness, so a new run reported the last run's wraps) and the
 * punch (`punchX`/`punchY`, driven by a tween that was never cancelled, so a kick in flight carried
 * into the next run's first frame). Nothing threw; the second run just started wrong.
 *
 * So the file's own `let`s are the checklist: every field at the slice's scope has to be either put
 * back by a registration or named in KEPT with its reason.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${ROOT}examples/parry/src/main.ts`, "utf8");

/** The slice's scope: `let`s at the top of `main()` (two spaces) and at module scope. */
function runScopedState() {
  return [...source.matchAll(/^( {0,2})let\s+(\w+)/gm)].map((match) => match[2]);
}

function resetRegion() {
  const start = source.indexOf("const reset = createReset();");
  assert.ok(start >= 0, "parry no longer registers its resets with createReset");
  const rest = source.slice(start);
  const next = /\n\s*function /.exec(rest);
  assert.ok(next !== null, "the registrations are not followed by a function");
  return rest.slice(0, next.index);
}

/**
 * What a run does not own, each with the reason it does not. A name here is a decision; a name
 * missing from both lists is the bug this file exists to catch.
 */
const KEPT = {
  parryBuffer: "the decoded parry sound: an asset, not a run",
  titleRoot: "the title screen's subtree, rebuilt when play starts",
  playRoot: "the play screen's subtree, rebuilt by startPlay()",
  fieldNode: "the field's node, rebuilt by startPlay()",
  playerDrawable: "the player's drawable, respawned by spawnPlayer()",
  playerEntity: "the player's entity, respawned by spawnPlayer()",
  phase: "set by the caller: the title screen and the result screen both start play",
  frameId: "a frame counter, not run state",
  nextEnemyId: "the enemy-id allocator, which must not repeat an id across runs",
  shakeStrength: "only read while scheduleSeconds < shakeUntil, and `shakeUntil` is reset",
  touch: "the touch device",
  touchDashHeld: "the DASH button's latch, which is input state",
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
    assert.ok(state.includes(name), `KEPT names \`${name}\`, which is not state this file declares`);
    assert.doesNotMatch(region, new RegExp(`\\b${name}\\s*=`), `KEPT says \`${name}\` is kept, but the reset assigns it`);
  }
});

test("the two entry points into a run both go through the reset", () => {
  // `startPlay()` is the boot, the R key is the restart, and a phone's tap on the result screen is
  // the third caller of the same function. All of them reach `reset.run()`; the count is the
  // definition plus that one call.
  const calls = source.match(/reset\.run\(\)/g) ?? [];
  assert.equal(calls.length, 1, `expected the reset to be run once, in one place, found ${calls.length}`);
  assert.match(source, /function resetRun\(\): void \{\n    reset\.run\(\);\n  \}/, "resetRun is no longer a single `reset.run()`");
});
