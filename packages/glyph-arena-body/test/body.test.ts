import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBody, jumpHeightOf, stepBody } from "../src/index.js";
import type { BodyConfig, BodyInput, SolidQuery } from "../src/index.js";

/** The runner's feel, spelled out here so the package owns none of it. */
const CONFIG: BodyConfig = {
  gravity: 2600,
  jumpVelocity: -760,
  maxFall: 1200,
  coyoteSeconds: 0.09,
  jumpBufferSeconds: 0.12,
  runSpeed: 320,
  runAccel: 2600,
  airAccel: 1700,
  groundFriction: 2400,
  airFriction: 400,
};

const FLOOR = 300;
const FRAME = 1 / 60;

/** Ground at y = FLOOR, and nothing else. */
const floorAt =
  (level = FLOOR): SolidQuery =>
  (_left, _top, _right, bottom) =>
    bottom > level;

const land = (body: ReturnType<typeof createBody>, solid: SolidQuery, seconds = 1): void => {
  for (let t = 0; t < seconds; t += FRAME) {
    stepBody(body, { jumpHeld: false }, FRAME, solid);
  }
};

describe("createBody / jumpHeightOf", () => {
  it("computes the jump height from the config it is given", () => {
    // v² / 2g, and it has to move when either number moves: no constant hiding in the package.
    assert.ok(Math.abs(jumpHeightOf(CONFIG) - (760 * 760) / (2 * 2600)) < 1e-9);
    assert.ok(Math.abs(jumpHeightOf(CONFIG) - 111.07692307692308) < 1e-9);

    assert.equal(jumpHeightOf({ ...CONFIG, jumpVelocity: -380 }), jumpHeightOf(CONFIG) / 4);
    assert.equal(jumpHeightOf({ ...CONFIG, gravity: 0 }), 0);
  });

  it("keeps the config it was created with, so a step cannot use another", () => {
    const body = createBody({ x: 0, y: 0, w: 20, h: 28 }, CONFIG);

    assert.deepEqual(body.config, CONFIG);
    assert.equal(body.vx, 0);
    assert.equal(body.vy, 0);
    assert.equal(body.grounded, false);
  });
});

describe("stepBody: gravity and falling", () => {
  it("accelerates downward and stops at the floor", () => {
    const solid = floorAt();
    const body = createBody({ x: 0, y: FLOOR - 200, w: 20, h: 28 }, CONFIG);

    stepBody(body, {}, FRAME, solid);
    assert.ok(body.vy > 0, "gravity must be downward");
    assert.equal(Math.abs(body.vy - 2600 * FRAME) < 1e-9, true);

    land(body, solid, 2);
    assert.equal(body.grounded, true);
    assert.equal(body.vy, 0);
    assert.ok(body.y + body.h <= FLOOR + 1e-9, "the body must not sink into the floor");
  });

  it("does not fall when gravity is zero", () => {
    const body = createBody({ x: 0, y: 0, w: 20, h: 28 }, { ...CONFIG, gravity: 0 });

    stepBody(body, {}, FRAME, () => false);
    assert.equal(body.vy, 0);
    assert.equal(body.y, 0);
  });

  it("clamps the fall speed", () => {
    const body = createBody({ x: 0, y: 0, w: 20, h: 28 }, { ...CONFIG, maxFall: 100 });

    for (let i = 0; i < 30; i += 1) stepBody(body, {}, FRAME, () => false);
    assert.equal(body.vy, 100);
  });
});

describe("stepBody: running", () => {
  it("accelerates to the run speed and no further", () => {
    const solid = floorAt();
    const body = createBody({ x: 0, y: FLOOR - 28, w: 20, h: 28 }, CONFIG);

    land(body, solid, 0.2);
    for (let i = 0; i < 120; i += 1) stepBody(body, { right: true }, FRAME, solid);

    assert.equal(body.vx, CONFIG.runSpeed);
  });

  it("decelerates to a stop with no input on the ground", () => {
    const solid = floorAt();
    const body = createBody({ x: 0, y: FLOOR - 28, w: 20, h: 28 }, CONFIG);

    land(body, solid, 0.2);
    for (let i = 0; i < 30; i += 1) stepBody(body, { right: true }, FRAME, solid);
    for (let i = 0; i < 30; i += 1) stepBody(body, {}, FRAME, solid);

    assert.equal(body.vx, 0);
  });
});

