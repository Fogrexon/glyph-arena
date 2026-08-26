import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createActions } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("createActions", () => {
  it("bind maps KeyboardEvent.code strings to actions", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);
    actions.bind("left", ["ArrowLeft"]);

    const query = actions.tick(["Space"]);
    assert.equal(query.down("jump"), true);
    assert.equal(query.down("left"), false);
  });

  it("re-bind same action replaces codes", () => {
    const actions = createActions();

    actions.bind("move", ["KeyA"]);
    actions.tick(["KeyA"]);
    assert.equal(actions.tick(["KeyA"]).down("move"), true);

    actions.bind("move", ["KeyB"]);
    assert.equal(actions.tick(["KeyA"]).down("move"), false);
    assert.equal(actions.tick(["KeyB"]).down("move"), true);
  });

  it("unbind missing action is a no-op", () => {
    const actions = createActions();

    assert.doesNotThrow(() => {
      actions.unbind("missing");
    });
  });

  it("same code may bind to multiple actions", () => {
    const actions = createActions();

    actions.bind("a", ["KeyA"]);
    actions.bind("b", ["KeyA"]);

    const query = actions.tick(["KeyA"]);
    assert.equal(query.down("a"), true);
    assert.equal(query.down("b"), true);
    assert.equal(query.pressed("a"), true);
    assert.equal(query.pressed("b"), true);
  });

  it("pressed is down this tick and not previous tick", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);

    const first = actions.tick([]);
    assert.equal(first.down("jump"), false);
    assert.equal(first.pressed("jump"), false);
    assert.equal(first.released("jump"), false);

    const second = actions.tick(["Space"]);
    assert.equal(second.down("jump"), true);
    assert.equal(second.pressed("jump"), true);
    assert.equal(second.released("jump"), false);

    const third = actions.tick(["Space"]);
    assert.equal(third.down("jump"), true);
    assert.equal(third.pressed("jump"), false);
    assert.equal(third.released("jump"), false);
  });

  it("released is inverse of pressed edge", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);

    actions.tick(["Space"]);
    const query = actions.tick([]);
    assert.equal(query.down("jump"), false);
    assert.equal(query.pressed("jump"), false);
    assert.equal(query.released("jump"), true);
  });

  it("tick snapshot is held until the next tick", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);

    const first = actions.tick(["Space"]);
    assert.equal(first.down("jump"), true);

    const second = actions.tick([]);
    assert.equal(first.down("jump"), true);
    assert.equal(second.down("jump"), false);
  });

  it("never-ticked unknown actions are all false", () => {
    const actions = createActions();

    const query = actions.tick([]);
    assert.equal(query.down("unknown"), false);
    assert.equal(query.pressed("unknown"), false);
    assert.equal(query.released("unknown"), false);
  });

  it("unbound action queries are all false", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);
    actions.tick(["Space"]);

    const query = actions.tick(["Space"]);
    assert.equal(query.down("never-bound"), false);
    assert.equal(query.pressed("never-bound"), false);
    assert.equal(query.released("never-bound"), false);
  });

  it("unbind while held emits released on next tick", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);
    actions.tick(["Space"]);

    actions.unbind("jump");

    const query = actions.tick(["Space"]);
    assert.equal(query.down("jump"), false);
    assert.equal(query.pressed("jump"), false);
    assert.equal(query.released("jump"), true);
  });

  it("unbind while not held does not emit released", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);
    actions.tick([]);

    actions.unbind("jump");

    const query = actions.tick([]);
    assert.equal(query.released("jump"), false);
  });

  it("empty codes array binds but action is always false", () => {
    const actions = createActions();

    actions.bind("noop", []);

    const query = actions.tick(["Space", "KeyA"]);
    assert.equal(query.down("noop"), false);
    assert.equal(query.pressed("noop"), false);
    assert.equal(query.released("noop"), false);
  });

  it("accepts keys as an iterable", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);

    const query = actions.tick({
      *[Symbol.iterator]() {
        yield "Space";
      },
    });

    assert.equal(query.down("jump"), true);
  });

  it("dispose makes bind, unbind, and tick no-ops", () => {
    const actions = createActions();

    actions.bind("jump", ["Space"]);
    actions.tick(["Space"]);

    actions.dispose();

    assert.doesNotThrow(() => {
      actions.bind("jump", ["KeyA"]);
      actions.unbind("jump");
      actions.dispose();
    });

    const query = actions.tick(["Space"]);
    assert.equal(query.down("jump"), false);
    assert.equal(query.pressed("jump"), false);
    assert.equal(query.released("jump"), false);
  });

  it("does not import sibling glyph-arena packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
  });
});
