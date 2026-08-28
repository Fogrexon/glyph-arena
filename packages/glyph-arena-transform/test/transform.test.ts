import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createTransform } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function canvasLocalMatrix(
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
    e: x,
    f: y,
  };
}

function multiply(
  parent: { a: number; b: number; c: number; d: number; e: number; f: number },
  local: { a: number; b: number; c: number; d: number; e: number; f: number },
) {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    e: parent.a * local.e + parent.c * local.f + parent.e,
    f: parent.b * local.e + parent.d * local.f + parent.f,
  };
}

describe("createTransform", () => {
  it("returns only set, get, clear, world, and dispose", () => {
    const transform = createTransform();

    assert.deepEqual(Object.keys(transform).sort(), [
      "clear",
      "dispose",
      "get",
      "set",
      "world",
    ]);
  });

  it("get returns defaults for unregistered object nodes", () => {
    const transform = createTransform();
    const node = {};

    assert.deepEqual(transform.get(node), {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("get does not register nodes", () => {
    const transform = createTransform();
    const node = {};

    transform.get(node);
    transform.set(node, { x: 5 });

    assert.equal(transform.get(node).x, 5);
  });

  it("partial set keeps omitted keys and defaults for unregistered nodes", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, { x: 3 });
    assert.deepEqual(transform.get(node), {
      x: 3,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    transform.set(node, { rotation: 1.5 });
    assert.deepEqual(transform.get(node), {
      x: 3,
      y: 0,
      rotation: 1.5,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("copies numeric values and isolates returned objects", () => {
    const transform = createTransform();
    const node = {};
    const partial = { x: 4, y: 8 };

    transform.set(node, partial);
    partial.x = 99;
    partial.y = 99;

    const first = transform.get(node);
    assert.deepEqual(first, { x: 4, y: 8, rotation: 0, scaleX: 1, scaleY: 1 });

    first.x = 77;
    assert.equal(transform.get(node).x, 4);
  });

  it("ignores unknown keys in set", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, { x: 2, z: 9, skewX: 1 } as never);

    assert.deepEqual(transform.get(node), {
      x: 2,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("treats non-object nodes as no-ops for set and clear", () => {
    const transform = createTransform();

    assert.doesNotThrow(() => {
      transform.set(null, { x: 1 });
      transform.set(undefined, { x: 1 });
      transform.set(1, { x: 1 });
      transform.set("node", { x: 1 });
      transform.clear(null);
      transform.clear(undefined);
      transform.clear(false);
    });
  });

  it("returns defaults for non-object get and identity world without parentOf", () => {
    const transform = createTransform();
    let parentOfCalls = 0;

    const parentOf = () => {
      parentOfCalls += 1;
      return null;
    };

    assert.deepEqual(transform.get(null), {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    assert.deepEqual(transform.world(undefined, parentOf), {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    });
    assert.equal(parentOfCalls, 0);
  });

  it("unregistered locals act as identity in world", () => {
    const transform = createTransform();
    const root = { id: "root" };
    const child = { id: "child" };
    const parentOf = (node: unknown) => {
      if (node === child) {
        return root;
      }
      return null;
    };

    transform.set(root, { x: 5, y: 6 });

    assert.deepEqual(
      transform.world(child, parentOf),
      transform.world(root, parentOf),
    );
  });

  it("builds local matrices as T × R × S matching canvas order", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, {
      x: 10,
      y: 20,
      rotation: Math.PI / 2,
      scaleX: 2,
      scaleY: 3,
    });

    const expected = canvasLocalMatrix(10, 20, Math.PI / 2, 2, 3);
    assert.deepEqual(transform.world(node, () => null), expected);
  });

  it("composes parent × local when walking parentOf", () => {
    const transform = createTransform();
    const root = { id: "root" };
    const child = { id: "child" };
    const parentOf = (node: unknown) => {
      if (node === child) {
        return root;
      }
      return null;
    };

    transform.set(root, { x: 1, y: 2, rotation: 0.25, scaleX: 2, scaleY: 2 });
    transform.set(child, { x: 3, y: 4, rotation: -0.5, scaleX: 0.5, scaleY: 1.5 });

    const parentMatrix = canvasLocalMatrix(1, 2, 0.25, 2, 2);
    const childMatrix = canvasLocalMatrix(3, 4, -0.5, 0.5, 1.5);
    const expected = multiply(parentMatrix, childMatrix);

    assert.deepEqual(transform.world(child, parentOf), expected);
  });

  it("cuts parentOf cycles at the node before the re-visit", () => {
    const transform = createTransform();
    const a = { id: "a" };
    const b = { id: "b" };
    const parentOf = (node: unknown) => {
      if (node === a) {
        return b;
      }
      if (node === b) {
        return a;
      }
      return null;
    };

    transform.set(a, { x: 1 });
    transform.set(b, { x: 2 });

    const expectedFromA = multiply(
      canvasLocalMatrix(2, 0, 0, 1, 1),
      canvasLocalMatrix(1, 0, 0, 1, 1),
    );
    const expectedFromB = multiply(
      canvasLocalMatrix(1, 0, 0, 1, 1),
      canvasLocalMatrix(2, 0, 0, 1, 1),
    );

    const worldFromA = transform.world(a, parentOf);
    const worldFromB = transform.world(b, parentOf);

    assert.equal(worldFromA.e, expectedFromA.e);
    assert.equal(worldFromB.e, expectedFromB.e);
    assert.equal(worldFromA.f, expectedFromA.f);
    assert.equal(worldFromB.f, expectedFromB.f);
  });

  it("propagates parentOf throws", () => {
    const transform = createTransform();
    const node = {};
    const error = new Error("parent lookup failed");

    assert.throws(
      () =>
        transform.world(node, () => {
          throw error;
        }),
      error,
    );
  });

  it("clear unregisters nodes and unknown clear is a no-op", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, { x: 8 });
    transform.clear(node);
    assert.deepEqual(transform.get(node), {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    assert.doesNotThrow(() => {
      transform.clear({});
    });
  });

  it("dispose makes mutators no-ops and get/world return defaults", () => {
    const transform = createTransform();
    const node = {};
    let parentOfCalls = 0;

    transform.set(node, { x: 5 });
    transform.dispose();

    assert.doesNotThrow(() => {
      transform.set(node, { x: 9 });
      transform.clear(node);
    });

    assert.deepEqual(transform.get(node), {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    assert.deepEqual(
      transform.world(node, () => {
        parentOfCalls += 1;
        return null;
      }),
      { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    );
    assert.equal(parentOfCalls, 0);
  });

  it("passes through NaN and Infinity without normalization", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, {
      x: NaN,
      y: Infinity,
      rotation: -Infinity,
      scaleX: NaN,
      scaleY: Infinity,
    });

    const local = transform.get(node);
    assert.ok(Number.isNaN(local.x));
    assert.equal(local.y, Infinity);
    assert.equal(local.rotation, -Infinity);
    assert.ok(Number.isNaN(local.scaleX));
    assert.equal(local.scaleY, Infinity);

    const matrix = transform.world(node, () => null);
    assert.ok(Number.isNaN(matrix.e));
    assert.equal(matrix.f, Infinity);
  });

  it("passes through negative scale as a flip", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, { scaleX: -2, scaleY: 3, rotation: Math.PI / 4 });

    const matrix = transform.world(node, () => null);
    const expected = canvasLocalMatrix(0, 0, Math.PI / 4, -2, 3);

    assert.deepEqual(matrix, expected);
  });

  it("world returns a new matrix object each call", () => {
    const transform = createTransform();
    const node = {};

    transform.set(node, { x: 1 });
    const first = transform.world(node, () => null);
    const second = transform.world(node, () => null);

    assert.notEqual(first, second);
    first.e = 99;
    assert.equal(second.e, 1);
  });

  it("does not import sibling glyph-arena packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-/);
    assert.doesNotMatch(source, /\bcamera\b/i);
    assert.doesNotMatch(source, /\binverse\b/i);
    assert.doesNotMatch(source, /\bpivot\b/i);
    assert.doesNotMatch(source, /\bskew\b/i);
    assert.doesNotMatch(source, /\bpoint\b/i);
    assert.doesNotMatch(source, /\btween\b/i);
    assert.doesNotMatch(source, /\b3d\b/i);
  });
});
