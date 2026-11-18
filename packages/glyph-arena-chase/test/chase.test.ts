import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chaseTarget } from "../src/index.js";

/** A pursuer standing at x=100, 24 px wide. Both games' boxes are 20–24 px. */
const SELF = { x: 100, w: 24, dir: -1 as const };

/** The runner's sight, spelled out here so the package owns none of it. */
const CONFIG = { sightPx: 224, stepTolerancePx: 32 };

/** Only the centre of the target matters, so this builds one at a centre distance. */
const targetAtCentreDistance = (distancePx: number) => ({
  x: SELF.x + SELF.w / 2 + distancePx - 10,
  w: 20,
});

const flat = () => 0;

describe("C1 noticed at the sight boundary (px: sightPx exactly, then +0.01)", () => {
  it("notices at exactly sightPx, on both sides", () => {
    for (const distancePx of [224, -224]) {
      const result = chaseTarget(SELF, targetAtCentreDistance(distancePx), CONFIG, flat);

      assert.equal(result.noticed, true, `${distancePx} px is inside ${CONFIG.sightPx} px`);
      assert.equal(Math.abs(result.distancePx - distancePx) < 1e-9, true, "the distance is the one asked for");
    }
  });

  it("does not notice one hundredth of a pixel beyond sightPx", () => {
    for (const distancePx of [224.01, -224.01]) {
      assert.equal(chaseTarget(SELF, targetAtCentreDistance(distancePx), CONFIG, flat).noticed, false);
    }
  });
});

describe("C2 dir follows the target, and holds when the centres coincide", () => {
  it("is -1 to the left and +1 to the right", () => {
    assert.equal(chaseTarget(SELF, targetAtCentreDistance(-40), CONFIG, flat).dir, -1);
    assert.equal(chaseTarget(SELF, targetAtCentreDistance(40), CONFIG, flat).dir, 1);
  });

  it("keeps the current dir when the distance is exactly 0 px", () => {
    const left = chaseTarget({ ...SELF, dir: -1 }, targetAtCentreDistance(0), CONFIG, flat);
    const right = chaseTarget({ ...SELF, dir: 1 }, targetAtCentreDistance(0), CONFIG, flat);

    assert.equal(left.dir, -1);
    assert.equal(right.dir, 1);
    assert.equal(left.distancePx, 0);
  });
});

describe("C3 distance is centre to centre (self 24 wide, target 20 wide)", () => {
  it("measures 58 px where left edges would say 60", () => {
    const result = chaseTarget({ x: 100, w: 24, dir: 1 }, { x: 160, w: 20 }, CONFIG, flat);

    assert.equal(result.distancePx, 58);
  });
});

describe("C4 a hole is not floor (px: Infinity, -Infinity, NaN)", () => {
  for (const step of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
    it(`is not walkable over ${String(step)}, but still noticed`, () => {
      const result = chaseTarget(SELF, targetAtCentreDistance(40), CONFIG, () => step);

      assert.equal(result.walkable, false);
      assert.equal(result.noticed, true);
    });
  }
});

describe("C5 the step tolerance is one number, inclusive (px: 32, 33, -32, -33)", () => {
  for (const [step, expected] of [
    [32, true],
    [33, false],
    [-32, true],
    [-33, false],
  ] as const) {
    it(`${step} px ahead is ${expected ? "" : "not "}walkable at ${CONFIG.stepTolerancePx} px`, () => {
      assert.equal(chaseTarget(SELF, targetAtCentreDistance(40), CONFIG, () => step).walkable, expected);
    });
  }
});

describe("C6 no state: the same arguments twice give the same answer", () => {
  it("returns an equal result both times", () => {
    const target = targetAtCentreDistance(40);
    const first = chaseTarget(SELF, target, CONFIG, flat);
    const second = chaseTarget(SELF, target, CONFIG, flat);

    assert.deepEqual(second, first);
  });

  it("does not mutate the boxes it was given", () => {
    const self = { ...SELF };
    const target = targetAtCentreDistance(40);

    chaseTarget(self, target, CONFIG, flat);

    assert.deepEqual(self, SELF);
    assert.deepEqual(target, targetAtCentreDistance(40));
  });
});

describe("C7 the ground is probed in the direction it will walk", () => {
  it("asks about the target's side, not the current facing", () => {
    // Facing right, target to the left: the old code probed right, then walked left.
    const asked: Array<-1 | 1> = [];
    const result = chaseTarget({ ...SELF, dir: 1 }, targetAtCentreDistance(-40), CONFIG, (dir) => {
      asked.push(dir);
      return 0;
    });

    assert.equal(result.dir, -1);
    assert.deepEqual(asked, [-1]);
  });
});
