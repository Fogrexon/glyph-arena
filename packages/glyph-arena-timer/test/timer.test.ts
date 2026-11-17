import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { exportedNames } from "../../../scripts/lib/public-surface.mjs";
import { createTimer } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("createTimer", () => {
  it("delay fires once after interval from origin", () => {
    const timer = createTimer();
    let count = 0;

    timer.delay(1, () => {
      count += 1;
    });

    timer.tick(0);
    assert.equal(count, 0);

    timer.tick(1);
    assert.equal(count, 1);

    timer.tick(2);
    assert.equal(count, 1);
  });

  it("every fires after each interval, first after interval", () => {
    const timer = createTimer();
    const hits: number[] = [];

    timer.every(1, () => {
      hits.push(hits.length);
    });

    timer.tick(0);
    assert.deepEqual(hits, []);

    timer.tick(1);
    assert.deepEqual(hits, [0]);

    timer.tick(2);
    assert.deepEqual(hits, [0, 1]);

    timer.tick(3);
    assert.deepEqual(hits, [0, 1, 2]);
  });

  it("no fire without tick", () => {
    const timer = createTimer();
    let fired = false;

    timer.delay(0, () => {
      fired = true;
    });
    timer.every(0, () => {
      fired = true;
    });

    assert.equal(fired, false);
  });

  it("first tick is origin; pre-origin schedules use origin", () => {
    const timer = createTimer();
    let fired = false;

    timer.delay(2, () => {
      fired = true;
    });

    timer.tick(10);
    assert.equal(fired, false);

    timer.tick(11);
    assert.equal(fired, false);

    timer.tick(12);
    assert.equal(fired, true);
  });

  it("delay(0) and every(0) fire on the next tick", () => {
    const timer = createTimer();
    let delayCount = 0;
    let everyCount = 0;

    timer.delay(0, () => {
      delayCount += 1;
    });
    timer.every(0, () => {
      everyCount += 1;
    });

    timer.tick(5);
    assert.equal(delayCount, 0);
    assert.equal(everyCount, 0);

    timer.tick(5.1);
    assert.equal(delayCount, 1);
    assert.equal(everyCount, 1);

    timer.tick(5.2);
    assert.equal(delayCount, 1);
    assert.equal(everyCount, 2);
  });

  it("negative seconds do not schedule", () => {
    const timer = createTimer();
    let fired = false;

    const delayHandle = timer.delay(-1, () => {
      fired = true;
    });
    const everyHandle = timer.every(-0.5, () => {
      fired = true;
    });

    timer.tick(0);
    timer.tick(1);
    assert.equal(fired, false);

    assert.doesNotThrow(() => {
      timer.cancel(delayHandle);
      timer.cancel(everyHandle);
    });
  });

  it("backward nowSeconds is ignored", () => {
    const timer = createTimer();
    let count = 0;

    timer.delay(1, () => {
      count += 1;
    });

    timer.tick(2);
    assert.equal(count, 0);

    timer.tick(1);
    assert.equal(count, 0);

    timer.tick(3);
    assert.equal(count, 1);
  });

  it("cancel unknown handle is a no-op", () => {
    const timer = createTimer();

    assert.doesNotThrow(() => {
      timer.cancel(999);
    });
  });

  it("dispose clears pending and makes all methods no-ops", () => {
    const timer = createTimer();
    let fired = false;

    timer.delay(1, () => {
      fired = true;
    });
    timer.every(1, () => {
      fired = true;
    });

    timer.dispose();

    assert.doesNotThrow(() => {
      timer.tick(10);
      timer.delay(1, () => {
        fired = true;
      });
      timer.every(1, () => {
        fired = true;
      });
      timer.cancel(1);
      timer.dispose();
    });

    assert.equal(fired, false);
  });

  it("callback throw does not drop other schedules", () => {
    const timer = createTimer();
    const order: string[] = [];
    const error = new Error("boom");

    timer.delay(1, () => {
      order.push("first");
      throw error;
    });
    timer.delay(1, () => {
      order.push("second");
    });

    timer.tick(0);

    assert.throws(() => timer.tick(1), error);
    assert.deepEqual(order, ["first", "second"]);
  });

  it("cancel during fire stops every from rescheduling", () => {
    const timer = createTimer();
    let count = 0;
    let handle = 0;

    handle = timer.every(1, () => {
      count += 1;
      timer.cancel(handle);
    });

    timer.tick(0);
    timer.tick(1);
    assert.equal(count, 1);

    timer.tick(2);
    assert.equal(count, 1);
  });

  it("a negative interval never fires, and does not wedge the timer", () => {
    const timer = createTimer();
    let negativeFired = 0;

    timer.delay(-1, () => {
      negativeFired += 1;
    });
    timer.every(-0.5, () => {
      negativeFired += 1;
    });

    // Far into the future, not just the next tick: an implementation that
    // schedules a negative interval as "due later" has to fail here.
    timer.tick(0);
    timer.tick(1);
    timer.tick(100);
    assert.equal(negativeFired, 0);

    // Registering the bad interval must not wedge the timer either.
    let healthy = 0;
    timer.delay(1, () => {
      healthy += 1;
    });
    timer.tick(101);
    assert.equal(healthy, 1);
    assert.equal(negativeFired, 0);
  });

  it("a throw does not drop schedules due on a later tick", () => {
    const timer = createTimer();
    const error = new Error("boom");
    let later = 0;

    timer.delay(1, () => {
      throw error;
    });
    timer.delay(2, () => {
      later += 1;
    });

    timer.tick(0);
    assert.throws(() => timer.tick(1), error);
    assert.equal(later, 0);

    // The rethrow must not clear reservations it did not own.
    timer.tick(2);
    assert.equal(later, 1);
  });

  it("a dispose inside a callback stops the rest of the tick", () => {
    const timer = createTimer();
    const order: string[] = [];

    timer.every(1, () => {
      order.push("a");
      timer.dispose();
    });
    timer.every(1, () => {
      order.push("b");
    });

    timer.tick(0);
    timer.tick(1);

    // Contract: dispose stops everything from that moment, including callbacks
    // that were already due when the tick started.
    assert.deepEqual(order, ["a"]);
  });

  it("nothing fires on later ticks after dispose", () => {
    const timer = createTimer();
    const order: string[] = [];

    timer.every(1, () => {
      order.push("a");
      timer.dispose();
    });
    timer.every(1, () => {
      order.push("b");
    });

    timer.tick(0);
    timer.tick(1);
    timer.tick(2);
    timer.tick(3);

    assert.deepEqual(order, ["a"]);
  });

  it("an every already rescheduled at dispose time does not fire afterwards", () => {
    const timer = createTimer();
    let count = 0;

    timer.every(1, () => {
      count += 1;
    });

    timer.tick(0);
    timer.tick(1);
    assert.equal(count, 1);

    timer.dispose();
    timer.tick(2);
    timer.tick(3);
    assert.equal(count, 1);
  });

  it("exports only the names on its public list, and imports no sibling package", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    // The surface, not the vocabulary: a new public name has to be added here on purpose,
    // and a word used inside a function is not a name. This is what used to be a list of
    // forbidden words, which turned `follow` into a reason a package could not grow.
    assert.deepEqual(exportedNames(source), [
      "Timer",
      "TimerHandle",
      "createTimer",
    ]);

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
  });
});
