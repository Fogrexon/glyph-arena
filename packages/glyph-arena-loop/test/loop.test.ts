import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLoop, type Raf, type RafCallback } from "../src/index.js";

type ScheduledCallback = {
  id: number;
  callback: RafCallback;
};

function createTestHarness(initialTime = 0) {
  let time = initialTime;
  let nextId = 1;
  const scheduled: ScheduledCallback[] = [];

  const clock = () => time;

  const raf: Raf = (callback) => {
    const id = nextId++;
    scheduled.push({ id, callback });
    return id;
  };

  const cancelRaf = (handle: number) => {
    const index = scheduled.findIndex((entry) => entry.id === handle);
    if (index !== -1) {
      scheduled.splice(index, 1);
    }
  };

  const advance = (ms: number) => {
    time += ms;
  };

  const flush = () => {
    const pending = scheduled.splice(0, scheduled.length);
    for (const entry of pending) {
      entry.callback(time);
    }
  };

  return { clock, raf, cancelRaf, advance, flush, scheduled };
}

describe("createLoop", () => {
  it("start while already running is a no-op", () => {
    const harness = createTestHarness();
    let frameCount = 0;

    const loop = createLoop({
      onFrame: () => {
        frameCount += 1;
      },
      clock: harness.clock,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    loop.start();
    harness.flush();
    assert.equal(frameCount, 1);

    loop.start();
    harness.flush();
    assert.equal(frameCount, 2);
  });

  it("stop while not running is a no-op", () => {
    const harness = createTestHarness();

    const loop = createLoop({
      onFrame: () => {},
      clock: harness.clock,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    assert.equal(loop.isRunning, false);
    loop.stop();
    assert.equal(loop.isRunning, false);
  });

  it("first frame has delta=0 and frame=0", () => {
    const harness = createTestHarness(1000);
    const frames: Array<{ elapsed: number; delta: number; frame: number }> = [];

    const loop = createLoop({
      onFrame: (time) => {
        frames.push(time);
      },
      clock: harness.clock,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    loop.start();
    harness.flush();

    assert.equal(frames.length, 1);
    assert.equal(frames[0].delta, 0);
    assert.equal(frames[0].frame, 0);
    assert.equal(frames[0].elapsed, 0);
  });

  it("subsequent frames increment frame and report delta in seconds", () => {
    const harness = createTestHarness(1000);
    const frames: Array<{ elapsed: number; delta: number; frame: number }> = [];

    const loop = createLoop({
      onFrame: (time) => {
        frames.push(time);
      },
      clock: harness.clock,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    loop.start();
    harness.flush();

    harness.advance(16);
    harness.flush();

    harness.advance(16);
    harness.flush();

    assert.equal(frames.length, 3);
    assert.equal(frames[1].frame, 1);
    assert.equal(frames[1].delta, 0.016);
    assert.equal(frames[2].frame, 2);
    assert.equal(frames[2].delta, 0.016);
    assert.equal(frames[2].elapsed, 0.032);
  });

  it("onFrame throw stops the loop and propagates the error", () => {
    const harness = createTestHarness();
    const error = new Error("boom");

    const loop = createLoop({
      onFrame: () => {
        throw error;
      },
      clock: harness.clock,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    loop.start();

    assert.throws(() => harness.flush(), error);
    assert.equal(loop.isRunning, false);

    harness.flush();
    assert.equal(harness.scheduled.length, 0);
  });

  it("late raf callbacks are ignored after stop", () => {
    const harness = createTestHarness();
    let frameCount = 0;

    const loop = createLoop({
      onFrame: () => {
        frameCount += 1;
      },
      clock: harness.clock,
      raf: harness.raf,
    });

    loop.start();
    harness.flush();
    assert.equal(frameCount, 1);

    loop.stop();
    harness.flush();
    assert.equal(frameCount, 1);
    assert.equal(loop.isRunning, false);
  });

  it("stop works when cancelRaf is omitted", () => {
    const harness = createTestHarness();
    let frameCount = 0;

    const loop = createLoop({
      onFrame: () => {
        frameCount += 1;
      },
      clock: harness.clock,
      raf: harness.raf,
    });

    loop.start();
    harness.flush();
    assert.equal(loop.isRunning, true);

    loop.stop();
    assert.equal(loop.isRunning, false);

    harness.flush();
    assert.equal(frameCount, 1);
  });

  it("isRunning reflects current state", () => {
    const harness = createTestHarness();

    const loop = createLoop({
      onFrame: () => {},
      clock: harness.clock,
      raf: harness.raf,
      cancelRaf: harness.cancelRaf,
    });

    assert.equal(loop.isRunning, false);

    loop.start();
    assert.equal(loop.isRunning, true);

    loop.stop();
    assert.equal(loop.isRunning, false);
  });
});
