import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createCamera } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function translate(tx: number, ty: number) {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

function rotate(rotation: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

function scale(zoom: number) {
  return { a: zoom, b: 0, c: 0, d: zoom, e: 0, f: 0 };
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

function handComposeView(
  x: number,
  y: number,
  rotation: number,
  zoom: number,
  width: number,
  height: number,
) {
  const center = translate(width / 2, height / 2);
  const rot = rotate(rotation);
  const scl = scale(zoom);
  const offset = translate(-x, -y);

  return multiply(center, multiply(rot, multiply(scl, offset)));
}

describe("createCamera", () => {
  it("returns only set, get, view, and dispose", () => {
    const camera = createCamera();

    assert.deepEqual(Object.keys(camera).sort(), [
      "dispose",
      "get",
      "set",
      "view",
    ]);
  });

  it("get returns defaults when never set", () => {
    const camera = createCamera();

    assert.deepEqual(camera.get(), {
      x: 0,
      y: 0,
      rotation: 0,
      zoom: 1,
    });
  });

  it("partial set keeps omitted keys and defaults for unset keys", () => {
    const camera = createCamera();

    camera.set({ x: 3 });
    assert.deepEqual(camera.get(), {
      x: 3,
      y: 0,
      rotation: 0,
      zoom: 1,
    });

    camera.set({ rotation: 1.5 });
    assert.deepEqual(camera.get(), {
      x: 3,
      y: 0,
      rotation: 1.5,
      zoom: 1,
    });

    camera.set({ zoom: 2 });
    assert.deepEqual(camera.get(), {
      x: 3,
      y: 0,
      rotation: 1.5,
      zoom: 2,
    });
  });

  it("undefined keys in set keep existing values", () => {
    const camera = createCamera();

    camera.set({ x: 5, y: 7, rotation: 0.5, zoom: 3 });
    camera.set({ x: undefined, y: undefined, rotation: undefined, zoom: undefined });

    assert.deepEqual(camera.get(), {
      x: 5,
      y: 7,
      rotation: 0.5,
      zoom: 3,
    });
  });

  it("copies numeric values and isolates returned objects", () => {
    const camera = createCamera();
    const partial = { x: 4, y: 8 };

    camera.set(partial);
    partial.x = 99;
    partial.y = 99;

    const first = camera.get();
    assert.deepEqual(first, { x: 4, y: 8, rotation: 0, zoom: 1 });

    first.x = 77;
    assert.equal(camera.get().x, 4);
  });

  it("ignores unknown keys in set", () => {
    const camera = createCamera();

    camera.set({ x: 2, z: 9, scaleX: 1 } as never);

    assert.deepEqual(camera.get(), {
      x: 2,
      y: 0,
      rotation: 0,
      zoom: 1,
    });
  });

  it("view matches hand-composed T × R × S × T matrix", () => {
    const camera = createCamera();

    camera.set({
      x: 10,
      y: 20,
      rotation: Math.PI / 3,
      zoom: 2.5,
    });

    const width = 800;
    const height = 600;
    const expected = handComposeView(10, 20, Math.PI / 3, 2.5, width, height);
    const actual = camera.view(width, height);

    assert.equal(actual.a, expected.a);
    assert.equal(actual.b, expected.b);
    assert.equal(actual.c, expected.c);
    assert.equal(actual.d, expected.d);
    assert.equal(actual.e, expected.e);
    assert.equal(actual.f, expected.f);
  });

  it("maps the camera center to the screen center", () => {
    const camera = createCamera();

    camera.set({ x: 42, y: -17, rotation: 0.75, zoom: 1.8 });

    const { x, y } = camera.get();
    const matrix = camera.view(640, 480);
    const screenX = matrix.a * x + matrix.c * y + matrix.e;
    const screenY = matrix.b * x + matrix.d * y + matrix.f;

    assert.equal(screenX, 320);
    assert.equal(screenY, 240);
  });

  it("passes through negative zoom as a flip", () => {
    const camera = createCamera();

    camera.set({ x: 5, y: 3, rotation: Math.PI / 4, zoom: -2 });

    const expected = handComposeView(5, 3, Math.PI / 4, -2, 400, 300);
    const actual = camera.view(400, 300);

    assert.deepEqual(actual, expected);
  });

  it("passes through zero zoom", () => {
    const camera = createCamera();

    camera.set({ zoom: 0 });

    const matrix = camera.view(100, 100);

    assert.equal(matrix.a, 0);
    assert.equal(matrix.b, 0);
    assert.equal(matrix.d, 0);
    assert.equal(matrix.e, 50);
    assert.equal(matrix.f, 50);
    assert.equal(matrix.c, -Math.sin(0) * 0);
  });

  it("uses zero center when width or height is zero", () => {
    const camera = createCamera();

    camera.set({ x: 10, y: 20 });

    const zeroWidth = camera.view(0, 200);
    const zeroHeight = camera.view(200, 0);
    const bothZero = camera.view(0, 0);

    assert.equal(zeroWidth.e, 0 - 10);
    assert.equal(zeroWidth.f, 100 - 20);
    assert.equal(zeroHeight.e, 100 - 10);
    assert.equal(zeroHeight.f, 0 - 20);
    assert.equal(bothZero.e, -10);
    assert.equal(bothZero.f, -20);
  });

  it("uses width and height signs as-is", () => {
    const camera = createCamera();

    camera.set({ x: 0, y: 0, rotation: 0, zoom: 1 });

    const matrix = camera.view(-100, -200);

    assert.equal(matrix.e, -50);
    assert.equal(matrix.f, -100);
  });

  it("view returns a new matrix object each call", () => {
    const camera = createCamera();

    camera.set({ x: 1 });
    const first = camera.view(100, 100);
    const second = camera.view(100, 100);

    assert.notEqual(first, second);
    first.e = 99;
    assert.notEqual(second.e, 99);
  });

  it("dispose makes set and view no-ops and get returns defaults", () => {
    const camera = createCamera();

    camera.set({ x: 5, y: 6, rotation: 1, zoom: 2 });
    camera.dispose();

    assert.doesNotThrow(() => {
      camera.set({ x: 9 });
      camera.dispose();
    });

    assert.deepEqual(camera.get(), {
      x: 0,
      y: 0,
      rotation: 0,
      zoom: 1,
    });

    assert.deepEqual(camera.view(800, 600), {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    });
  });

  it("passes through NaN and Infinity without normalization", () => {
    const camera = createCamera();

    camera.set({
      x: NaN,
      y: Infinity,
      rotation: -Infinity,
      zoom: NaN,
    });

    const state = camera.get();
    assert.ok(Number.isNaN(state.x));
    assert.equal(state.y, Infinity);
    assert.equal(state.rotation, -Infinity);
    assert.ok(Number.isNaN(state.zoom));

    const matrix = camera.view(100, 100);
    assert.ok(Number.isNaN(matrix.e));
    assert.ok(Number.isNaN(matrix.f));
  });

  it("does not import sibling glyph-arena packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-/);
    assert.doesNotMatch(source, /\binverse\b/i);
    assert.doesNotMatch(source, /\bshake\b/i);
    assert.doesNotMatch(source, /\bbounds\b/i);
    assert.doesNotMatch(source, /\bfollow\b/i);
    assert.doesNotMatch(source, /\bpivot\b/i);
    assert.doesNotMatch(source, /\banisotropic\b/i);
    assert.doesNotMatch(source, /\blayers\b/i);
    assert.doesNotMatch(source, /\bpoint\b/i);
  });
});
