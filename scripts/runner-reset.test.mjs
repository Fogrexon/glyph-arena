/**
 * Runner's reset, as a gate — a smaller one than the other slices, because runner's run state is
 * almost entirely its level, and the level has always had one path (`loadLevelAt`).
 *
 * What did not have one path was the run's own clock. The title screen zeroed `simSeconds` by hand;
 * the goal screen — "run it again" — did not, so a second run started at the previous run's clock
 * and every jump in it was measured against a time that had already run out. It is the same shape as
 * CAMP's `dodge`: two ways into a run, one of them written later.
 *
 * So this gate pins the two things that fix is made of: the clock is zeroed in exactly one place
 * (and that place is inside the registrations), and both ways into a run call `reset.run()`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resetRegion } from "./reset-audit.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const source = readFileSync(`${ROOT}examples/runner/src/main.ts`, "utf8");

test("the run clock is zeroed in exactly one place, and that place is the reset", () => {
  const zeroes = [...source.matchAll(/^\s*simSeconds\s*=\s*0\s*;/gm)];
  assert.equal(zeroes.length, 1, `simSeconds is zeroed ${zeroes.length} time(s) by hand`);
  const region = resetRegion(source, "examples/runner/src/main.ts");
  assert.match(region, /^\s*simSeconds\s*=\s*0\s*;/m, "the one zeroing is not inside the registrations");
});

test("both ways into a run call the reset", () => {
  // The title screen's start and the goal screen's "run it again". A third one would be a third
  // place to go stale, so the count is part of the gate.
  const calls = source.match(/reset\.run\(\);/g) ?? [];
  assert.equal(calls.length, 2, `expected the title start and the goal restart to run the reset, found ${calls.length}`);

  // The start of each block, not a matched brace: the two branches are short and the first
  // `reset.run()` after the branch begins is the one it makes. The draw pass has branches with the
  // same condition, so the run loop's is the LAST one.
  for (const [label, marker] of [
    ["title start", 'if (phase === "title") {'],
    ["goal restart", 'if (phase === "goal") {'],
  ]) {
    const at = source.lastIndexOf(marker);
    assert.ok(at >= 0, `no \`${marker}\` in main.ts`);
    const branch = source.slice(at, source.indexOf("reset.run();", at) + 12);
    assert.ok(
      branch.length < 800,
      `the ${label} branch does not reach the reset: ${branch.slice(0, 200).replace(/\s+/g, " ")}`,
    );
  }
});

test("what the reset deliberately keeps is what the run is measured by", () => {
  // `deaths` counts the session's deaths on the HUD — it is the number the slice exists to publish,
  // so it must not be reset by a run. Pinned as an absence so that "helpfully" adding it turns red.
  const region = resetRegion(source, "examples/runner/src/main.ts");
  assert.doesNotMatch(region, /\bdeaths\s*=/, "`deaths` is the session's number; a run does not reset it");
});