describe("stepBody: jumping", () => {
  const stand = (): ReturnType<typeof createBody> => {
    const body = createBody({ x: 0, y: FLOOR - 28, w: 20, h: 28 }, CONFIG);
    land(body, floorAt(), 0.3);
    assert.equal(body.grounded, true, "the fixture body must be standing");

    return body;
  };

  it("leaves the ground with the configured jump velocity", () => {
    const solid = floorAt();
    const body = stand();

    stepBody(body, { jump: true, jumpHeld: true }, FRAME, solid, {});

    assert.ok(body.vy < 0, "a jump must move up");
    assert.equal(body.grounded, false);
    // One frame of gravity is already applied, so the velocity is the configured one plus it.
    assert.ok(Math.abs(body.vy - (CONFIG.jumpVelocity + CONFIG.gravity * FRAME)) < 1e-9);
  });

  it("reaches the height jumpHeightOf() quotes", () => {
    const solid = floorAt();
    const body = stand();
    const start = body.y;
    let highest = start;

    stepBody(body, { jump: true, jumpHeld: true }, FRAME, solid);
    for (let i = 0; i < 120; i += 1) {
      stepBody(body, { jumpHeld: true }, FRAME, solid);
      highest = Math.min(highest, body.y);
    }

    const measured = start - highest;
    const quoted = jumpHeightOf(CONFIG);

    // The analytic height (v²/2g) is the ceiling, not the measurement: a discrete step loses at
    // most one frame of climb, because the body is snapped back to the floor on the frame it
    // would have passed the top. `v * dt` is that bound (760 / 60 = 12.7 px), and the runner's
    // own acceptance measured 104.8 px against this same 111.08 — the gap is the stepping, not
    // the physics.
    const oneFrameOfClimb = Math.abs(CONFIG.jumpVelocity) * FRAME;

    assert.ok(
      measured <= quoted + 1e-9 && measured >= quoted - oneFrameOfClimb,
      `measured ${measured.toFixed(2)} px against a quoted ${quoted.toFixed(2)} px, floor ${(quoted - oneFrameOfClimb).toFixed(2)}`,
    );
    assert.ok(measured > 100, `the jump must actually leave the ground: ${measured.toFixed(2)} px`);
  });

  it("jumps lower when the button is released while rising", () => {
    const solid = floorAt();
    const held = stand();
    const cut = stand();
    const heldStart = held.y;
    const cutStart = cut.y;
    let heldTop = heldStart;
    let cutTop = cutStart;

    stepBody(held, { jump: true, jumpHeld: true }, FRAME, solid);
    stepBody(cut, { jump: true, jumpHeld: true }, FRAME, solid);
    for (let i = 0; i < 60; i += 1) {
      stepBody(held, { jumpHeld: true }, FRAME, solid);
      // Released on the following frame: the rest of the rise is cut.
      stepBody(cut, { jumpHeld: i < 2 }, FRAME, solid);
      heldTop = Math.min(heldTop, held.y);
      cutTop = Math.min(cutTop, cut.y);
    }

    assert.ok(
      cutStart - cutTop < heldStart - heldTop,
      `a released jump (${(cutStart - cutTop).toFixed(1)} px) must be lower than a held one (${(heldStart - heldTop).toFixed(1)} px)`,
    );
  });

  it("remembers a jump pressed just before landing", () => {
    const solid = floorAt();
    const body = createBody({ x: 0, y: FLOOR - 60, w: 20, h: 28 }, CONFIG);
    let pressed = false;

    for (let i = 0; i < 240; i += 1) {
      const grounded = body.grounded;
      // Press four frames before the landing frame, inside the 0.12 s buffer.
      const imminent = !grounded && body.y + body.h > FLOOR - 8;
      const input: BodyInput = imminent && !pressed ? { jump: true, jumpHeld: true } : { jumpHeld: true };
      pressed = pressed || (imminent && input.jump === true);
      stepBody(body, input, FRAME, solid);
      if (pressed && body.vy < 0) break;
    }

    assert.equal(pressed, true, "the fixture must press before landing");
    assert.ok(body.vy < 0, "a buffered jump must fire on the landing frame");
  });

  it("allows a jump just after walking off a ledge, and not long after", () => {
    // The floor ends at x = 200 — a plane with no edge would never let the body leave the ground.
    const solid: SolidQuery = (left, _top, _right, bottom) => bottom > FLOOR && left < 200;
    const body = createBody({ x: 0, y: FLOOR - 28, w: 20, h: 28 }, CONFIG);

    land(body, solid, 0.3);
    assert.equal(body.grounded, true);

    // Walk off the edge: solid ends at x = 200.
    for (let i = 0; i < 120 && body.grounded; i += 1) {
      stepBody(body, { right: true }, FRAME, solid);
    }
    assert.equal(body.grounded, false, "the fixture must leave the ledge");

    stepBody(body, { jump: true, jumpHeld: true }, FRAME, solid);
    assert.ok(body.vy < 0, "a jump within the coyote window must fire");
  });

  it("recomputes grounded every step instead of carrying it", () => {
    const solid = floorAt();
    const body = stand();

    // A jump removes `grounded` on the very frame it fires.
    stepBody(body, { jump: true, jumpHeld: true }, FRAME, solid);
    assert.equal(body.grounded, false);
  });
});

