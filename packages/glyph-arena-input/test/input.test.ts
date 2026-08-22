import "./setup.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInput } from "../src/index.js";

class TestTarget extends EventTarget {}

function dispatchKey(
  target: EventTarget,
  type: "keydown" | "keyup",
  code: string,
) {
  target.dispatchEvent(
    new KeyboardEvent(type, { code, bubbles: true }),
  );
}

function dispatchPointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: { pointerId: number; clientX: number; clientY: number; buttons: number },
) {
  target.dispatchEvent(
    new PointerEvent(type, { ...init, bubbles: true }),
  );
}

describe("createInput", () => {
  it("attach and detach listeners", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");
    assert.ok(input.snapshot().keys.has("KeyA"));

    input.detach();
    assert.equal(input.snapshot().keys.size, 0);
    assert.equal(input.snapshot().pointers.length, 0);
  });

  it("double attach swaps targets", () => {
    const input = createInput();
    const first = new TestTarget();
    const second = new TestTarget();

    input.attach(first);
    dispatchKey(first, "keydown", "KeyA");

    input.attach(second);
    assert.equal(input.snapshot().keys.size, 0);

    dispatchKey(second, "keydown", "KeyB");
    assert.ok(input.snapshot().keys.has("KeyB"));
    assert.ok(!input.snapshot().keys.has("KeyA"));
  });

  it("attach to same target is a no-op", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");

    input.attach(target);
    assert.ok(input.snapshot().keys.has("KeyA"));
  });

  it("tracks keys by KeyboardEvent.code", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "Space");
    dispatchKey(target, "keydown", "ArrowLeft");

    const snapshot = input.snapshot();
    assert.ok(snapshot.keys.has("Space"));
    assert.ok(snapshot.keys.has("ArrowLeft"));

    dispatchKey(target, "keyup", "Space");
    assert.ok(!input.snapshot().keys.has("Space"));
    assert.ok(input.snapshot().keys.has("ArrowLeft"));
  });

  it("tracks pointer id, x, y, and buttons", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchPointer(target, "pointerdown", {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      buttons: 1,
    });

    let snapshot = input.snapshot();
    assert.equal(snapshot.pointers.length, 1);
    assert.deepEqual(snapshot.pointers[0], {
      id: 1,
      x: 10,
      y: 20,
      buttons: 1,
    });

    dispatchPointer(target, "pointermove", {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
      buttons: 1,
    });

    snapshot = input.snapshot();
    assert.deepEqual(snapshot.pointers[0], {
      id: 1,
      x: 30,
      y: 40,
      buttons: 1,
    });

    dispatchPointer(target, "pointerup", {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
      buttons: 0,
    });

    assert.equal(input.snapshot().pointers.length, 0);
  });

  it("snapshot is empty after detach", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");
    dispatchPointer(target, "pointerdown", {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      buttons: 1,
    });

    input.detach();

    const snapshot = input.snapshot();
    assert.equal(snapshot.keys.size, 0);
    assert.equal(snapshot.pointers.length, 0);
  });

  it("blur clears keys and pointers", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");
    dispatchPointer(target, "pointerdown", {
      pointerId: 1,
      clientX: 5,
      clientY: 6,
      buttons: 1,
    });

    target.dispatchEvent(new Event("blur"));

    const snapshot = input.snapshot();
    assert.equal(snapshot.keys.size, 0);
    assert.equal(snapshot.pointers.length, 0);
  });

  it("keys stay stuck without blur", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");

    assert.ok(input.snapshot().keys.has("KeyA"));
  });

  it("dispose detaches and drops listeners", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");

    input.dispose();

    const snapshot = input.snapshot();
    assert.equal(snapshot.keys.size, 0);
    assert.equal(snapshot.pointers.length, 0);

    dispatchKey(target, "keydown", "KeyB");
    assert.equal(input.snapshot().keys.size, 0);
  });

  it("attach after dispose is a no-op and does not listen", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyA");
    input.dispose();

    input.attach(target);
    dispatchKey(target, "keydown", "KeyB");
    dispatchPointer(target, "pointerdown", {
      pointerId: 1,
      clientX: 1,
      clientY: 2,
      buttons: 1,
    });

    const snapshot = input.snapshot();
    assert.equal(snapshot.keys.size, 0);
    assert.equal(snapshot.pointers.length, 0);
  });

  it("detach and snapshot remain safe after dispose", () => {
    const input = createInput();
    const target = new TestTarget();

    input.attach(target);
    input.dispose();

    input.detach();
    input.dispose();

    const snapshot = input.snapshot();
    assert.equal(snapshot.keys.size, 0);
    assert.equal(snapshot.pointers.length, 0);
  });
});
