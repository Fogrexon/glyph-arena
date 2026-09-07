import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createTween } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("createTween", () => {
  it("returns only the five public methods", () => {
    const tween = createTween();
    assert.deepEqual(Object.keys(tween).sort(), [
      "cancel",
      "dispose",
      "get",
      "tick",
      "to",
    ]);
  });

  it("get is undefined before the first tick", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 1);

    assert.equal(tween.get(handle), undefined);
  });

  it("does not return from before the first tick", () => {
    const tween = createTween();
    const handle = tween.to(42, 100, 2);

    assert.equal(tween.get(handle), undefined);
  });

  it("first tick is origin; pre-origin schedules start at origin", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 2);

    tween.tick(10);
    assert.equal(tween.get(handle), 0);

    tween.tick(11);
    assert.equal(tween.get(handle), 5);

    tween.tick(12);
    assert.equal(tween.get(handle), undefined);
  });

  it("interpolates linearly when ease is omitted", () => {
    const tween = createTween();
    const handle = tween.to(0, 100, 4);

    tween.tick(0);
    tween.tick(2);
    assert.equal(tween.get(handle), 50);
  });

  it("clamps u to 0..1 before calling ease", () => {
    const tween = createTween();
    const seen: number[] = [];
    const handle = tween.to(0, 10, 1, (t) => {
      seen.push(t);
      return t;
    });

    tween.tick(0);
    tween.tick(0.5);
    assert.deepEqual(seen, [0, 0.5]);

    tween.tick(2);
    assert.deepEqual(seen, [0, 0.5]);
    assert.equal(tween.get(handle), undefined);
  });

  it("does not clamp ease return value", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 1, () => 2);

    tween.tick(0);
    tween.tick(0.5);
    assert.equal(tween.get(handle), 20);
  });

  it("regression: duration zero scheduling does not use tickGeneration + 1", () => {
    const source = readFileSync(
      join(packageRoot, "src", "index.ts"),
      "utf8",
    );

    assert.doesNotMatch(
      source,
      /minTickGen:\s*zeroDuration\s*\?\s*tickGeneration\s*\+\s*1/,
    );
  });

  it("duration 0 completes on the single tick that establishes origin", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 0);

    tween.tick(0);

    assert.equal(tween.get(handle), undefined);
    assert.doesNotThrow(() => {
      tween.cancel(handle);
      tween.tick(0);
    });
  });

  it("duration 0 completes on the next tick after origin is already set", () => {
    const tween = createTween();

    tween.tick(0);

    const handle = tween.to(0, 10, 0);
    tween.tick(1);

    assert.equal(tween.get(handle), undefined);
    assert.doesNotThrow(() => {
      tween.cancel(handle);
    });
  });

  it("duration 0 does not linger across a second duration-0 tween", () => {
    const tween = createTween();
    const first = tween.to(0, 10, 0);

    tween.tick(0);
    assert.equal(tween.get(first), undefined);

    const second = tween.to(0, 20, 0);
    tween.tick(1);
    assert.equal(tween.get(second), undefined);
  });

  it("duration 0 completes on the next tick and get is undefined afterward", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 0);

    tween.tick(5);
    assert.equal(tween.get(handle), undefined);

    assert.doesNotThrow(() => {
      tween.cancel(handle);
      tween.tick(5);
    });
  });

  it("negative duration returns invalid handle", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, -1);

    tween.tick(0);
    tween.tick(1);
    assert.equal(tween.get(handle), undefined);

    assert.doesNotThrow(() => {
      tween.cancel(handle);
    });
  });

  it("get is undefined for missing, completed, and cancelled handles", () => {
    const tween = createTween();

    assert.equal(tween.get(999), undefined);

    const completed = tween.to(0, 10, 1);
    tween.tick(0);
    tween.tick(1);
    assert.equal(tween.get(completed), undefined);

    const cancelled = tween.to(0, 10, 5);
    tween.tick(0);
    tween.cancel(cancelled);
    assert.equal(tween.get(cancelled), undefined);
  });

  it("cancel unknown handle is a no-op", () => {
    const tween = createTween();

    assert.doesNotThrow(() => {
      tween.cancel(999);
    });
  });

  it("backward nowSeconds is ignored", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 2);

    tween.tick(0);
    tween.tick(1);
    assert.equal(tween.get(handle), 5);

    tween.tick(0.5);
    assert.equal(tween.get(handle), 5);

    tween.tick(2);
    assert.equal(tween.get(handle), undefined);
  });

  it("same nowSeconds again does not advance", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 2);

    tween.tick(0);
    tween.tick(1);
    assert.equal(tween.get(handle), 5);

    tween.tick(1);
    assert.equal(tween.get(handle), 5);

    tween.tick(2);
    assert.equal(tween.get(handle), undefined);
  });

  it("ease throw removes only that handle and rethrows", () => {
    const tween = createTween();
    const error = new Error("ease boom");
    const bad = tween.to(0, 10, 1, () => {
      throw error;
    });
    const good = tween.to(0, 20, 1);

    assert.throws(() => tween.tick(0), error);
    assert.equal(tween.get(bad), undefined);

    tween.tick(0.5);
    assert.equal(tween.get(good), 10);
  });

  it("get returns a number primitive", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 2);

    tween.tick(0);
    tween.tick(1);
    const value = tween.get(handle);

    assert.equal(typeof value, "number");
    assert.equal(Object.prototype.toString.call(value), "[object Number]");
  });

  it("dispose makes all methods no-ops and to returns invalid handle", () => {
    const tween = createTween();
    const handle = tween.to(0, 10, 1);

    tween.tick(0);
    tween.dispose();

    assert.equal(tween.get(handle), undefined);

    assert.doesNotThrow(() => {
      tween.tick(10);
      tween.cancel(handle);
      tween.dispose();
    });

    const invalid = tween.to(0, 10, 1);
    tween.tick(10);
    assert.equal(tween.get(invalid), undefined);
  });

  it("passes through NaN and Infinity without normalization", () => {
    const tween = createTween();
    const nanHandle = tween.to(Number.NaN, 10, 1);
    const infHandle = tween.to(0, Number.POSITIVE_INFINITY, 1);

    tween.tick(0);
    tween.tick(0.5);

    assert.ok(Number.isNaN(tween.get(nanHandle)!));
    assert.equal(tween.get(infHandle), Number.POSITIVE_INFINITY);
  });

  it("allows multiple independent tweens", () => {
    const tween = createTween();
    const a = tween.to(0, 10, 2);
    const b = tween.to(100, 0, 4);

    tween.tick(0);
    tween.tick(1);

    assert.equal(tween.get(a), 5);
    assert.equal(tween.get(b), 75);
  });

  it("completed handle ids may be reused by later to()", () => {
    const tween = createTween();
    const first = tween.to(0, 10, 1);

    tween.tick(0);
    tween.tick(1);
    assert.equal(tween.get(first), undefined);

    const second = tween.to(0, 20, 1);
    tween.tick(1);
    tween.tick(2);

    assert.equal(tween.get(second), undefined);
    assert.equal(typeof second, "number");
  });

  it("does not import sibling packages", () => {
    const source = readFileSync(
      join(packageRoot, "src", "index.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-transform/);
    assert.doesNotMatch(source, /\bclock\b/i);
    assert.doesNotMatch(source, /\braf\b/i);
    assert.doesNotMatch(source, /\bsequence\b/i);
    assert.doesNotMatch(source, /\bparallel\b/i);
    assert.doesNotMatch(source, /\byoyo\b/i);
    assert.doesNotMatch(source, /\brepeat\b/i);
    assert.doesNotMatch(source, /\bspring\b/i);
    assert.doesNotMatch(source, /\btimeline\b/i);
  });
});
