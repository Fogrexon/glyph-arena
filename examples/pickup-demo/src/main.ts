import { createActions } from "@fogrexon/glyph-arena-actions";
import { createAssets } from "@fogrexon/glyph-arena-assets";
import { createAudio } from "@fogrexon/glyph-arena-audio";
import { createCamera } from "@fogrexon/glyph-arena-camera";
import { overlaps, type Aabb } from "@fogrexon/glyph-arena-collide";
import { createDraw } from "@fogrexon/glyph-arena-draw";
import { createWorld, type Entity } from "@fogrexon/glyph-arena-ecs";
import { createGamepad, type GamepadState } from "@fogrexon/glyph-arena-gamepad";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";
import { createReset } from "@fogrexon/glyph-arena-reset";
import { fitToWindow, measureCanvas, toCanvasPoint } from "@fogrexon/glyph-arena-screen";
import { createForest, type Node } from "@fogrexon/glyph-arena-scene";
import { createTimer } from "@fogrexon/glyph-arena-timer";
import { createTouchControls, type TouchZone } from "@fogrexon/glyph-arena-touch";
import { createTransform, type Matrix2D } from "@fogrexon/glyph-arena-transform";
import { createTween } from "@fogrexon/glyph-arena-tween";

type Matrix6 = [number, number, number, number, number, number];

type Phase = "title" | "play" | "result";

/**
 * Read-only mirror of the run in `window.__pickupState`, refreshed every frame.
 *
 * The HUD and the field are canvas pixels, so an E2E can only guess at them from colours and
 * draw calls. This is the game's own numbers, for anything that has to assert on movement.
 */
type PickupState = {
  phase: Phase;
  ready: boolean;
  worldX: number | null;
  worldY: number | null;
  speed: number;
  roundTime: number;
  /** False before the player entity exists; a null `worldX` with this true would be a bug. */
  hasPlayer: boolean;
};

type EntityKind = "player" | "gem" | "wall" | "hazard";

type Drawable = {
  entity: Entity;
  node: Node;
  image: CanvasImageSource;
  width: number;
  height: number;
};

type PickupFx = {
  entity: Entity;
  node: Node;
  tweenHandle: number;
  spawn: { x: number; y: number };
};

const PLAYER_SIZE = 28;
const ITEM_SIZE = 20;
const HAZARD_SIZE = 32;
const HAZARD_SPEED = 80;
const WALL_SPRITE_SIZE = 64;
const MOVE_SPEED = 180;
const DASH_DURATION = 0.15;
const DASH_SPEED = 360;
const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 900;
const PICKUP_ZOOM = 1.18;
const PICKUP_ZOOM_DURATION = 0.18;
const PUNCH_DISTANCE = 8;
const PUNCH_DURATION = 0.12;
const PICKUP_FX_LOCAL_Y = -24;
const PICKUP_FX_SCALE_DURATION = 0.2;
const GEM_SPAWN_SCALE_DURATION = 0.2;
const GEM_IDLE_INTERVAL = 0.4;
const GEM_IDLE_SCALE_MIN = 1;
const GEM_IDLE_SCALE_MAX = 1.12;
const GAMEPAD_DEADZONE = 0.25;
const ROUND_SECONDS = 60;
const INITIAL_LIVES = 3;
const INVULN_SECONDS = 1;
/** How far a hit shoves the player away from the hazard (px, capped by walls). */
const HIT_KNOCKBACK = 44;
/** Blink rate while the player is invulnerable; the sprite alternates between these two alphas. */
const HIT_BLINK_HZ = 10;
const HIT_BLINK_ALPHA = 0.3;
/** Hazards stay put for this long after the round starts (and after R), so the first hit is not a surprise. */
const HAZARD_GRACE_SECONDS = 3;
/** On-screen d-pad for touch devices: offset from the bottom-left corner and its drawn radius. */
const TOUCH_PAD_MARGIN = 104;
const TOUCH_PAD_RADIUS = 64;
/**
 * The circle that answers a touch, which is 2.5x the disc that is drawn. This is feel, not geometry:
 * the thumb covers the disc it is aiming at, so a target the size of the drawing is a target you
 * miss. Named rather than inlined because "why 160" has to have an answer.
 */
const TOUCH_PAD_REACH = TOUCH_PAD_RADIUS * 2.5;
/** Movement smaller than this is no direction at all. */
const TOUCH_PAD_DEADZONE = 14;
/**
 * How long a press survives after the last frame that saw the finger. The pad is sampled once per
 * frame, so a tap that lands and lifts between two frames is not down at any sample.
 */
const TOUCH_HOLD_MS = 150;

const COMPONENT_KIND = "kind";
const COMPONENT_AABB = "aabb";

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const canvas: HTMLCanvasElement = canvasEl;

/** Touch UI only exists where the device reports touch, so desktop rendering is unchanged. */
const touchEnabled = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("2D canvas context unavailable");
}

const ctx: CanvasRenderingContext2D = context;

function createRectSprite(
  width: number,
  height: number,
  fill: string,
  stroke?: string,
): CanvasImageSource {
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = width;
  spriteCanvas.height = height;

  const spriteContext = spriteCanvas.getContext("2d");
  if (spriteContext === null) {
    throw new Error("2D sprite canvas context unavailable");
  }

  spriteContext.fillStyle = fill;
  spriteContext.fillRect(0, 0, width, height);

  if (stroke !== undefined) {
    spriteContext.strokeStyle = stroke;
    spriteContext.lineWidth = 2;
    spriteContext.strokeRect(1, 1, width - 2, height - 2);
  }

  return spriteCanvas;
}

function matrixToArgs(matrix: Matrix2D): Matrix6 {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
}

function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function composeViewAndWorld(view: Matrix2D, world: Matrix2D): Matrix6 {
  const composed = multiplyMatrices(view, world);
  return matrixToArgs(composed);
}

function nodeAabb(x: number, y: number, width: number, height: number): Aabb {
  return { x, y, width, height };
}

function playerCenterFromAabb(aabb: Aabb): { x: number; y: number } {
  return {
    x: aabb.x + aabb.width / 2,
    y: aabb.y + aabb.height / 2,
  };
}

function aabbCenter(aabb: Aabb): { x: number; y: number } {
  return {
    x: aabb.x + aabb.width / 2,
    y: aabb.y + aabb.height / 2,
  };
}

