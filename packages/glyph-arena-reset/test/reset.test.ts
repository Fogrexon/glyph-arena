import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReset } from "../src/index.js";

describe("createReset", () => {
  it("R1: runs every registration in the order it was written, and returns the count", () => {
    const order: string[] = [];
    const reset = createReset();

    reset.add("player", () => order.push("player"));
    reset.add("commitClock", () => order.push("commitClock"));
    reset.add("score", () => order.push("score"));

    assert.equal(reset.run(), 3);
    assert.deepEqual(order, ["player", "commitClock", "score"]);
  });

  it("R1: an empty reset runs nothing and returns zero", () => {
    assert.equal(createReset().run(), 0);
  });

  it("R2: run(); run() leaves the state of one run — the functions are written against state, not against a count", () => {
    // A reset writes the state; it does not accumulate. Two runs must land on the same values as one.
    let hearts = 0;
    let simMs = 0;
    let lastCommitMs = 0;
    const reset = createReset();
    reset.add("hearts", () => {
      hearts = 4;
    });
    reset.add("simMs", () => {
      simMs = 0;
    });
    reset.add("commitClock", () => {
      lastCommitMs = Number.NEGATIVE_INFINITY;
    });

    reset.run();
    const once = { hearts, simMs, lastCommitMs };
    reset.run();

    assert.deepEqual({ hearts, simMs, lastCommitMs }, once);
  });

  it("R3: a duplicate name throws, and the first registration is the one that stays", () => {
    const reset = createReset();
    reset.add("hearts", () => {});

    assert.throws(() => reset.add("hearts", () => {}), /hearts.*already registered/);
    assert.equal(reset.run(), 1);
  });

  it("R4: registering from inside a run throws — the order would be undefined", () => {
    const reset = createReset();
    let thrown: unknown;
    reset.add("first", () => {
      try {
        reset.add("late", () => {});
      } catch (error) {
        thrown = error;
      }
    });

    reset.run();

    assert.match(String(thrown), /registered while run\(\) was running/);
  });

  it("R5: run() from inside a reset throws", () => {
    const reset = createReset();
    let thrown: unknown;
    reset.add("first", () => {
      try {
        reset.run();
      } catch (error) {
        thrown = error;
      }
    });

    reset.run();

    assert.match(String(thrown), /already running/);
  });

  it("R6: a failing reset stops the list and rethrows — the ones after it do not run", () => {
    const order: string[] = [];
    const reset = createReset();
    reset.add("first", () => order.push("first"));
    reset.add("second", () => {
      throw new Error("the second one broke");
    });
    reset.add("third", () => order.push("third"));

    assert.throws(() => reset.run(), /the second one broke/);
    assert.deepEqual(order, ["first"], "the third must not run behind a failure");
  });

  it("R6: a failed run leaves the reset usable — the next run is a whole run again", () => {
    // The guard flag has to come back down, or one failure turns the retry button into a crash.
    const reset = createReset();
    let explode = true;
    reset.add("sometimes", () => {
      if (explode) throw new Error("boom");
    });
    reset.add("always", () => {});

    assert.throws(() => reset.run(), /boom/);
    explode = false;
    assert.equal(reset.run(), 2);
  });

  it("R1/R2: the same registration list drives boot and retry — one run, one state", () => {
    // The shape the spec asks for: the reset is written where the state is declared, and both
    // entries into the round call the same run(). This test is the shape, not a new rule.
    let phase = "down";
    let hearts = 0;
    const reset = createReset();
    reset.add("phase", () => {
      phase = "play";
    });
    reset.add("hearts", () => {
      hearts = 4;
    });

    reset.run(); // boot
    assert.deepEqual({ phase, hearts }, { phase: "play", hearts: 4 });

    phase = "down";
    hearts = 1;
    reset.run(); // retry
    assert.deepEqual({ phase, hearts }, { phase: "play", hearts: 4 });
  });
});
