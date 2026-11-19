/**
 * Pickup's reset, as a gate.
 *
 * This slice had **two entry points into a round** — `beginPlayFromTitle` and `restart` — and each
 * wrote its own list of the same assignments. They had already drifted: the title path cleared
 * `paused` and the restart path did not, and only the restart path cancelled a punch tween in
 * flight. That is CAMP's missing `dodge` twice over, spread across two functions.
 *
 * So: every field the round owns is put back by a registration or named in KEPT with its reason,
 * and both paths run the same reset. A third path that starts a round without it is a red gate.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${ROOT}examples/pickup-demo/src/main.ts`, "utf8");

/** `let`s at the slice's own scope: module scope and the top of `main()`. */
function runScopedState() {
  return [...source.matchAll(/^( {0,2})let\s+(\w+)/gm)].map((match) => match[2]);
}

/** The registrations: from `createReset()` up to the first function after them. */
function resetRegion() {
  const start = source.indexOf("const reset = createReset();");
  assert.ok(start >= 0, "pickup no longer registers its resets with createReset");
  const rest = source.slice(start);
  const next = /\n\s*function /.exec(rest);
  assert.ok(next !== null, "the registrations are not followed by a function");
  return rest.slice(0, next.index);
}

const KEPT = {
  touch: "the touch device",
  playerImage: "an asset",
  gemImage: "an asset",
  wallImage: "an asset",
  pickupBuffer: "the decoded pickup sound: an asset, not a round",
  titleRoot: "the title screen's subtree",
  playRoot: "the play screen's subtree, rebuilt by createPlaySubtree()",
  fieldNode: "the field's node, destroyed and rebuilt by restart()",
  playerDrawable: "the player's drawable, rebuilt by the teardown/rebuild in restart()",
  playerEntity: "the player's entity, same",
  phase: 'set by both callers: title start and restart both end in `phase = "play"`',
  wallDrawables: "rebuilt by createFieldContent()",
  hazardDrawables: "rebuilt by createFieldContent()",
  layoutIndex: "advanced on purpose: the three layouts cycle by restart count",
  itemSpawns: "rebuilt by applyLayout()",
  hazardSpawnList: "rebuilt by applyLayout()",
  hazardVelocityList: "rebuilt by applyLayout()",
  punchXHandle: "cancelled by cancelPickupPunchTweens(), which the reset calls",
  punchYHandle: "cancelled by cancelPickupPunchTweens(), which the reset calls",
  audioResumed: "whether the browser's audio was unlocked: not per round",
  bestClearSeconds: "the best time, kept across rounds on purpose — it is the NEW BEST line",
  lastClearSeconds: "cleared by armRoundTimer(), which the reset calls",
  lastClearWasBest: "cleared by armRoundTimer(), which the reset calls",
  roundRemaining: "cleared by armRoundTimer(), which the reset calls",
  roundStartedAt: "cleared by armRoundTimer(), which the reset calls",
  roundTimerHandle: "cleared by armRoundTimer(), which the reset calls",
  invulnerableUntil: "cleared by clearInvulnerability(), which the reset calls",
  invulnerabilityTimerHandle: "cleared by clearInvulnerability(), which the reset calls",
  scheduleSeconds: "the session's own clock; a round is measured from roundStartedAt",
  pickupSeHandle: "a sound handle, not round state",
  lastPublishedX: "what the harness was last told, so it can be told again",
  lastPublishedY: "same",
  lastPublishedDelta: "same",
};

test("every field a round owns is put back by the reset", () => {
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

test("both ways into a round run the same reset", () => {
  // The two functions that start a round, and they must not hand-write the field list again.
  for (const name of ["beginPlayFromTitle", "restart"]) {
    const body = new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n  \\}`).exec(source)?.[1] ?? "";
    assert.ok(body.length > 0, `no body found for ${name}()`);
    assert.match(body, /reset\.run\(\);/, `${name}() starts a round without running the reset`);
    for (const field of ["score", "lives", "cleared", "failed", "paused", "dashUntil", "baseZoom", "baseRotation"]) {
      assert.doesNotMatch(
        body,
        new RegExp(`^\\s*${field}\\s*=`, "m"),
        `${name}() assigns \`${field}\` itself again — that list is what drifted last time`,
      );
    }
  }
});
