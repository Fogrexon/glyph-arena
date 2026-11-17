import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approach } from "../src/index.js";

/**
 * The idiom every game in this repository wrote by hand: close a fraction of the gap, and never
 * more than all of it. `approach` exists so the next game copies this call, not the two lines.
 */
function handWrittenIdiom(current: number, aim: number, dt: number): number {
  return current + (aim - current) * Math.min(1, dt * 8);
}

const near = (actual: number, expected: number, message: string): void => {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, got ${actual}`,
  );
};

describe("approach", () => {
  it("matches the hand-written min(1, dt * rate) idiom", () => {
    const currents = [-100, 0, 37.5, 900, 1536];
    const aims = [-400, 0, 120, 2400];
    const steps = [0.0001, 1 / 120, 1 / 60, 1 / 30, 0.25, 1];

    for (const current of currents) {
      for (const aim of aims) {
        for (const dt of steps) {
          near(
            approach(current, aim, dt),
            handWrittenIdiom(current, aim, dt),
            `from ${current} to ${aim} in ${dt}s`,
          );
        }
      }
    }
  });

  it("never overshoots an aim it cannot reach in one frame", () => {
    const afterStall = approach(0, 1000, 10);

    near(afterStall, 1000, "a 10 s frame closes the whole gap");
    assert.ok(approach(990, 1000, 10) <= 1000, "the value must not pass the aim");
  });

  it("does not move on a zero, negative, or unusable frame", () => {
    for (const dt of [0, -1 / 60, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(approach(250, 2000, dt), 250, `dt ${dt} must leave the value alone`);
    }
  });

  it("closes the gap monotonically and settles", () => {
    let value = 0;
    let previousGap = Number.POSITIVE_INFINITY;

    for (let frame = 0; frame < 120; frame += 1) {
      value = approach(value, 2400, 1 / 60);
      const gap = Math.abs(2400 - value);

      assert.ok(gap <= previousGap, `frame ${frame} went backwards`);
      previousGap = gap;
    }

    // 120 frames at step 8/60 leave 2400 * (1 - 8/60)^120 = 8.4e-5 of the gap: "settled" here
    // means under a thousandth of a pixel, not zero, and the test says which.
    assert.ok(previousGap < 1e-3, `two seconds should settle, gap was ${previousGap}`);
  });

  it("follows a moving aim without lagging behind forever", () => {
    // A target moving 320 px/s, sampled once per frame: the steady-state lag of a discrete chase
    // is `velocity * (1 - step) / rate`, not `velocity / rate`. Derived from the recurrence
    // `c' = c + (aim - c) * step`, with `step = dt * rate` — the arithmetic below is that
    // derivation, so a change to the step rule moves the expected value with it.
    const step = (1 / 60) * 8;
    const lastAim = 320 * (239 / 60);
    let value = 0;

    for (let frame = 0; frame < 240; frame += 1) {
      value = approach(value, 320 * (frame / 60), 1 / 60);
    }

    near(value, lastAim - (320 * (1 - step)) / 8, "steady-state lag of a discrete chase");
  });

  it("holds still when the rate is zero or negative", () => {
    for (const rate of [0, -8]) {
      assert.equal(
        approach(120, 2000, 1 / 60, { rate }),
        120,
        `rate ${rate} must not move the value`,
      );
    }
  });
});
