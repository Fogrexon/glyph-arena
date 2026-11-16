import assert from "node:assert/strict";
import { test } from "node:test";

import { comparisonLine, isImprovement, type RunSummary } from "../src/history.ts";

function run(parried: number, absoluteMs: number, wave = 7): RunSummary {
  return { parried, absoluteMs, wave };
}

test("the first run is called the baseline, not compared with nothing", () => {
  assert.equal(comparisonLine(run(2, 120), undefined), "First run \u2014 this is the baseline");
  assert.equal(isImprovement(run(2, 120), undefined), false);
});

test("more parries reads as a gain", () => {
  assert.equal(comparisonLine(run(3, 140), run(2, 120)), "vs last run: +1 parry, median error +20ms");
  assert.equal(isImprovement(run(3, 140), run(2, 120)), true);
});

test("fewer parries reads as a loss, plural included", () => {
  assert.equal(comparisonLine(run(1, 90), run(3, 120)), "vs last run: -2 parries, median error -30ms");
  assert.equal(isImprovement(run(1, 90), run(3, 120)), false);
});

test("the same parries with a tighter median error is progress", () => {
  assert.equal(comparisonLine(run(2, 80), run(2, 160)), "vs last run: same parries, median error -80ms");
  assert.equal(isImprovement(run(2, 80), run(2, 160)), true);
  assert.equal(isImprovement(run(2, 200), run(2, 160)), false);
});

test("a run that parried nothing only compares the count", () => {
  assert.equal(comparisonLine(run(0, 0), run(2, 160)), "vs last run: -2 parries");
  assert.equal(comparisonLine(run(0, 0), run(0, 0)), "vs last run: same parries");
  assert.equal(isImprovement(run(0, 0), run(0, 0)), false);
});
