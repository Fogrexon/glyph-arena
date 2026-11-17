import assert from "node:assert/strict";
import { test } from "node:test";

import { bestLine, bestOf, comparisonLine, isImprovement, isNewBest, type RunSummary } from "../src/history.ts";

function run(parried: number, absoluteMs: number, wave = 7, lives = 2, seconds = 20, cleared = false): RunSummary {
  return { parried, absoluteMs, wave, lives, seconds, cleared };
}

function clear(parried: number, absoluteMs: number, lives: number, seconds: number): RunSummary {
  return run(parried, absoluteMs, 20, lives, seconds, true);
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

test("the best of a session keeps each record on its own", () => {
  const runs = [run(3, 120, 9, 1, 18), clear(2, 140, 3, 31.4), clear(5, 90, 1, 27.1)];
  const best = bestOf(runs);
  assert.deepEqual(best, { parried: 5, lives: 3, clearSeconds: 27.1 });
});

test("a session with no clear still has a best, and says so", () => {
  const best = bestOf([run(4, 100, 12, 2, 22)]);
  assert.deepEqual(best, { parried: 4, lives: 2, clearSeconds: null });
  assert.equal(bestLine(best), "Best: 4 parries, 2 lives");
});

test("bestOf of nothing is null and prints an em dash", () => {
  assert.equal(bestOf([]), null);
  assert.equal(bestLine(null), "Best: \u2014");
});

test("the first run sets the best without calling it a new best", () => {
  const first = bestOf([run(2, 120)]);
  assert.equal(isNewBest(first, null), false);
});

test("a later run that moves any record is a new best", () => {
  const first = bestOf([run(2, 120, 7, 2, 20)]);
  assert.equal(isNewBest(bestOf([run(2, 120, 7, 2, 20), run(3, 130, 7, 2, 21)]), first), true);
  assert.equal(isNewBest(bestOf([run(2, 120, 7, 2, 20), run(2, 130, 7, 3, 21)]), first), true);
  assert.equal(isNewBest(bestOf([run(2, 120, 7, 2, 20), run(1, 90, 7, 1, 19)]), first), false);
});

test("a faster clear is a new best, a slower one is not", () => {
  const first = bestOf([clear(6, 70, 1, 30)]);
  assert.equal(isNewBest(bestOf([clear(6, 70, 1, 30), clear(6, 80, 1, 28.5)]), first), true);
  assert.equal(isNewBest(bestOf([clear(6, 70, 1, 30), clear(6, 60, 1, 31)]), first), false);
});
