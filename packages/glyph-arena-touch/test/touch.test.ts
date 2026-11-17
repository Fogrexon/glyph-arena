import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTouchControls } from "../src/index.js";
import type { TouchControlsConfig, TouchPointer } from "../src/index.js";

const CONFIG: TouchControlsConfig = {
  zones: {
    stick: { kind: "circle", x: 100, y: 400, radius: 80, deadZone: 16 },
    left: { kind: "rect", x: 24, y: 300, w: 72, h: 72 },
    right: { kind: "rect", x: 108, y: 300, w: 72, h: 72 },
    jump: { kind: "rect", x: 600, y: 300, w: 72, h: 72 },
  },
  holdMs: 150,
};

/** One frame at 60 fps. Nothing here reads a clock: a run is a list of these. */
const FRAME = 1 / 60;

const at = (id: number, x: number, y: number): TouchPointer => ({ id, x, y });

describe("zones", () => {
  it("answers per zone, from every pointer — not from the first one", () => {
    const pad = createTouchControls(CONFIG);

    // One thumb on the stick, the other on jump. Reading pointers[0] would lose the jump.
    pad.update([at(1, 100, 400), at(2, 620, 320)], FRAME);

    assert.equal(pad.held("stick"), true);
    assert.equal(pad.held("jump"), true);
    assert.equal(pad.held("left"), false);
    assert.equal(pad.held("right"), false);
  });

  it("keeps both zones down when they overlap, instead of hiding a layout mistake", () => {
    const overlapping = createTouchControls({
      zones: {
        a: { kind: "rect", x: 0, y: 0, w: 100, h: 100 },
        b: { kind: "rect", x: 50, y: 0, w: 100, h: 100 },
      },
      holdMs: 100,
    });

    overlapping.update([at(1, 60, 50)], FRAME);

    assert.equal(overlapping.held("a"), true);
    assert.equal(overlapping.held("b"), true);
  });

  it("treats a rectangle as half open and a circle as closed", () => {
    const corner = createTouchControls(CONFIG);
    corner.update([at(1, 24, 300)], FRAME); // its top-left corner is inside
    assert.equal(corner.held("left"), true);

    const pastRight = createTouchControls(CONFIG);
    pastRight.update([at(1, 96, 320)], FRAME); // x + w is the first pixel outside
    assert.equal(pastRight.held("left"), false);

    const lastInside = createTouchControls(CONFIG);
    lastInside.update([at(1, 95, 320)], FRAME); // the last pixel inside
    assert.equal(lastInside.held("left"), true);

    const onTheRim = createTouchControls(CONFIG);
    onTheRim.update([at(1, 180, 400)], FRAME); // exactly on the circle's edge
    assert.equal(onTheRim.held("stick"), true);
  });

  it("keeps a zone down while a second finger on it lifts", () => {
    const pad = createTouchControls(CONFIG);

    pad.update([at(1, 620, 320), at(2, 650, 330)], FRAME);
    pad.update([at(1, 620, 320)], FRAME); // one thumb lifts

    assert.equal(pad.held("jump"), true, "the other finger is still on the button");
    assert.equal(pad.pressed("jump"), false);
  });
});

describe("the hold", () => {
  it("keeps a press that the next frame no longer sees", () => {
    const pad = createTouchControls(CONFIG);

    pad.update([at(1, 620, 320)], FRAME); // the frame the finger landed
    pad.update([], FRAME); // the next frame: the finger is already gone

    // 150 ms is the caller's number. A tap shorter than a frame is how a phone is used; without
    // this the jump it asked for never happened.
    assert.equal(pad.held("jump"), true);
    assert.equal(pad.pressed("jump"), false, "the edge was reported once, on the frame it landed");
  });

  it("stays down for as long as the finger is, not just for the hold", () => {
    // The hold is for a press that ended; it must not expire under a finger that is still there.
    const pad = createTouchControls(CONFIG);

    for (let frame = 0; frame < 60; frame += 1) {
      pad.update([at(1, 620, 320)], FRAME);
      assert.equal(pad.held("jump"), true, `released while the finger was still down, frame ${frame}`);
    }
  });

  it("expires after exactly the hold the caller asked for", () => {
    const pad = createTouchControls({ zones: CONFIG.zones, holdMs: 100 });

    pad.update([at(1, 620, 320)], 0.05);
    // 0.05 spent on the landing frame, then frames of 0.026: the 100 ms runs out in four of them.
    let frames = 0;
    while (pad.held("jump")) {
      pad.update([], 0.026);
      frames += 1;
      assert.ok(frames < 10, "the hold never ran out");
    }

    assert.ok(frames >= 3, `released after ${frames} frames — too early for a 100 ms hold`);
  });

  it("makes a press an edge, and a new press a new edge", () => {
    const pad = createTouchControls(CONFIG);

    pad.update([at(1, 620, 320)], FRAME);
    assert.equal(pad.pressed("jump"), true);

    let presses = 0;
    // A full second: longer than the hold, so a hold that is not refreshed shows up as a second
    // press partway through instead of sliding through a five-frame window.
    for (let frame = 0; frame < 60; frame += 1) {
      pad.update([at(1, 620, 320)], FRAME);
      if (pad.pressed("jump")) presses += 1;
    }
    assert.equal(presses, 0, "holding a button is one press, not sixty");

    pad.update([], 0.5); // released, and the hold has run out
    pad.update([at(1, 620, 320)], FRAME);
    assert.equal(pad.pressed("jump"), true, "a new press is a new edge");
  });
});

describe("the stick", () => {
  it("reads a direction, normalised, with the dead zone the zone declares", () => {
    const pad = createTouchControls(CONFIG);

    pad.update([at(1, 100, 400)], FRAME);
    assert.deepEqual(pad.axis("stick"), { x: 0, y: 0 }, "a finger resting in the middle is no direction");

    pad.update([at(1, 100, 408)], FRAME);
    assert.deepEqual(pad.axis("stick"), { x: 0, y: 0 }, "8px is inside a 16px dead zone");

    pad.update([at(1, 100, 480)], FRAME);
    const down = pad.axis("stick");
    assert.equal(Math.abs(down.x) < 1e-9, true);
    assert.ok(down.y > 0.99 && down.y <= 1, `pushed to the rim is full strength: ${JSON.stringify(down)}`);
  });

  it("stays with the finger that took it, even when a second one lands", () => {
    const pad = createTouchControls(CONFIG);

    pad.update([at(1, 100, 480)], FRAME); // first finger, straight down
    pad.update([at(1, 100, 480), at(2, 160, 400)], FRAME); // a second arrives on the right

    const axis = pad.axis("stick");
    assert.ok(axis.y > 0.99, "still the first finger's direction");
    assert.equal(Math.abs(axis.x) < 1e-9, true, "it did not jump to the second finger");

    // And when the first one leaves, the stick is released rather than handed over.
    pad.update([at(2, 160, 400)], FRAME);
    assert.deepEqual(pad.axis("stick"), { x: 0, y: 0 });
  });
});
