import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createWorld } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("createWorld", () => {
  it("spawn returns an entity and supports set, get, has, remove", () => {
    const world = createWorld();
    const entity = world.spawn();

    const value = { hp: 10 };
    world.set(entity, "stats", value);

    assert.equal(world.get(entity, "stats"), value);
    assert.equal(world.has(entity, "stats"), true);

    world.remove(entity, "stats");
    assert.equal(world.get(entity, "stats"), undefined);
    assert.equal(world.has(entity, "stats"), false);
  });

  it("set on the same key overwrites the previous value", () => {
    const world = createWorld();
    const entity = world.spawn();

    world.set(entity, "label", "first");
    world.set(entity, "label", "second");

    assert.equal(world.get(entity, "label"), "second");
  });

  it("remove on a missing key is a no-op", () => {
    const world = createWorld();
    const entity = world.spawn();

    assert.doesNotThrow(() => {
      world.remove(entity, "missing");
    });

    assert.equal(world.has(entity, "missing"), false);
  });

  it("despawn drops components and allows entity id reuse", () => {
    const world = createWorld();
    const first = world.spawn();

    world.set(first, "alive", true);
    world.despawn(first);

    assert.equal(world.get(first, "alive"), undefined);
    assert.equal(world.has(first, "alive"), false);

    const second = world.spawn();
    assert.equal(second, first);

    assert.equal(world.get(second, "alive"), undefined);
    assert.equal(world.has(second, "alive"), false);
  });

  it("missing entity operations are no-ops", () => {
    const world = createWorld();
    const missing = 999;

    assert.doesNotThrow(() => {
      world.set(missing, "x", 1);
      world.remove(missing, "x");
      world.despawn(missing);
    });

    assert.equal(world.get(missing, "x"), undefined);
    assert.equal(world.has(missing, "x"), false);
  });

  it("despawn on a missing entity is a no-op", () => {
    const world = createWorld();

    assert.doesNotThrow(() => {
      world.despawn(42);
    });
  });

  it("set with undefined removes the component", () => {
    const world = createWorld();
    const entity = world.spawn();

    world.set(entity, "flag", true);
    assert.equal(world.has(entity, "flag"), true);

    world.set(entity, "flag", undefined);
    assert.equal(world.get(entity, "flag"), undefined);
    assert.equal(world.has(entity, "flag"), false);
  });

  it("get returns the same reference last set", () => {
    const world = createWorld();
    const entity = world.spawn();
    const payload = { nested: { count: 1 } };

    world.set(entity, "payload", payload);
    payload.nested.count = 2;

    assert.equal(world.get(entity, "payload"), payload);
    assert.equal(
      (world.get(entity, "payload") as { nested: { count: number } }).nested
        .count,
      2,
    );
  });

  it("empty-string keys behave like a missing entity", () => {
    const world = createWorld();
    const entity = world.spawn();

    world.set(entity, "", "value");

    assert.equal(world.get(entity, ""), undefined);
    assert.equal(world.has(entity, ""), false);

    assert.doesNotThrow(() => {
      world.remove(entity, "");
    });
  });

  it("entities from another world behave like a missing entity", () => {
    const worldA = createWorld();
    const worldB = createWorld();
    const entity = worldA.spawn();

    worldA.set(entity, "team", "a");

    assert.equal(worldB.get(entity, "team"), undefined);
    assert.equal(worldB.has(entity, "team"), false);

    assert.doesNotThrow(() => {
      worldB.set(entity, "team", "b");
      worldB.remove(entity, "team");
      worldB.despawn(entity);
    });

    assert.equal(worldA.get(entity, "team"), "a");
  });

  it("dispose despawns all living entities", () => {
    const world = createWorld();
    const first = world.spawn();
    const second = world.spawn();

    world.set(first, "id", 1);
    world.set(second, "id", 2);

    world.dispose();

    assert.equal(world.get(first, "id"), undefined);
    assert.equal(world.get(second, "id"), undefined);
    assert.equal(world.has(first, "id"), false);
    assert.equal(world.has(second, "id"), false);
  });

  it("after dispose, spawn returns an invalid entity", () => {
    const world = createWorld();
    const living = world.spawn();

    world.set(living, "active", true);
    world.dispose();

    const invalid = world.spawn();

    assert.equal(world.get(invalid, "active"), undefined);
    assert.equal(world.has(invalid, "active"), false);

    assert.doesNotThrow(() => {
      world.set(invalid, "active", true);
      world.remove(invalid, "active");
      world.despawn(invalid);
    });

    assert.equal(world.get(invalid, "active"), undefined);
    assert.equal(world.has(invalid, "active"), false);
  });

  it("after dispose, all methods are no-ops", () => {
    const world = createWorld();
    const entity = world.spawn();

    world.set(entity, "x", 1);
    world.dispose();

    assert.doesNotThrow(() => {
      world.set(entity, "x", 2);
      world.remove(entity, "x");
      world.despawn(entity);
      world.dispose();
    });

    assert.equal(world.get(entity, "x"), undefined);
    assert.equal(world.has(entity, "x"), false);
  });

  it("does not import sibling packages", () => {
    const source = readFileSync(
      join(packageRoot, "src", "index.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
  });
});