function playerAabbAtCenter(x: number, y: number): Aabb {
  return nodeAabb(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
}

function getAabb(entity: Entity, world: ReturnType<typeof createWorld>): Aabb {
  const aabb = world.get(entity, COMPONENT_AABB);
  if (aabb === undefined || typeof aabb !== "object" || aabb === null) {
    throw new Error("Entity missing aabb component");
  }
  return aabb as Aabb;
}

function setAabb(entity: Entity, world: ReturnType<typeof createWorld>, aabb: Aabb): void {
  world.set(entity, COMPONENT_AABB, aabb);
}

function syncTransformFromAabb(
  entity: Entity,
  node: Node,
  kind: EntityKind,
  aabb: Aabb,
  transformApi: ReturnType<typeof createTransform>,
): void {
  if (kind === "wall") {
    transformApi.set(node, {
      x: aabb.x,
      y: aabb.y,
      scaleX: aabb.width / WALL_SPRITE_SIZE,
      scaleY: aabb.height / WALL_SPRITE_SIZE,
    });
    return;
  }

  if (kind === "player") {
    const { x, y } = playerCenterFromAabb(aabb);
    transformApi.set(node, { x, y });
    return;
  }

  transformApi.set(node, { x: aabb.x, y: aabb.y });
}

function syncPlayerPositionFromAabb(
  node: Node,
  aabb: Aabb,
  transformApi: ReturnType<typeof createTransform>,
): void {
  const { x, y } = playerCenterFromAabb(aabb);
  transformApi.set(node, { x, y });
}

function updatePlayerFacing(
  node: Node,
  dx: number,
  dy: number,
  transformApi: ReturnType<typeof createTransform>,
): void {
  if (dx !== 0 || dy !== 0) {
    transformApi.set(node, { rotation: Math.atan2(dx, -dy) });
  }
}

function applyDeadzone(value: number): number {
  if (Math.abs(value) < GAMEPAD_DEADZONE) {
    return 0;
  }
  return value;
}

function gamepadDirections(pad: GamepadState): {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
} {
  const axisX = applyDeadzone(pad.axes[0] ?? 0);
  const axisY = applyDeadzone(pad.axes[1] ?? 0);
  const buttons = pad.buttons;

  return {
    left: axisX < 0 || (buttons[14] ?? false),
    right: axisX > 0 || (buttons[15] ?? false),
    up: axisY < 0 || (buttons[12] ?? false),
    down: axisY > 0 || (buttons[13] ?? false),
  };
}

function padHasInput(pad: GamepadState): boolean {
  const directions = gamepadDirections(pad);
  return directions.left || directions.right || directions.up || directions.down;
}

/**
 * The zones, in canvas pixels — the same units `toCanvasPoint` puts the pointers in. `screen` is the
 * whole canvas: the title is "tap anywhere", and a phone user should not have to find a corner.
 */
function touchZones(): Record<string, TouchZone> {
  return {
    move: {
      kind: "circle",
      x: TOUCH_PAD_MARGIN,
      y: canvas.height - TOUCH_PAD_MARGIN,
      radius: TOUCH_PAD_REACH,
      deadZone: TOUCH_PAD_DEADZONE,
    },
    screen: { kind: "rect", x: 0, y: 0, w: canvas.width, h: canvas.height },
  };
}

/**
 * The old version of this was a hand-rolled `hypot` against `TOUCH_PAD_RADIUS * 2.5` with a
 * per-axis dead zone, and it looked at "the first pointer" — which on a two-thumb phone is whichever
 * thumb landed first. The pads are the library's now: it owns the hit test, the dead zone, and which
 * finger a stick is following.
 */
let touch = createTouchControls({ zones: touchZones(), holdMs: TOUCH_HOLD_MS });

async function main(): Promise<void> {
  const assetBase = import.meta.env.BASE_URL;

  const assets = createAssets();
  const audio = createAudio();
  const draw = createDraw({ context: ctx });
  const forest = createForest();
  const transform = createTransform();
  const camera = createCamera();
  const timer = createTimer();
  const tween = createTween();
  const world = createWorld();
  const gamepad = createGamepad();

  const entityNodes = new Map<Entity, Node>();
  const wallEntities: Entity[] = [];
  const hazardEntities: Entity[] = [];
  const gemEntities: Entity[] = [];
  const pickupFxGems: PickupFx[] = [];
  const gemIdleHandles = new Map<Entity, number>();
  const gemIdleTargetScale = new Map<Entity, number>();
  const gemSpawnHandles = new Map<Entity, number>();
  const respawnTimerHandles: number[] = [];

  let playerImage: CanvasImageSource = createRectSprite(
    PLAYER_SIZE,
    PLAYER_SIZE,
    "#4cc9f0",
    "#7dd3fc",
  );
  let gemImage: CanvasImageSource = createRectSprite(ITEM_SIZE, ITEM_SIZE, "#f9e076", "#fbbf24");
  let wallImage: CanvasImageSource = createRectSprite(
    WALL_SPRITE_SIZE,
    WALL_SPRITE_SIZE,
    "#3d4451",
    "#6b7280",
  );
  const hazardImage: CanvasImageSource = createRectSprite(
    HAZARD_SIZE,
    HAZARD_SIZE,
    "#e63946",
    "#ff6b6b",
  );
  let pickupBuffer: AudioBuffer | null = null;

  try {
    playerImage = await assets.loadImage(`${assetBase}player.png`);
  } catch {
    // color-rect fallback
  }

  try {
    gemImage = await assets.loadImage(`${assetBase}gem.png`);
  } catch {
    // color-rect fallback
  }

  try {
    wallImage = await assets.loadImage(`${assetBase}wall.png`);
  } catch {
    // color-rect fallback
  }

  try {
    const bytes = await assets.loadBytes(`${assetBase}pickup.wav`);
    pickupBuffer = await audio.decode(bytes);
  } catch {
    pickupBuffer = null;
  }

  const screenRoot = forest.create();
  let titleRoot = forest.create();
  forest.setParent(titleRoot, screenRoot);

  let playRoot: Node | null = null;
  let fieldNode!: Node;
  let playerDrawable!: Drawable;
  let playerEntity!: Entity;

  let phase: Phase = "title";

  function spawnEntity(
    kind: EntityKind,
    aabb: Aabb,
    image: CanvasImageSource,
    spriteWidth: number,
    spriteHeight: number,
    parent: Node,
  ): Drawable {
    const entity = world.spawn();
    world.set(entity, COMPONENT_KIND, kind);
    world.set(entity, COMPONENT_AABB, aabb);

    const node = forest.create();
    forest.setParent(node, parent);
    entityNodes.set(entity, node);
    syncTransformFromAabb(entity, node, kind, aabb, transform);

    return {
      entity,
      node,
      image,
      width: spriteWidth,
      height: spriteHeight,
    };
  }

  const wallLayout: Array<{ x: number; y: number; width: number; height: number }> = [
    { x: 0, y: 0, width: WORLD_WIDTH, height: 32 },
    { x: 0, y: WORLD_HEIGHT - 32, width: WORLD_WIDTH, height: 32 },
    { x: 0, y: 0, width: 32, height: WORLD_HEIGHT },
    { x: WORLD_WIDTH - 32, y: 0, width: 32, height: WORLD_HEIGHT },
    { x: 280, y: 180, width: 220, height: 40 },
    { x: 660, y: 320, width: 40, height: 240 },
    { x: 180, y: 520, width: 300, height: 40 },
    { x: 760, y: 120, width: 40, height: 200 },
    { x: 420, y: 680, width: 260, height: 40 },
  ];

  let wallDrawables: Drawable[] = [];
  let hazardDrawables: Drawable[] = [];

  /**
   * Fixed play-field hazards (deterministic; no runtime RNG).
   * Lanes cross the routes the player actually takes, and two of them run
   * straight over gems the player has to reach: H0 sweeps the spawn row,
   * H1 runs the column of the north gem and H2 the column next to the east
   * gem. Hazards pass through gems (no collision), so a lane never blocks a
   * pickup - it just makes the approach a timed one. Every lane crosses open
   * floor, so standing still is punished.
   */
  /**
   * Three fixed layouts, cycled by the restart count (no RNG, so a given round
   * index always plays the same field). Layout 0 is the original field; the
   * others move both the gems and the lanes so a second round is not remembered
   * from the first, while every lane still runs over a gem the player wants.
   */
  const LAYOUTS: Array<{
    items: ReadonlyArray<{ x: number; y: number }>;
    hazards: ReadonlyArray<{ x: number; y: number }>;
    velocities: ReadonlyArray<{ vx: number; vy: number }>;
  }> = [
    {
      items: [
        { x: 140, y: 140 },
        { x: 520, y: 220 },
        { x: 900, y: 180 },
        { x: 340, y: 420 },
        { x: 780, y: 520 },
        { x: 200, y: 720 },
        { x: 980, y: 700 },
        { x: 560, y: 760 },
      ],
      hazards: [
        { x: 300, y: 434 },
        { x: 530, y: 96 },
        { x: 820, y: 96 },
      ],
      velocities: [
        { vx: HAZARD_SPEED, vy: 0 },
        { vx: 0, vy: HAZARD_SPEED },
        { vx: 0, vy: HAZARD_SPEED },
      ],
    },
    {
      items: [
        { x: 160, y: 300 },
        { x: 560, y: 140 },
        { x: 940, y: 240 },
        { x: 320, y: 620 },
        { x: 880, y: 560 },
        { x: 240, y: 800 },
        { x: 700, y: 760 },
        { x: 480, y: 440 },
      ],
      hazards: [
        { x: 300, y: 440 },
        { x: 930, y: 96 },
        { x: 470, y: 96 },
      ],
      velocities: [
        { vx: HAZARD_SPEED, vy: 0 },
        { vx: 0, vy: HAZARD_SPEED },
        { vx: 0, vy: HAZARD_SPEED },
      ],
    },
    {
      items: [
        { x: 120, y: 200 },
        { x: 480, y: 120 },
        { x: 820, y: 220 },
        { x: 1080, y: 420 },
        { x: 360, y: 600 },
        { x: 180, y: 800 },
        { x: 640, y: 820 },
        { x: 1000, y: 620 },
      ],
      hazards: [
        { x: 110, y: 190 },
        { x: 584, y: 96 },
        { x: 360, y: 610 },
      ],
      velocities: [
        { vx: 0, vy: HAZARD_SPEED },
        { vx: 0, vy: HAZARD_SPEED },
        { vx: HAZARD_SPEED, vy: 0 },
      ],
    },
  ];


  const hazardVelocities = new Map<Entity, { vx: number; vy: number }>();

  let layoutIndex = 0;
  let itemSpawns: Array<{ x: number; y: number }> = LAYOUTS[0].items.map((item) => ({ ...item }));
  let hazardSpawnList: Array<{ x: number; y: number }> = LAYOUTS[0].hazards.map((hazard) => ({ ...hazard }));
  let hazardVelocityList: Array<{ vx: number; vy: number }> = LAYOUTS[0].velocities.map((velocity) => ({
    ...velocity,
  }));
  const GEM_TOTAL = LAYOUTS[0].items.length;

  /** Applies a layout by index (wrapped) and remembers which one is live. */
  function applyLayout(index: number): void {
    layoutIndex = index % LAYOUTS.length;
    const layout = LAYOUTS[layoutIndex];
    itemSpawns = layout.items.map((item) => ({ ...item }));
    hazardSpawnList = layout.hazards.map((hazard) => ({ ...hazard }));
    hazardVelocityList = layout.velocities.map((velocity) => ({ ...velocity }));
  }

  function startGemIdlePulse(entity: Entity): void {
    gemIdleTargetScale.set(entity, GEM_IDLE_SCALE_MIN);
    const handle = timer.every(GEM_IDLE_INTERVAL, () => {
      const current = gemIdleTargetScale.get(entity) ?? GEM_IDLE_SCALE_MIN;
      gemIdleTargetScale.set(
        entity,
        current === GEM_IDLE_SCALE_MIN ? GEM_IDLE_SCALE_MAX : GEM_IDLE_SCALE_MIN,
      );
    });
    gemIdleHandles.set(entity, handle);
  }

  function cancelGemIdlePulse(entity: Entity): void {
    const handle = gemIdleHandles.get(entity);
    if (handle !== undefined) {
      timer.cancel(handle);
      gemIdleHandles.delete(entity);
    }
    gemIdleTargetScale.delete(entity);
  }

  function cancelGemSpawnTween(entity: Entity): void {
    const handle = gemSpawnHandles.get(entity);
    if (handle !== undefined) {
      tween.cancel(handle);
      gemSpawnHandles.delete(entity);
    }
  }

  function spawnGem(spawn: { x: number; y: number }): Drawable {
    const drawable = spawnEntity(
      "gem",
      nodeAabb(spawn.x, spawn.y, ITEM_SIZE, ITEM_SIZE),
      gemImage,
      ITEM_SIZE,
      ITEM_SIZE,
      fieldNode,
    );
    gemEntities.push(drawable.entity);
    transform.set(drawable.node, { scaleX: 0, scaleY: 0 });
    const handle = tween.to(0, 1, GEM_SPAWN_SCALE_DURATION);
    gemSpawnHandles.set(drawable.entity, handle);
    return drawable;
  }

  function createFieldContent(): void {
    for (const wall of wallLayout) {
      const drawable = spawnEntity(
        "wall",
        nodeAabb(wall.x, wall.y, wall.width, wall.height),
        wallImage,
        wall.width,
        wall.height,
        fieldNode,
      );
      wallEntities.push(drawable.entity);
      wallDrawables.push(drawable);
    }

    for (const spawn of itemSpawns) {
      spawnGem(spawn);
    }

    for (let hazardIndex = 0; hazardIndex < hazardSpawnList.length; hazardIndex += 1) {
      const spawn = hazardSpawnList[hazardIndex];
      const drawable = spawnEntity(
        "hazard",
        nodeAabb(spawn.x, spawn.y, HAZARD_SIZE, HAZARD_SIZE),
        hazardImage,
        HAZARD_SIZE,
        HAZARD_SIZE,
        fieldNode,
      );
      hazardEntities.push(drawable.entity);
      hazardDrawables.push(drawable);
      const initialVelocity = hazardVelocityList[hazardIndex];
      if (initialVelocity === undefined) {
        throw new Error("Missing hazard initial velocity");
      }
      hazardVelocities.set(drawable.entity, { ...initialVelocity });
    }
  }

  const playerCenterX = WORLD_WIDTH / 2;
  const playerCenterY = WORLD_HEIGHT / 2;

  let score = 0;
  let pickupZoomHandle: number | null = null;
  let cameraZoomResetTimerHandle: number | null = null;
  let punchXHandle: number | null = null;
  let punchYHandle: number | null = null;
  let punchX = 0;
  let punchY = 0;
  let audioResumed = false;

  async function ensureAudioResumed(): Promise<void> {
    if (!audioResumed) {
      await audio.resume();
      audioResumed = true;
    }
  }

  window.addEventListener(
    "keydown",
    () => {
      void ensureAudioResumed();
    },
    { once: true },
  );

  // The zones are canvas pixels, so they change when the canvas does. Rebuilding throws away a press
  // in flight, which a resize can afford and a frame cannot.
  fitToWindow(canvas, window, {
    onResize: () => {
      touch = createTouchControls({ zones: touchZones(), holdMs: TOUCH_HOLD_MS });
    },
  });

  const input = createInput();
  input.attach(window);

  const actions = createActions();
  actions.bind("moveLeft", ["ArrowLeft"]);
  actions.bind("moveRight", ["ArrowRight"]);
  actions.bind("moveUp", ["ArrowUp"]);
  actions.bind("moveDown", ["ArrowDown"]);
  actions.bind("start", ["Space", "Enter"]);
  actions.bind("restart", ["KeyR"]);
  actions.bind("pause", ["KeyP"]);
  actions.bind("zoomIn", ["Equal", "NumpadAdd"]);
  actions.bind("zoomOut", ["Minus", "NumpadSubtract"]);
  actions.bind("zoomReset", ["Digit0", "Numpad0"]);
  actions.bind("rotateCCW", ["KeyQ"]);
  actions.bind("rotateCW", ["KeyE"]);
  actions.bind("rotateReset", ["KeyT"]);
  actions.bind("dash", ["ShiftLeft"]);

  let baseZoom = 1;
  let baseRotation = 0;
  let paused = false;
  let cleared = false;
  /** Fastest clear of this page load, in seconds. Round-scoped on purpose: nothing is persisted. */
  let bestClearSeconds: number | null = null;
  /** Clear time of the round that just ended, or null if the round did not clear. */
  let lastClearSeconds: number | null = null;
  let lastClearWasBest = false;
  let failed = false;
  let roundRemaining = ROUND_SECONDS;
  let scheduleSeconds = 0;
  let roundTimerHandle: number | null = null;
  let pickupSeHandle: number | null = null;
  let lives = INITIAL_LIVES;
  /** Schedule time (pre–`scheduleSeconds += delta` each frame) until hazard damage is ignored. */
  let invulnerableUntil = 0;
  /** Schedule time until the move-speed dash burst ends (`scheduleSeconds < dashUntil`). */
  let dashUntil = 0;
  let invulnerabilityTimerHandle: number | null = null;
  /** `scheduleSeconds` when the current round was armed; the hazard grace window is measured from here. */
  let roundStartedAt = 0;

  /**
   * What a **round** owns, registered next to the state it resets.
   *
   * There were two entry points into a round — `beginPlayFromTitle` and `restart` — and each wrote
   * its own list of the same assignments. They had already drifted: the title path cleared `paused`
   * and the restart path did not, and only the restart path cancelled a punch tween in flight. That
   * is the shape CAMP lost `dodge` to, twice over. Both paths call `reset.run()` now.
   *
   * `armRoundTimer` is the last entry on purpose: it is the round's own start (it clears `failed`,
   * `roundRemaining`, `roundStartedAt` and the last-clear line, then starts the clock), so it has to
   * run after the fields it reads.
   */
  const reset = createReset();
  reset.add("round", () => {
    clearInvulnerability();
    cancelPickupPunchTweens();
    punchX = 0;
    punchY = 0;
    score = 0;
    lives = INITIAL_LIVES;
    cleared = false;
    failed = false;
    paused = false;
    dashUntil = 0;
    baseZoom = 1;
    baseRotation = 0;
    camera.set({ zoom: 1, rotation: 0 });
  });
  reset.add("clock", () => {
    armRoundTimer();
  });
  reset.add("effects", () => {
    // The title path never cleared these: a zoom tween left over from the last round would drive
    // the first frame of the next one. The teardown in `restart()` clears them too; the reset is
    // what makes clearing them the *same* act on both paths.
    if (pickupZoomHandle !== null) {
      tween.cancel(pickupZoomHandle);
      pickupZoomHandle = null;
    }
    if (cameraZoomResetTimerHandle !== null) {
      timer.cancel(cameraZoomResetTimerHandle);
      cameraZoomResetTimerHandle = null;
    }
  });

  function cancelRoundTimer(): void {
    if (roundTimerHandle !== null) {
      timer.cancel(roundTimerHandle);
      roundTimerHandle = null;
    }
  }

  function armRoundTimer(): void {
    failed = false;
    cancelRoundTimer();
    roundRemaining = ROUND_SECONDS;
    roundStartedAt = scheduleSeconds;
    lastClearSeconds = null;
    lastClearWasBest = false;
    roundTimerHandle = timer.delay(ROUND_SECONDS, () => {
      roundTimerHandle = null;
      if (!cleared) {
        failed = true;
      }
    });
  }

  function onRoundCleared(): void {
    cleared = true;
    failed = false;
    cancelRoundTimer();
    lastClearSeconds = ROUND_SECONDS - roundRemaining;
    if (bestClearSeconds === null || lastClearSeconds < bestClearSeconds) {
      bestClearSeconds = lastClearSeconds;
      lastClearWasBest = true;
    } else {
      lastClearWasBest = false;
    }
  }

  function failRound(): void {
    failed = true;
    cancelRoundTimer();
  }

  function isInvulnerable(): boolean {
    return scheduleSeconds < invulnerableUntil;
  }

  function isHazardGraceActive(): boolean {
    return scheduleSeconds < roundStartedAt + HAZARD_GRACE_SECONDS;
  }

  function clearInvulnerability(): void {
    if (invulnerabilityTimerHandle !== null) {
      timer.cancel(invulnerabilityTimerHandle);
      invulnerabilityTimerHandle = null;
    }
    invulnerableUntil = 0;
  }

  function startInvulnerability(): void {
    if (invulnerabilityTimerHandle !== null) {
      timer.cancel(invulnerabilityTimerHandle);
      invulnerabilityTimerHandle = null;
    }
    invulnerableUntil = scheduleSeconds + INVULN_SECONDS;
    invulnerabilityTimerHandle = timer.delay(INVULN_SECONDS, () => {
      invulnerabilityTimerHandle = null;
    });
  }

  function playerOverlapsAnyHazard(playerBox: Aabb): boolean {
    for (const hazardEntity of hazardEntities) {
      const hazardAabb = getAabb(hazardEntity, world);
      if (overlaps(playerBox, hazardAabb)) {
        return true;
      }
    }
    return false;
  }

  function applyHazardDamage(playerBox: Aabb): void {
    if (phase !== "play" || cleared || failed || paused || isInvulnerable()) {
      return;
    }
    if (!playerOverlapsAnyHazard(playerBox)) {
      return;
    }

    lives -= 1;
    if (lives <= 0) {
      failRound();
      return;
    }
    startInvulnerability();
    knockPlayerAwayFromHazard(playerBox);
  }

  /**
   * Pushes the player away from the hazard they touched so a hit has a visible
   * consequence: without it the player keeps standing on the hazard and the only
   * feedback is the life counter going down.
   */
  function knockPlayerAwayFromHazard(playerBox: Aabb): void {
    const playerCenter = playerCenterFromAabb(playerBox);
    let awayX = 0;
    let awayY = 0;
    for (const hazardEntity of hazardEntities) {
      const hazardBox = getAabb(hazardEntity, world);
      if (!overlaps(playerBox, hazardBox)) {
        continue;
      }
      const hazardCenter = aabbCenter(hazardBox);
      awayX += playerCenter.x - hazardCenter.x;
      awayY += playerCenter.y - hazardCenter.y;
    }

    const length = Math.hypot(awayX, awayY);
    if (length === 0) {
      return;
    }

    const walls = wallAABBs();
    for (const distance of [HIT_KNOCKBACK, HIT_KNOCKBACK / 2]) {
      const nextCenter = {
        x: playerCenter.x + (awayX / length) * distance,
        y: playerCenter.y + (awayY / length) * distance,
      };
      const candidate = playerAabbAtCenter(nextCenter.x, nextCenter.y);
      if (!collidesWithWalls(candidate, walls)) {
        setAabb(playerEntity, world, candidate);
        syncPlayerPositionFromAabb(playerDrawable.node, candidate, transform);
        transform.set(playerDrawable.node, { scaleX: 1, scaleY: 1 });
        return;
      }
    }
  }

  function wallAABBs(): Aabb[] {
    return wallEntities.map((entity) => getAabb(entity, world));
  }

  function collidesWithWalls(aabb: Aabb, walls: Aabb[]): boolean {
    for (const wall of walls) {
      if (overlaps(aabb, wall)) {
        return true;
      }
    }
    return false;
  }

  function resolveHazardPenetrationX(aabb: Aabb, walls: Aabb[]): Aabb {
    let resolved = aabb;
    for (const wall of walls) {
      if (!overlaps(resolved, wall)) {
        continue;
      }
      const boxCenterX = resolved.x + resolved.width / 2;
      const wallCenterX = wall.x + wall.width / 2;
      if (boxCenterX < wallCenterX) {
        resolved = { ...resolved, x: wall.x - resolved.width };
      } else {
        resolved = { ...resolved, x: wall.x + wall.width };
      }
    }
    return resolved;
  }

  function resolveHazardPenetrationY(aabb: Aabb, walls: Aabb[]): Aabb {
    let resolved = aabb;
    for (const wall of walls) {
      if (!overlaps(resolved, wall)) {
        continue;
      }
      const boxCenterY = resolved.y + resolved.height / 2;
      const wallCenterY = wall.y + wall.height / 2;
      if (boxCenterY < wallCenterY) {
        resolved = { ...resolved, y: wall.y - resolved.height };
      } else {
        resolved = { ...resolved, y: wall.y + wall.height };
      }
    }
    return resolved;
  }

  function moveHazards(delta: number, walls: Aabb[]): void {
    for (const hazardEntity of hazardEntities) {
      const velocity = hazardVelocities.get(hazardEntity);
      const node = entityNodes.get(hazardEntity);
      if (velocity === undefined || node === undefined) {
        continue;
      }

      let { vx, vy } = velocity;
      let aabb = getAabb(hazardEntity, world);

      if (vx !== 0) {
        const nextX = aabb.x + vx * delta;
        const tentative = { ...aabb, x: nextX };
        if (collidesWithWalls(tentative, walls)) {
          vx = -vx;
          aabb = resolveHazardPenetrationX(aabb, walls);
        } else {
          aabb = tentative;
        }
      }

      if (vy !== 0) {
        const nextY = aabb.y + vy * delta;
        const tentative = { ...aabb, y: nextY };
        if (collidesWithWalls(tentative, walls)) {
          vy = -vy;
          aabb = resolveHazardPenetrationY(aabb, walls);
        } else {
          aabb = tentative;
        }
      }

      hazardVelocities.set(hazardEntity, { vx, vy });
      setAabb(hazardEntity, world, aabb);
      syncTransformFromAabb(hazardEntity, node, "hazard", aabb, transform);
    }
  }

  function removeGemFromCollideTargets(entity: Entity): void {
    const index = gemEntities.indexOf(entity);
    if (index !== -1) {
      gemEntities.splice(index, 1);
    }
  }

  function finishPickupFx(fx: PickupFx): void {
    world.despawn(fx.entity);
    forest.destroy(fx.node);
    entityNodes.delete(fx.entity);
    transform.clear(fx.node);
  }

  function cancelPickupPunchTweens(): void {
    if (punchXHandle !== null) {
      tween.cancel(punchXHandle);
      punchXHandle = null;
    }
    if (punchYHandle !== null) {
      tween.cancel(punchYHandle);
      punchYHandle = null;
    }
  }

  function updatePunchOffsetsFromTweens(): void {
    if (punchXHandle !== null) {
      const value = tween.get(punchXHandle);
      punchX = value !== undefined ? value : 0;
    } else {
      punchX = 0;
    }
    if (punchYHandle !== null) {
      const value = tween.get(punchYHandle);
      punchY = value !== undefined ? value : 0;
    } else {
      punchY = 0;
    }
  }

  function playPickupPunch(
    playerCx: number,
    playerCy: number,
    gemCx: number,
    gemCy: number,
  ): void {
    cancelPickupPunchTweens();

    const toGemX = gemCx - playerCx;
    const toGemY = gemCy - playerCy;
    const length = Math.hypot(toGemX, toGemY);
    let peakX: number;
    let peakY: number;
    if (length === 0) {
      peakX = 0;
      peakY = -PUNCH_DISTANCE;
    } else {
      peakX = (-toGemX / length) * PUNCH_DISTANCE;
      peakY = (-toGemY / length) * PUNCH_DISTANCE;
    }

    punchXHandle = tween.to(peakX, 0, PUNCH_DURATION);
    punchYHandle = tween.to(peakY, 0, PUNCH_DURATION);
  }

  function startPickupFx(gemEntity: Entity, spawn: { x: number; y: number }): void {
    cancelGemSpawnTween(gemEntity);
    cancelGemIdlePulse(gemEntity);
    removeGemFromCollideTargets(gemEntity);
    score += 1;
    if (score >= GEM_TOTAL) {
      onRoundCleared();
    }
    void playPickupSound();

    const playerAabb = getAabb(playerEntity, world);
    const gemAabb = getAabb(gemEntity, world);
    const { x: playerCx, y: playerCy } = playerCenterFromAabb(playerAabb);
    const { x: gemCx, y: gemCy } = aabbCenter(gemAabb);
    playPickupZoom();
    playPickupPunch(playerCx, playerCy, gemCx, gemCy);

    const node = entityNodes.get(gemEntity);
    if (node === undefined) {
      return;
    }

    forest.setParent(node, playerDrawable.node);
    transform.set(node, { x: 0, y: PICKUP_FX_LOCAL_Y, scaleX: 1, scaleY: 1 });

    const tweenHandle = tween.to(1, 0, PICKUP_FX_SCALE_DURATION);
    pickupFxGems.push({ entity: gemEntity, node, tweenHandle, spawn });
  }

  async function playPickupSound(): Promise<void> {
    if (pickupBuffer === null) {
      return;
    }
    await ensureAudioResumed();
    pickupSeHandle = audio.play(pickupBuffer);
  }

  function isPickupZoomTweenActive(): boolean {
    if (pickupZoomHandle === null) {
      return false;
    }
    return tween.get(pickupZoomHandle) !== undefined;
  }

  function playPickupZoom(): void {
    if (pickupZoomHandle !== null) {
      tween.cancel(pickupZoomHandle);
    }
    if (cameraZoomResetTimerHandle !== null) {
      timer.cancel(cameraZoomResetTimerHandle);
      cameraZoomResetTimerHandle = null;
    }

    const peakZoom = baseZoom * PICKUP_ZOOM;
    pickupZoomHandle = tween.to(camera.get().zoom, peakZoom, PICKUP_ZOOM_DURATION);
    cameraZoomResetTimerHandle = timer.delay(PICKUP_ZOOM_DURATION, () => {
      cameraZoomResetTimerHandle = null;
      if (pickupZoomHandle !== null) {
        tween.cancel(pickupZoomHandle);
        pickupZoomHandle = null;
      }
      camera.set({ zoom: baseZoom });
    });
  }

  function applyGemSpawnScales(): void {
    for (const [entity, handle] of [...gemSpawnHandles.entries()]) {
      const node = entityNodes.get(entity);
      if (node === undefined) {
        gemSpawnHandles.delete(entity);
        continue;
      }
      const scaleValue = tween.get(handle);
      if (scaleValue !== undefined) {
        transform.set(node, { scaleX: scaleValue, scaleY: scaleValue });
        continue;
      }
      gemSpawnHandles.delete(entity);
      transform.set(node, { scaleX: GEM_IDLE_SCALE_MIN, scaleY: GEM_IDLE_SCALE_MIN });
      startGemIdlePulse(entity);
    }
  }

  function applyGemIdleScales(): void {
    for (const gemEntity of gemEntities) {
      const node = entityNodes.get(gemEntity);
      const targetScale = gemIdleTargetScale.get(gemEntity);
      if (node === undefined || targetScale === undefined) {
        continue;
      }
      transform.set(node, { scaleX: targetScale, scaleY: targetScale });
    }
  }

  function restart(): void {
    cancelRoundTimer();
    clearInvulnerability();

    const midFxGems = [...pickupFxGems];

    for (const fx of midFxGems) {
      tween.cancel(fx.tweenHandle);
    }
    pickupFxGems.length = 0;

    for (const handle of respawnTimerHandles) {
      timer.cancel(handle);
    }
    respawnTimerHandles.length = 0;

    for (const handle of gemIdleHandles.values()) {
      timer.cancel(handle);
    }
    gemIdleHandles.clear();
    gemIdleTargetScale.clear();

    for (const handle of gemSpawnHandles.values()) {
      tween.cancel(handle);
    }
    gemSpawnHandles.clear();

    if (pickupZoomHandle !== null) {
      tween.cancel(pickupZoomHandle);
      pickupZoomHandle = null;
    }
    if (cameraZoomResetTimerHandle !== null) {
      timer.cancel(cameraZoomResetTimerHandle);
      cameraZoomResetTimerHandle = null;
    }

    for (const fx of midFxGems) {
      world.despawn(fx.entity);
      forest.destroy(fx.node);
      entityNodes.delete(fx.entity);
      transform.clear(fx.node);
    }

    for (const entity of wallEntities) {
      const node = entityNodes.get(entity);
      world.despawn(entity);
      entityNodes.delete(entity);
      if (node !== undefined) {
        transform.clear(node);
      }
    }
    wallEntities.length = 0;

    for (const entity of gemEntities) {
      const node = entityNodes.get(entity);
      world.despawn(entity);
      entityNodes.delete(entity);
      if (node !== undefined) {
        transform.clear(node);
      }
    }
    gemEntities.length = 0;

    for (const entity of hazardEntities) {
      const node = entityNodes.get(entity);
      world.despawn(entity);
      entityNodes.delete(entity);
      hazardVelocities.delete(entity);
      if (node !== undefined) {
        transform.clear(node);
      }
    }
    hazardEntities.length = 0;
    hazardDrawables = [];

    wallDrawables = [];

    forest.destroy(fieldNode);

    applyLayout(layoutIndex + 1);
    fieldNode = forest.create();
    forest.setParent(fieldNode, playRoot!);
    createFieldContent();

    const initialPlayerAabb = playerAabbAtCenter(playerCenterX, playerCenterY);
    setAabb(playerEntity, world, initialPlayerAabb);
    syncTransformFromAabb(
      playerEntity,
      playerDrawable.node,
      "player",
      initialPlayerAabb,
      transform,
    );
    transform.set(playerDrawable.node, { scaleX: 1, scaleY: 1, rotation: 0 });

    reset.run();
  }

  function destroyTitleSubtree(): void {
    forest.destroy(titleRoot);
  }

  function createPlaySubtree(): void {
    playRoot = forest.create();
    forest.setParent(playRoot, screenRoot);
    fieldNode = forest.create();
    forest.setParent(fieldNode, playRoot);
    playerDrawable = spawnEntity(
      "player",
      playerAabbAtCenter(playerCenterX, playerCenterY),
      playerImage,
      PLAYER_SIZE,
      PLAYER_SIZE,
      playRoot,
    );
    playerEntity = playerDrawable.entity;
    transform.set(playerDrawable.node, { rotation: 0 });
    createFieldContent();
  }

  function beginPlayFromTitle(): void {
    destroyTitleSubtree();
    applyLayout(0);
    createPlaySubtree();
    reset.run();
    phase = "play";
  }

  function drawWorldSprite(drawable: Drawable, viewMatrix: Matrix2D): void {
    const worldMatrix = transform.world(drawable.node, forest.parent);
    const [a, b, c, d, e, f] = composeViewAndWorld(viewMatrix, worldMatrix);
    ctx.setTransform(a, b, c, d, e, f);
    draw.sprite({
      image: drawable.image,
      x: 0,
      y: 0,
      width: drawable.width,
      height: drawable.height,
    });
  }

  function drawPlayerSprite(drawable: Drawable, viewMatrix: Matrix2D): void {
    const worldMatrix = transform.world(drawable.node, forest.parent);
    const [a, b, c, d, e, f] = composeViewAndWorld(viewMatrix, worldMatrix);
    ctx.setTransform(a, b, c, d, e, f);
    const half = PLAYER_SIZE / 2;
    // Blink while invulnerable so the hit reads as "you were hit", not "the counter moved".
    const blinking =
      isInvulnerable() && Math.floor(scheduleSeconds * HIT_BLINK_HZ * 2) % 2 === 0;
    draw.sprite({
      image: drawable.image,
      x: -half,
      y: -half,
      width: drawable.width,
      height: drawable.height,
      alpha: blinking ? HIT_BLINK_ALPHA : 1,
    });
  }

  function drawWallSprite(wall: Drawable, viewMatrix: Matrix2D): void {
    const worldMatrix = transform.world(wall.node, forest.parent);
    const [a, b, c, d, e, f] = composeViewAndWorld(viewMatrix, worldMatrix);
    ctx.setTransform(a, b, c, d, e, f);
    draw.sprite({
      image: wall.image,
      x: 0,
      y: 0,
    });
  }

  function drawPickupFxGem(fx: PickupFx, viewMatrix: Matrix2D): void {
    const worldMatrix = transform.world(fx.node, forest.parent);
    const [a, b, c, d, e, f] = composeViewAndWorld(viewMatrix, worldMatrix);
    ctx.setTransform(a, b, c, d, e, f);
    draw.sprite({
      image: gemImage,
      x: 0,
      y: 0,
      width: ITEM_SIZE,
      height: ITEM_SIZE,
    });
  }

  function updatePickupFx(): void {
    for (let index = pickupFxGems.length - 1; index >= 0; index -= 1) {
      const fx = pickupFxGems[index];
      const scaleValue = tween.get(fx.tweenHandle);
      if (scaleValue !== undefined) {
        transform.set(fx.node, { scaleX: scaleValue, scaleY: scaleValue });
        continue;
      }

      finishPickupFx(fx);
      pickupFxGems.splice(index, 1);
    }
  }

  function drawTouchPad(): void {
    if (!touchEnabled) {
      return;
    }

    const centerX = TOUCH_PAD_MARGIN;
    const centerY = canvas.height - TOUCH_PAD_MARGIN;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#e8eaed";
    ctx.beginPath();
    ctx.arc(centerX, centerY, TOUCH_PAD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9aa0a6";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 26, centerY);
    ctx.lineTo(centerX + 26, centerY);
    ctx.moveTo(centerX, centerY - 26);
    ctx.lineTo(centerX, centerY + 26);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  let lastPublishedX: number | null = null;
  let lastPublishedY: number | null = null;
  let lastPublishedDelta = 0;

  /** Publishes the run for anything that is not a human looking at the canvas. */
  function publishPickupState(delta: number): void {
    let worldX: number | null = null;
    let worldY: number | null = null;
    let speed = 0;
    if (playerEntity !== undefined) {
      const center = playerCenterFromAabb(getAabb(playerEntity, world));
      worldX = center.x;
      worldY = center.y;
      if (lastPublishedX !== null && lastPublishedY !== null && lastPublishedDelta > 0) {
        speed = Math.hypot(center.x - lastPublishedX, center.y - lastPublishedY) / lastPublishedDelta;
      }
      lastPublishedX = center.x;
      lastPublishedY = center.y;
      lastPublishedDelta = delta;
    }
    (window as typeof window & { __pickupState?: PickupState }).__pickupState = {
      phase,
      ready: isHazardGraceActive(),
      hasPlayer: playerEntity !== undefined,
      worldX,
      worldY,
      speed,
      roundTime: roundRemaining,
    };
  }

  const loop = createLoop({
    onFrame(time) {
      const pads = gamepad.snapshot();
      const pad = pads[0];
      // The loop's default step is already 0.1 (a backgrounded tab cannot spend the round clock).
      const delta = time.delta;
      publishPickupState(delta);

      const snapshot = input.snapshot();
      const keys = new Set(snapshot.keys);
      // Every pointer, converted once per frame: the pad answers "is a finger on me", so it needs
      // the whole set, not the first one that happened to land.
      const measured = measureCanvas(canvas);
      touch.update(
        snapshot.pointers.map((point) => ({ ...toCanvasPoint(point, measured.box, measured.size), id: point.id })),
        delta,
      );
      if (touchEnabled) {
        if (phase === "title") {
          // The start action is bound to Space; a tap rides the same binding instead of adding a new one.
          if (touch.down("screen")) {
            keys.add("Space");
          }
        } else {
          // Eight-way: the two axes are independent, so a diagonal push moves diagonally like the
          // arrows do. The dead zone is the zone's, not this loop's.
          const stick = touch.axis("move");
          if (stick.x < 0) {
            keys.add("ArrowLeft");
          }
          if (stick.x > 0) {
            keys.add("ArrowRight");
          }
          if (stick.y < 0) {
            keys.add("ArrowUp");
          }
          if (stick.y > 0) {
            keys.add("ArrowDown");
          }
        }
      }
      if (phase === "play" && pad !== undefined) {
        const directions = gamepadDirections(pad);
        if (directions.left) {
          keys.add("ArrowLeft");
        }
        if (directions.right) {
          keys.add("ArrowRight");
        }
        if (directions.up) {
          keys.add("ArrowUp");
        }
        if (directions.down) {
          keys.add("ArrowDown");
        }
      }

      const query = actions.tick(keys);

      if (phase === "title") {
        if (query.pressed("start")) {
          beginPlayFromTitle();
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        draw.clear("#0f1115");
        ctx.fillStyle = "#e8eaed";
        ctx.font = "28px system-ui, sans-serif";
        ctx.fillText("Pickup", 16, 48);
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillStyle = "#e8eaed";
        ctx.fillText(`Collect ${GEM_TOTAL} gems in ${ROUND_SECONDS}s — ${INITIAL_LIVES} lives`, 16, 84);
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillStyle = "#9aa0a6";
        ctx.fillText(
          touchEnabled
            ? "Drag the pad to move — tapping starts"
            : "Arrows / gamepad move · Shift dash · R restart",
          16,
          110,
        );
        ctx.fillStyle = "#fbbf24";
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillText(touchEnabled ? "Tap — start" : "Space / Enter — start", 16, 146);
        return;
      }

      if (pad !== undefined && !audioResumed && padHasInput(pad)) {
        void ensureAudioResumed();
      }

      let baseZoomChangedThisFrame = false;
      let baseRotationChangedThisFrame = false;

      if (query.pressed("restart")) {
        paused = false;
        cleared = false;
        failed = false;
        restart();
        phase = "play";
      } else {
        if (query.pressed("pause") && phase === "play" && !cleared && !failed) {
          if (!paused) {
            if (pickupSeHandle !== null) {
              audio.stop(pickupSeHandle);
              pickupSeHandle = null;
            }
          }
          paused = !paused;
        }

        if (query.pressed("zoomReset")) {
          baseZoom = 1;
          baseZoomChangedThisFrame = true;
        } else if (query.pressed("zoomIn") && query.pressed("zoomOut")) {
          // same-frame in+out: apply neither
        } else if (query.pressed("zoomIn")) {
          baseZoom = Math.min(2, baseZoom + 0.1);
          baseZoomChangedThisFrame = true;
        } else if (query.pressed("zoomOut")) {
          baseZoom = Math.max(0.5, baseZoom - 0.1);
          baseZoomChangedThisFrame = true;
        }

        if (query.pressed("rotateReset")) {
          baseRotation = 0;
          baseRotationChangedThisFrame = true;
        } else if (query.pressed("rotateCCW") && query.pressed("rotateCW")) {
          // same-frame CCW+CW: apply neither
        } else if (query.pressed("rotateCCW")) {
          baseRotation = Math.min(Math.PI / 4, baseRotation + Math.PI / 36);
          baseRotationChangedThisFrame = true;
        } else if (query.pressed("rotateCW")) {
          baseRotation = Math.max(-Math.PI / 4, baseRotation - Math.PI / 36);
          baseRotationChangedThisFrame = true;
        }
      }

      if (!paused) {
        let nextPlayerAabb = getAabb(playerEntity, world);

        if (phase === "play" && !cleared && !failed) {
          const left = query.down("moveLeft");
          const right = query.down("moveRight");
          const up = query.down("moveUp");
          const down = query.down("moveDown");

          let dx = 0;
          let dy = 0;

          if (left) dx -= 1;
          if (right) dx += 1;
          if (up) dy -= 1;
          if (down) dy += 1;

          if (dx !== 0 && dy !== 0) {
            const length = Math.hypot(dx, dy);
            dx /= length;
            dy /= length;
          }

          const playerAabb = nextPlayerAabb;
          const { x: playerX, y: playerY } = playerCenterFromAabb(playerAabb);
          const walls = wallAABBs();
          let nextX = playerX;
          let nextY = playerY;

          if (dx !== 0 || dy !== 0) {
            const moveSpeed = scheduleSeconds < dashUntil ? DASH_SPEED : MOVE_SPEED;
            const stepX = dx * moveSpeed * delta;
            const stepY = dy * moveSpeed * delta;

            const tentativeX = playerX + stepX;
            if (!collidesWithWalls(playerAabbAtCenter(tentativeX, playerY), walls)) {
              nextX = tentativeX;
            }

            const tentativeY = playerY + stepY;
            if (!collidesWithWalls(playerAabbAtCenter(nextX, tentativeY), walls)) {
              nextY = tentativeY;
            }
          }

          nextPlayerAabb = playerAabbAtCenter(nextX, nextY);
          setAabb(playerEntity, world, nextPlayerAabb);
          syncPlayerPositionFromAabb(playerDrawable.node, nextPlayerAabb, transform);
          updatePlayerFacing(playerDrawable.node, dx, dy, transform);

          const playerBox = nextPlayerAabb;
          for (const gemEntity of [...gemEntities]) {
            const gemAabb = getAabb(gemEntity, world);
            if (overlaps(playerBox, gemAabb)) {
              startPickupFx(gemEntity, { x: gemAabb.x, y: gemAabb.y });
            }
          }

          if (!cleared && !failed && !isHazardGraceActive()) {
            moveHazards(delta, walls);
            applyHazardDamage(playerBox);
          }
        }

        if (
          phase === "play" &&
          !cleared &&
          !failed &&
          !query.pressed("restart") &&
          query.pressed("dash") &&
          scheduleSeconds >= dashUntil
        ) {
          dashUntil = scheduleSeconds + DASH_DURATION;
        }

        scheduleSeconds += delta;

        if (phase === "play" && !cleared && !failed) {
          roundRemaining = Math.max(0, roundRemaining - delta);
        }

        timer.tick(scheduleSeconds);
        tween.tick(scheduleSeconds);

        if (phase === "play" && (cleared || failed)) {
          phase = "result";
        }

        applyGemSpawnScales();
        applyGemIdleScales();

        updatePickupFx();
        updatePunchOffsetsFromTweens();

        if (isPickupZoomTweenActive()) {
          const zoomValue = tween.get(pickupZoomHandle!);
          if (zoomValue !== undefined) {
            camera.set({ zoom: zoomValue });
          }
        } else {
          camera.set({ zoom: baseZoom });
        }

        const { x: cameraX, y: cameraY } = playerCenterFromAabb(nextPlayerAabb);
        camera.set({
          x: cameraX + punchX,
          y: cameraY + punchY,
          rotation: baseRotation,
        });
      } else {
        if (baseZoomChangedThisFrame && !isPickupZoomTweenActive()) {
          camera.set({ zoom: baseZoom });
        }
        if (baseRotationChangedThisFrame) {
          camera.set({ rotation: baseRotation });
        }
      }

      const viewWidth = canvas.width;
      const viewHeight = canvas.height;
      const viewMatrix = camera.view(viewWidth, viewHeight);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      draw.clear("#0f1115");

      for (const wall of wallDrawables) {
        drawWallSprite(wall, viewMatrix);
      }

      for (const gemEntity of gemEntities) {
        const node = entityNodes.get(gemEntity);
        if (node === undefined) {
          continue;
        }
        drawWorldSprite(
          {
            entity: gemEntity,
            node,
            image: gemImage,
            width: ITEM_SIZE,
            height: ITEM_SIZE,
          },
          viewMatrix,
        );
      }

      for (const hazard of hazardDrawables) {
        drawWorldSprite(hazard, viewMatrix);
      }

      drawPlayerSprite(playerDrawable, viewMatrix);

      for (const fx of pickupFxGems) {
        drawPickupFxGem(fx, viewMatrix);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#e8eaed";
      ctx.font = "20px system-ui, sans-serif";
      if (phase === "play") {
        ctx.fillStyle = "#e8eaed";
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText(`Score: ${score}/${GEM_TOTAL}`, 16, 32);
        ctx.fillStyle = "#e8eaed";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText(`Lives: ${lives}`, 16, 54);
        const showRoundTime = !cleared && !failed;
        let controlsY = 74;
        if (showRoundTime) {
          ctx.fillText(`Time: ${roundRemaining.toFixed(1)}`, 16, 76);
          controlsY = 96;
        }
        ctx.fillStyle = "#9aa0a6";
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillText(
          "Arrows / gamepad — gems; Shift dash; =/+ zoom in, - out, 0 reset; Q/E/T camera rotate CCW/CW/reset; P pause; R restart (R wins)",
          16,
          controlsY,
        );
        const statusY = showRoundTime ? 120 : 100;
        if (paused) {
          ctx.fillStyle = "#fbbf24";
          ctx.font = "20px system-ui, sans-serif";
          ctx.fillText("PAUSED", 16, statusY);
        } else if (isHazardGraceActive()) {
          ctx.fillStyle = "#9aa0a6";
          ctx.font = "20px system-ui, sans-serif";
          ctx.fillText("READY", 16, statusY);
        }
      } else if (phase === "result") {
        ctx.fillStyle = "#e8eaed";
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText(`Score: ${score}/${GEM_TOTAL}`, 16, 32);
        ctx.fillStyle = "#e8eaed";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText(`Lives: ${lives}`, 16, 54);
        ctx.fillText(`Time: ${roundRemaining.toFixed(1)}`, 16, 76);
        if (cleared && lastClearSeconds !== null) {
          ctx.fillText(`Clear: ${lastClearSeconds.toFixed(1)}s`, 16, 98);
        }
        if (bestClearSeconds !== null) {
          ctx.fillText(`Best: ${bestClearSeconds.toFixed(1)}s`, 16, cleared ? 120 : 98);
        }
        ctx.fillStyle = "#fbbf24";
        ctx.font = "20px system-ui, sans-serif";
        const verdictY = cleared ? (bestClearSeconds !== null ? 142 : 120) : (bestClearSeconds !== null ? 120 : 98);
        if (cleared) {
          ctx.fillText(lastClearWasBest ? "CLEAR — NEW BEST — R restart" : "CLEAR — R restart", 16, verdictY);
        } else if (failed) {
          ctx.fillText("FAIL — R restart", 16, verdictY);
        }
      }

      drawTouchPad();
    },
  });

  loop.start();
}

void main();