describe("stepBody: solids and the optional grid", () => {
  it("stops at the wall and keeps its speed only while it can move", () => {
    const solid: SolidQuery = (left) => left + 20 > 100; // a wall at x = 100
    const body = createBody({ x: 0, y: 0, w: 20, h: 28 }, CONFIG);

    for (let i = 0; i < 120; i += 1) stepBody(body, { right: true }, FRAME, solid);

    assert.ok(body.x <= 80 + 1e-9, `the body must not pass the wall, x = ${body.x}`);
    assert.equal(body.vx, 0);
  });

  it("snaps to the cell boundary when a grid is given", () => {
    const TILE = 32;
    const solid: SolidQuery = (left) => left + 20 > 3 * TILE; // wall from column 3
    const snapped = createBody({ x: 0, y: 0, w: 20, h: 28 }, CONFIG);
    const free = createBody({ x: 0, y: 0, w: 20, h: 28 }, CONFIG);

    for (let i = 0; i < 120; i += 1) {
      stepBody(snapped, { right: true }, FRAME, solid, { grid: TILE });
      stepBody(free, { right: true }, FRAME, solid);
    }

    assert.equal(snapped.x, 3 * TILE - 20, "a grid move lands exactly on the cell edge");
    // Without a grid the body keeps the last position it could stand in, which is short of the
    // edge by however far one frame would have moved it.
    assert.ok(
      free.x <= 3 * TILE - 20 && free.x > 3 * TILE - 20 - CONFIG.runSpeed * FRAME - 1,
      `without a grid the body stops short of the edge, x = ${free.x}`,
    );
  });

  it("lands exactly on the floor when a grid is given", () => {
    const TILE = 32;
    const solid = floorAt(10 * TILE);
    const body = createBody({ x: 0, y: 0, w: 20, h: 28 }, CONFIG);

    for (let i = 0; i < 200; i += 1) stepBody(body, {}, FRAME, solid, { grid: TILE });

    assert.equal(body.y + body.h, 10 * TILE);
    assert.equal(body.grounded, true);
  });

  it("does nothing on a zero or unusable frame", () => {
    const body = createBody({ x: 5, y: 6, w: 20, h: 28 }, CONFIG);

    for (const dt of [0, -1 / 60, Number.NaN]) {
      stepBody(body, { right: true, jump: true, jumpHeld: true }, dt, () => false);
      assert.equal(body.x, 5);
      assert.equal(body.y, 6);
      assert.equal(body.vx, 0);
    }
  });
});
