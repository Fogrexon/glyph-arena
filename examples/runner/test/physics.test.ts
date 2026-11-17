import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COYOTE_SECONDS,
  GRAVITY,
  JUMP_BUFFER_SECONDS,
  JUMP_VELOCITY,
  createBody,
  jumpHeight,
  stepBody,
  type Body,
} from "../src/physics.ts";

/** A floor at y = 224 (a tile boundary, like the level), nothing else. */
const FLOOR_Y = 224;
const floor = (left: number, top: number, right: number, bottom: number) => bottom > FLOOR_Y && top < 400;

function standOnFloor(): Body {
  const body = createBody(0, FLOOR_Y - 28, 20, 28);
  for (let step = 0; step < 30; step += 1) {
    stepBody(body, { left: false, right: false, jumpPressed: false, jumpHeld: false }, 1 / 60, floor);
  }
  return body;
}

test("the jump reaches the height the numbers promise", () => {
  // 760^2 / (2 * 2600) = 111.1 px, three and a half tiles.
  assert.ok(Math.abs(jumpHeight() - 111.08) < 0.5, `jumpHeight is ${jumpHeight()}`);
});

test("a body falls and lands on the floor, and stays grounded", () => {
  const body = standOnFloor();
  assert.equal(body.grounded, true);
  // Ten more still frames must not shake it loose: the probe reaches below the feet.
  for (let step = 0; step < 10; step += 1) {
    stepBody(body, { left: false, right: false, jumpPressed: false, jumpHeld: false }, 1 / 60, floor);
    assert.equal(body.grounded, true, `lost the floor on step ${step}`);
  }
  assert.equal(body.vy, 0);
  assert.ok(Math.abs(body.y + body.h - FLOOR_Y) < 1, `feet at ${body.y + body.h}`);
});

test("jumping leaves the floor and comes back", () => {
  const body = standOnFloor();
  stepBody(body, { left: false, right: false, jumpPressed: true, jumpHeld: true }, 1 / 60, floor);
  assert.ok(body.vy < 0, "the jump did not push up");
  let peak = body.y;
  for (let step = 0; step < 240; step += 1) {
    stepBody(body, { left: false, right: false, jumpPressed: false, jumpHeld: true }, 1 / 60, floor);
    peak = Math.min(peak, body.y);
  }
  const climbed = FLOOR_Y - 28 - peak;
  assert.ok(climbed > 95 && climbed < 120, `climbed ${climbed.toFixed(1)} px`);
  assert.equal(body.grounded, true, "the body never came back down");
});

test("the coyote window lets a jump one step after the ledge", () => {
  const body = createBody(0, FLOOR_Y - 28, 20, 28);
  body.grounded = false;
  body.coyote = COYOTE_SECONDS / 2;
  stepBody(body, { left: false, right: false, jumpPressed: true, jumpHeld: true }, 1 / 60, () => false);
  assert.ok(body.vy < 0, "no jump after leaving the ledge");
});

test("a jump pressed just before landing is remembered", () => {
  const body = createBody(0, FLOOR_Y - 28, 20, 28);
  body.jumpBuffer = JUMP_BUFFER_SECONDS;
  body.grounded = true;
  stepBody(body, { left: false, right: false, jumpPressed: false, jumpHeld: true }, 1 / 60, floor);
  assert.ok(body.vy < 0, "the buffered jump did not fire");
});

test("running right accelerates and stops at the cap", () => {
  const body = standOnFloor();
  for (let step = 0; step < 120; step += 1) {
    stepBody(body, { left: false, right: true, jumpPressed: false, jumpHeld: false }, 1 / 60, floor);
  }
  assert.ok(Math.abs(body.vx - 320) < 1, `vx settled at ${body.vx}`);
  assert.ok(body.x > 0, "the body did not move");
});

test("gravity is the number the feel depends on", () => {
  assert.equal(GRAVITY, 2600);
  assert.equal(JUMP_VELOCITY, -760);
});
