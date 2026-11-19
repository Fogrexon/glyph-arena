/**
 * The vertical slice: one level, run and jump, die on a spike, come back where you were.
 *
 * Only the loop and the input are borrowed; every pixel is drawn here, so the look
 * is a decision and not a leftover. The numbers that decide how the jump feels live
 * in `physics.ts`; this file is camera, drawing, sound, death and the state mirror.
 */
import { createActions } from "@fogrexon/glyph-arena-actions";
import { chaseTarget } from "@fogrexon/glyph-arena-chase";
import { createDraw } from "@fogrexon/glyph-arena-draw";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";
import { createReset } from "@fogrexon/glyph-arena-reset";
import { fitToWindow, measureCanvas, toCanvasPoint } from "@fogrexon/glyph-arena-screen";
import { visibleColumns } from "@fogrexon/glyph-arena-tilemap";
import { createTouchControls, type TouchZone } from "@fogrexon/glyph-arena-touch";

import { TILE, chaseSpawnLane, currentLevel, currentMap, goalLineX, hazardWithin, isHazardTile, isSolidTile, levelColumns, levelCount, levelRows, loadLevel, patrolRange, solidAt, spawnPoint, surfaceBelow } from "./level";
import { CHASE } from "./enemy";
import { GRAVITY, createBody, jumpHeight, stepBody, type Body } from "./physics";

type Phase = "title" | "play" | "dead" | "goal";

/** How a run ended. `enemy` is the walker; the slice's spikes and pits are the other two. */
type DeathCause = "pit" | "spike" | "enemy";

/**
 * One death, as a level-designer reads it: where in the world, what killed you, how far into
 * the run. "Where did the player die" is the question that decides whether the next unit adds a
 * second level or lengthens the first, and a memory of the answer is not data.
 */
type DeathRecord = { x: number; cause: DeathCause; simMs: number };

/** Read-only mirror of the run, so a harness never has to guess from the pixels. */
type RunnerState = {
  phase: Phase;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  deaths: number;
  /** Every death this page session, oldest first. `deaths` is still the count. */
  deathLog: DeathRecord[];
  /** Milliseconds left in the death pause; 0 outside it. */
  respawnInMs: number;
  cameraX: number;
  goalX: number;
  worldWidth: number;
  /** 1-based level number and how many there are, so a harness can see a clear happen. */
  level: number;
  levelCount: number;
  /** Milliseconds of play in this run, so J1-J4 can be measured against it. */
  simMs: number;
  /**
   * Where a death sends you back to. Published because the rule about it — "a respawn is never
   * within 96 px of what killed you" — cannot be checked from outside while the value it uses is
   * invisible (QA had to infer it from `x` and found a 4.2 px overlap nobody could see). The
   * distance is not published: the e2e measures it from the level grid and the unit test measures
   * it directly, and a second copy here would be a second thing that can go green alone.
   */
  safe: { x: number; y: number };
  /** Jump physics, published so a harness can pin the feel without reading the source. */
  jumpHeight: number;
  gravity: number;
  /**
   * Every walker on the level, always an array. One walker today, and the next unit brings a
   * chaser that walks and pursues — so the shape is a list from the start and `mode` says which
   * behaviour it is, rather than renaming a single object the day a second one appears.
   */
  enemies: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    dir: number;
    mode: "patrol" | "chase";
    speed: number;
    minX: number;
    maxX: number;
  }>;
};

/**
 * The height the game is laid out in: HUD text, touch buttons and the camera's vertical framing are
 * sized against 540, and `scale()` maps that to whatever the window is.
 *
 * Not a screen scale — `screenScale` answers a different question (bitmap pixels per CSS pixel) and
 * is 1 on both axes here, because `fitToWindow` gives the canvas a bitmap the size of the window.
 */
const LOGICAL_HEIGHT = 540;
const RESPAWN_SECONDS = 0.6;

/** The palette: one place, so the slice cannot drift into a pile of stray colours. */
const PALETTE = {
  skyTop: "#0d1626",
  skyMid: "#1d3a5c",
  skyLow: "#6d93b8",
  moon: "#fdf3d0",
  ground: "#3c5a46",
  groundCap: "#9ad48f",
  spike: "#f06272",
  player: "#f4f6f8",
  outline: "#0d1626",
  scarf: "#ffb703",
  enemy: "#c05a8e",
  /** The pursuer, once it is actually chasing. */
  accent: "#ff9f43",
  hud: "rgba(232, 234, 237, 0.85)",
};

const found = document.querySelector<HTMLCanvasElement>("#game");
if (found === null) {
  throw new Error("no canvas");
}
const canvas: HTMLCanvasElement = found;
const context2d = canvas.getContext("2d");
if (context2d === null) {
  throw new Error("no 2d context");
}
const ctx: CanvasRenderingContext2D = context2d;
/**
 * The library owns the map from world to screen. Every world pixel below is drawn at its *world*
 * coordinate and the projection does the multiply — the runner used to write
 * `(column * TILE - cameraX) * s` at each call site, and the difference between that and
 * `x * s - cameraX * s` is invisible at scale 1 and not at 1.296, where the e2e:pixel scene
 * `runner-scale` looks.
 */
const paint = createDraw({ context: ctx });

function hazardAt(body: Body): boolean {
  return hazardWithin(body.x, body.y, body.w, body.h);
}

let spawn = spawnPoint();
let goal = { x: goalLineX(), y: 0 };
let worldWidth = levelColumns() * TILE;
let worldHeight = levelRows() * TILE;
/** 0-based index of the level being played. `levelCount()` comes from level.ts. */
let level = currentLevel();
/** Seconds the "LEVEL 2" banner stays up after a clear, so the transition is visible. */
let levelBannerSeconds = 0;

let phase: Phase = "title";
let body = createBody(spawn.x + 6, spawn.y - 28, 20, 28);
let cameraX = 0;
let deaths = 0;
/** Every death this page session, oldest first — read by the result screen and the harness. */
const deathLog: DeathRecord[] = [];
let respawnSeconds = 0;
let clock = 0;
let simSeconds = 0;
/** The last place the runner stood safely: a death returns there. */
let safe = { x: body.x, y: body.y };

/**
 * What a **run** owns, as opposed to what a level owns.
 *
 * A level is rebuilt by `loadLevelAt` and that has always been one path. The run's own clock was
 * not: the title screen zeroed `simSeconds` by hand and the goal screen — "run it again" — did not,
 * so a second run started with the previous run's clock and every jump in it was measured against a
 * time that had already run out. Two entry points into a run, one of them stale: the shape
 * `@fogrexon/glyph-arena-reset` exists for. `scripts/runner-reset.test.mjs` fails if either path
 * stops calling `reset.run()`, or if the clock is zeroed anywhere else.
 */
const reset = createReset();
reset.add("clock", () => {
  simSeconds = 0;
});
reset.add("respawn", () => {
  respawnSeconds = 0;
});

/**
 * How much clear ground a respawn point needs around it: 300 ms of running at 320 px/s. A death
 * that returns you 5 px from the thing that killed you is the same trap, just slower to reach.
 * The rule lives here and in `hazardWithin` (level.ts) so the unit test can check it without a
 * browser; it is deliberately not published — the e2e measures it from the level grid instead, so
 * there is one place where "96 px" is true.
 */
const SAFE_CLEARANCE = 96;

// ---------------------------------------------------------------- sound

type Blip = "jump" | "land" | "death";
let audio: AudioContext | null = null;

function ensureAudio(): void {
  if (audio === null) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;
    audio = new Ctor();
  }
  if (audio.state === "suspended") {
    void audio.resume();
  }
}

function play(blip: Blip): void {
  if (audio === null) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "triangle";
  const settings =
    blip === "jump"
      ? { from: 420, to: 700, length: 0.11, volume: 0.05 }
      : blip === "land"
        ? { from: 220, to: 120, length: 0.08, volume: 0.06 }
        : { from: 320, to: 60, length: 0.32, volume: 0.08 };
  oscillator.frequency.setValueAtTime(settings.from, now);
  oscillator.frequency.exponentialRampToValueAtTime(settings.to, now + settings.length);
  gain.gain.setValueAtTime(settings.volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + settings.length + 0.02);
}

// ---------------------------------------------------------------- run state

/**
 * Load a level and put the runner on it. One function, because "which level is the game on"
 * is exactly the kind of state that drifts when half of it is set in a goal handler.
 */
function loadLevelAt(index: number): void {
  loadLevel(index);
  level = index;
  spawn = spawnPoint();
  goal = { x: goalLineX(), y: 0 };
  worldWidth = levelColumns() * TILE;
  worldHeight = levelRows() * TILE;
  enemies = makeEnemies();
  body = createBody(spawn.x + 6, spawn.y - 28, 20, 28);
  safe = { x: body.x, y: body.y };
  cameraX = 0;
  levelBannerSeconds = index === 0 ? 0 : 1.6;
}

function respawn(atSafe: boolean): void {
  // Enemies go back to their start. Without this a pursuer stands on the safe spot and kills you
  // the frame you come back: the same trap as a respawn inside a spike, one layer up. It also
  // keeps "try that jump again" honest — the thing that killed you is where you first met it.
  enemies = makeEnemies();
  const x = atSafe ? safe.x : spawn.x + 6;
  const y = atSafe ? safe.y : spawn.y - 28;
  body = createBody(x, y, 20, 28);
  if (atSafe) {
    // The runner comes back standing where they last stood. Say so on the first frame: a fresh body
    // reports `grounded: false` until physics runs, and the state mirror is what the acceptance reads.
    body.grounded = true;
  }
  respawnSeconds = 0;
  if (!atSafe) {
    cameraX = 0;
  }
}

function die(cause: DeathCause): void {
  deaths += 1;
  deathLog.push({ x: Math.round(body.x), cause, simMs: Math.round(simSeconds * 1000) });
  phase = "dead";
  respawnSeconds = RESPAWN_SECONDS;
  play("death");
}

// ---------------------------------------------------------------- input

const input = createInput();
input.attach(window);
const actions = createActions();
actions.bind("left", ["ArrowLeft", "KeyA"]);
actions.bind("right", ["ArrowRight", "KeyD"]);
actions.bind("jump", ["Space", "ArrowUp", "KeyW", "KeyZ"]);
actions.bind("retry", ["Escape"]);
actions.bind("title", ["KeyR"]);

const TOUCH = {
  size: 72,
  inset: 24,
  /**
   * How long a press counts after the last frame that saw the finger, in ms. Without this a tap
   * that lands and lifts inside one frame is invisible, and the harness has to hold every press
   * for 150 ms — which is a longer press than the player ever makes.
   */
  holdMs: 150,
};

const scale = (): number => canvas.height / LOGICAL_HEIGHT;
const viewWidth = (): number => canvas.width / scale();

type Rect = { x: number; y: number; w: number; h: number };

/** Touch buttons in canvas pixels, resolved from the drawing each frame. */
function touchButtons(): { left: Rect; right: Rect; jump: Rect } {
  const s = scale();
  const size = TOUCH.size * s * 0.9;
  const inset = TOUCH.inset * s;
  const bottom = canvas.height - inset - size;
  return {
    left: { x: inset, y: bottom, w: size, h: size },
    right: { x: inset + size + 12 * s, y: bottom, w: size, h: size },
    jump: { x: canvas.width - inset - size, y: bottom, w: size, h: size },
  };
}

/**
 * The pads, in canvas pixels — the same units `toCanvasPoint` puts the pointers in. `screen` is the
 * whole canvas: the title and the result screens are "tap anywhere", and a phone user should not have
 * to find a corner before the first move.
 */
function touchZones(): Record<string, TouchZone> {
  const buttons = touchButtons();
  return {
    left: { kind: "rect", ...buttons.left },
    right: { kind: "rect", ...buttons.right },
    jump: { kind: "rect", ...buttons.jump },
    screen: { kind: "rect", x: 0, y: 0, w: canvas.width, h: canvas.height },
  };
}

let touch = createTouchControls({ zones: touchZones(), holdMs: TOUCH.holdMs });

// The zones are canvas pixels, so they only change when the canvas does. Rebuild on resize, not on
// every frame: a rebuild drops a press in flight, which a resize can afford and a frame cannot.
fitToWindow(canvas, window, {
  onResize: () => {
    touch = createTouchControls({ zones: touchZones(), holdMs: TOUCH.holdMs });
  },
});

// ---------------------------------------------------------------- drawing

function hash(n: number): number {
  const value = Math.sin(n * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

function drawSky(): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(0.55, PALETTE.skyMid);
  gradient.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = scale();
  const moonX = canvas.width * 0.78;
  const moonY = canvas.height * 0.2;
  const halo = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 120 * s);
  halo.addColorStop(0, "rgba(255, 246, 214, 0.5)");
  halo.addColorStop(1, "rgba(255, 246, 214, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PALETTE.moon;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 24 * s, 0, Math.PI * 2);
  ctx.fill();
}

/** Three layers at 0.3 / 0.6 / 1.0 of the camera: the world continues off screen. */
function drawParallax(): void {
  const s = scale();
  const layers = [
    { depth: 0.3, colour: "#16263c", base: 0.58, amplitude: 70, step: 220 },
    { depth: 0.6, colour: "#1f3a58", base: 0.7, amplitude: 40, step: 140 },
    { depth: 1.0, colour: "#2a4d72", base: 0.84, amplitude: 20, step: 90 },
  ];
  for (const layer of layers) {
    const offset = -cameraX * layer.depth;
    const horizon = canvas.height * layer.base;
    ctx.fillStyle = layer.colour;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for (let x = 0; x <= canvas.width + layer.step; x += layer.step) {
      const t = (x + offset) / layer.step;
      ctx.lineTo(x, horizon - Math.abs(Math.sin(t * 1.7)) * layer.amplitude * s);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawLevel(): void {
  // Which columns a view covers is the library's question now: `margin: 1` is the one column of
  // slack this drawing wants at each edge, and it is the caller's number, not the library's default.
  const view = visibleColumns(currentMap(), cameraX, viewWidth(), { margin: 1 });
  // One screen pixel of overlap between tiles, said in world units: the projection multiplies it
  // back, so the seam the overlap exists for stays one pixel wide at every scale.
  const overlap = 1 / scale();
  for (let column = view.first; column < view.end; column += 1) {
    for (let row = 0; row < levelRows(); row += 1) {
      const x = column * TILE;
      const y = row * TILE;
      if (isSolidTile(column, row)) {
        const shade = 0.85 + hash(column * 31 + row * 7) * 0.15;
        ctx.fillStyle = `rgb(${Math.round(60 * shade)}, ${Math.round(90 * shade)}, ${Math.round(70 * shade)})`;
        ctx.fillRect(x, y, TILE + overlap, TILE + overlap);
        if (!isSolidTile(column, row - 1)) {
          ctx.fillStyle = PALETTE.groundCap;
          ctx.fillRect(x, y, TILE + overlap, 4);
        }
      } else if (isHazardTile(column, row)) {
        ctx.fillStyle = PALETTE.spike;
        ctx.beginPath();
        for (let spike = 0; spike < 3; spike += 1) {
          const baseX = x + spike * (TILE / 3);
          ctx.moveTo(baseX, y + TILE);
          ctx.lineTo(baseX + TILE / 6, y + 5);
          ctx.lineTo(baseX + TILE / 3, y + TILE);
        }
        ctx.fill();
      }
    }
  }
  const gx = goal.x;
  const gy = 3 * TILE;
  ctx.fillStyle = "#d9dee5";
  ctx.fillRect(gx + 6, gy - 10, 3, 3.4 * TILE);
  ctx.fillStyle = PALETTE.scarf;
  ctx.beginPath();
  ctx.moveTo(gx + 9, gy - 8);
  ctx.lineTo(gx + 46, gy + 6);
  ctx.lineTo(gx + 9, gy + 20);
  ctx.closePath();
  ctx.fill();
}

/**
 * An enemy: touching it is death. `mode` is published, because "a thing patrols" and "a thing is
 * coming for you" have to be distinguishable from outside without watching the pixels — that is
 * the difference R10g checks for.
 */
type Enemy = {
  x: number;
  y: number;
  w: number;
  h: number;
  minX: number;
  maxX: number;
  dir: number;
  /** px/s right now: the patrol speed, or the pursuit speed while chasing. */
  speed: number;
  mode: "patrol" | "chase";
  /** Only level 3's pursuer may switch modes; a walker stays a walker. */
  chases: boolean;
  /** Seconds this enemy has been outside the view while chasing. */
  offScreenSeconds: number;
};

const PATROL_SPEED = 55;

/**
 * Level 3's pursuer: one tile wide, the size of the walker, starting where `chaseSpawnLane()`
 * says so the level test can guarantee the ground under it. It cannot jump, cannot fall off a
 * ledge and cannot climb, so the only way it kills you is by being where you stopped.
 */
function makeEnemies(): Enemy[] {
  const enemies: Enemy[] = [];
  const patrol = patrolRange();
  if (patrol !== null) {
    const w = 24;
    enemies.push({
      x: patrol.dir === 1 ? patrol.minX : patrol.maxX - w,
      y: 10 * TILE + 2,
      w,
      h: 26,
      minX: patrol.minX,
      maxX: patrol.maxX,
      dir: patrol.dir,
      speed: PATROL_SPEED,
      mode: "patrol",
      chases: false,
      offScreenSeconds: 0,
    });
  }
  const chaseLane = chaseSpawnLane();
  if (chaseLane !== null) {
    const w = 24;
    enemies.push({
      x: Math.round((chaseLane.startX + chaseLane.endX) / 2) - w / 2,
      y: 10 * TILE + 2,
      w,
      h: 26,
      minX: chaseLane.startX,
      maxX: chaseLane.endX - w,
      dir: -1,
      speed: CHASE.speedPxPerSecond,
      mode: "patrol",
      chases: true,
      offScreenSeconds: 0,
    });
  }
  return enemies;
}

let enemies: Enemy[] = makeEnemies();

/**
 * How far the ground one pixel ahead of an enemy's feet is from its own feet, looking **in `dir`**:
 * `0` flat, `+TILE` a lip, `-TILE` a drop, `Infinity` a hole. The library asks with the direction it
 * is about to walk, so the ground it checks and the ground it walks are the same ground.
 */
function stepAhead(enemy: Enemy, dir: -1 | 1): number {
  const aheadX = dir > 0 ? enemy.x + enemy.w + 1 : enemy.x - 1;
  const footY = enemy.y + enemy.h;
  const here = surfaceBelow(enemy.x + enemy.w / 2, footY);
  const ahead = surfaceBelow(aheadX, footY);
  if (!Number.isFinite(here) || !Number.isFinite(ahead)) {
    return Number.POSITIVE_INFINITY; // a hole: no floor to compare against
  }
  // Rows grow downwards, so a floor one row lower is a drop (negative) and one row higher is a lip.
  return (here - ahead) * TILE;
}

function stepEnemies(dt: number): void {
  for (const enemy of enemies) {
    if (enemy.chases) {
      // The rule — where the runner is, which way that is, and whether the ground ahead is floor —
      // comes from the library. What stays here is the memory: patrol, the wait, and giving up.
      const chase = chaseTarget(
        // `Enemy.dir` is a plain number because the patrol lanes come from the level; the rule
        // only knows left and right.
        { x: enemy.x, w: enemy.w, dir: enemy.dir < 0 ? -1 : 1 },
        { x: body.x, w: body.w },
        { sightPx: CHASE.sightPx, stepTolerancePx: 0 },
        (dir) => stepAhead(enemy, dir),
      );

      if (enemy.mode === "patrol") {
        if (simSeconds >= CHASE.startSeconds && chase.walkable) {
          enemy.mode = "chase";
          enemy.offScreenSeconds = 0;
          enemy.dir = chase.dir;
        }
      }
      if (enemy.mode === "chase") {
        // Off-screen is a fact about the view, not about distance: running out of sight does not
        // shake it, standing out of sight does.
        const onScreen = enemy.x + enemy.w > cameraX && enemy.x < cameraX + viewWidth();
        enemy.offScreenSeconds = onScreen ? 0 : enemy.offScreenSeconds + dt;
        if (chase.walkable && enemy.offScreenSeconds < CHASE.loseSightSeconds) {
          enemy.dir = chase.dir;
        } else {
          enemy.mode = "patrol";
          enemy.offScreenSeconds = 0;
          enemy.dir = enemy.dir > 0 ? -1 : 1; // turn back toward its own lane
        }
      }
    }
    if (enemy.mode === "chase") {
      enemy.speed = CHASE.speedPxPerSecond;
      enemy.x += enemy.dir * enemy.speed * dt;
    } else {
      enemy.speed = PATROL_SPEED;
      enemy.x += enemy.dir * enemy.speed * dt;
      if (enemy.x < enemy.minX) {
        enemy.x = enemy.minX;
        enemy.dir = 1;
      } else if (enemy.x > enemy.maxX) {
        enemy.x = enemy.maxX;
        enemy.dir = -1;
      }
    }
  }
}

function drawEnemy(enemy: Enemy): void {
  const x = enemy.x;
  const y = enemy.y;
  // A pursuer reads hotter than a walker: same silhouette, different colour, so a player can tell
  // "that one is coming" from across the level without reading the state.
  ctx.fillStyle = enemy.mode === "chase" ? PALETTE.accent : PALETTE.enemy;
  ctx.beginPath();
  ctx.roundRect(x, y, enemy.w, enemy.h, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 8, y - 8);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x + 12, y);
  ctx.lineTo(x + 17, y - 8);
  ctx.lineTo(x + 21, y - 0.5);
  ctx.fill();
  ctx.fillStyle = PALETTE.outline;
  ctx.beginPath();
  ctx.arc(x + 8, y + 10, 2, 0, Math.PI * 2);
  ctx.arc(x + 17, y + 10, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(): void {
  const air = !body.grounded;
  const moving = Math.abs(body.vx) > 12;
  const pose = air ? "air" : moving ? "run" : "idle";
  const bob = pose === "run" ? Math.sin(clock * 18) * 2 : pose === "idle" ? Math.sin(clock * 3) * 1 : 0;
  const squash = Math.max(-0.22, Math.min(0.22, body.vy / 2600));
  const width = body.w * (1 - squash * 0.5);
  const height = body.h * (1 + squash * 0.5);
  const left = body.x + (body.w - width) / 2;
  const top = body.y + (body.h - height) + bob;

  ctx.fillStyle = PALETTE.outline;
  ctx.beginPath();
  ctx.roundRect(left - 2, top - 2, width + 4, height + 4, 7);
  ctx.fill();

  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 5);
  ctx.fill();

  const facing = Math.sign(body.vx) || 1;
  ctx.fillStyle = PALETTE.scarf;
  ctx.beginPath();
  ctx.moveTo(left + width * 0.5, top + height * 0.34);
  ctx.lineTo(
    left + width * 0.5 - facing * (pose === "air" ? 22 : 14),
    top + height * 0.34 + Math.sin(clock * 10) * 3,
  );
  ctx.lineTo(left + width * 0.5, top + height * 0.56);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = PALETTE.outline;
  ctx.lineWidth = 3;
  const swing = pose === "run" ? Math.sin(clock * 18) * 4 : 0;
  ctx.beginPath();
  ctx.moveTo(left + width * 0.3, top + height);
  ctx.lineTo(left + width * 0.3 + swing, top + height + 4);
  ctx.moveTo(left + width * 0.7, top + height);
  ctx.lineTo(left + width * 0.7 - swing, top + height + 4);
  ctx.stroke();

  ctx.fillStyle = PALETTE.outline;
  const eyeY = top + height * 0.3;
  const eyeX = left + width * 0.5 + facing * 2;
  ctx.beginPath();
  ctx.arc(eyeX - 3, eyeY, 1.7, 0, Math.PI * 2);
  ctx.arc(eyeX + 3, eyeY, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawTouch(): void {
  if (!touchEnabled) return;
  const s = scale();
  const buttons = touchButtons();
  const label = (rect: Rect, text: string, held: boolean): void => {
    ctx.fillStyle = held ? "rgba(255, 183, 3, 0.35)" : "rgba(232, 234, 237, 0.12)";
    ctx.strokeStyle = "rgba(232, 234, 237, 0.3)";
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 14 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `${22 * s}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  };
  label(buttons.left, "\u25c0", touchState.left);
  label(buttons.right, "\u25b6", touchState.right);
  label(buttons.jump, "\u25b2", touchState.jump);
}

/**
 * The world through the library's projection, then the screen back.
 *
 * `offsetY` is in the projection and nowhere else: the vertical centring of a short level is part of
 * the map from world to screen, and adding it to the coordinates as well is how the first attempt at
 * this moved 129,214 pixels instead of none.
 */
function drawWorld(): void {
  const s = scale();
  const offsetY = (LOGICAL_HEIGHT - worldHeight) * 0.5;
  paint.setView({ scale: s, offsetX: -cameraX * s, offsetY: offsetY * s });
  drawLevel();
  for (const enemy of enemies) drawEnemy(enemy);
  drawPlayer();
  paint.setView(null);
}

function draw(): void {
  paint.setView(null);
  drawSky();
  drawParallax();
  drawWorld();
  const s = scale();
  if (phase === "title") {
    ctx.fillStyle = "rgba(13, 22, 38, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#e8eaed";
    ctx.font = `${30 * s}px system-ui, sans-serif`;
    ctx.fillText("Runner", 40 * s, 80 * s);
    ctx.font = `${16 * s}px system-ui, sans-serif`;
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText("Run right, jump the gaps, do not touch the spikes or the walker.", 40 * s, 116 * s);
    ctx.fillStyle = "#9aa0a6";
    ctx.fillText(
      touchEnabled ? "Left / right pads, jump on the right" : "Arrows / A D \u00b7 Space jump \u00b7 Esc retry \u00b7 R title",
      40 * s,
      142 * s,
    );
    ctx.fillStyle = PALETTE.scarf;
    ctx.font = `${18 * s}px system-ui, sans-serif`;
    ctx.fillText(touchEnabled ? "Tap \u2014 start" : "Space \u2014 start", 40 * s, 178 * s);
  } else {
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `${14 * s}px system-ui, sans-serif`;
    ctx.fillText(`deaths: ${deaths}`, 24 * s, canvas.height - 24 * s);
    if (level > 0) {
      ctx.fillText(`level ${level + 1} / ${levelCount()}`, 24 * s, canvas.height - 46 * s);
    }
    if (levelBannerSeconds > 0) {
      // The clear has to be *visible*: running into a level that looks like the last one is
      // how a player concludes the game looped instead of advanced.
      ctx.fillStyle = PALETTE.scarf;
      ctx.font = `${26 * s}px system-ui, sans-serif`;
      ctx.fillText(`LEVEL ${level + 1}`, canvas.width * 0.38, canvas.height * 0.2);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `${14 * s}px system-ui, sans-serif`;
      ctx.fillText("climb the step, clear the spikes", canvas.width * 0.38, canvas.height * 0.2 + 26 * s);
    }
  }
  if (phase === "goal") {
    ctx.fillStyle = "rgba(13, 22, 38, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = PALETTE.scarf;
    ctx.font = `${34 * s}px system-ui, sans-serif`;
    ctx.fillText("GOAL", canvas.width * 0.42, canvas.height * 0.44);
    ctx.fillStyle = "#e8eaed";
    ctx.font = `${16 * s}px system-ui, sans-serif`;
    ctx.fillText(
      touchEnabled ? `deaths: ${deaths} \u00b7 tap to run it again` : `deaths: ${deaths} \u00b7 R to run it again`,
      canvas.width * 0.42,
      canvas.height * 0.44 + 34 * s,
    );
    ctx.font = `${13 * s}px system-ui, sans-serif`;
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(lastDeathLine(), canvas.width * 0.42, canvas.height * 0.44 + 58 * s);
  }
  if (phase === "dead") {
    ctx.fillStyle = `rgba(224, 80, 96, ${Math.min(0.5, respawnSeconds / RESPAWN_SECONDS) * 0.8})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The report the player reads without opening anything: "x 1280 / pit" is the whole answer
    // to "where did I die", and it is the same string the harness reads from the log.
    ctx.fillStyle = "#f4f6f8";
    ctx.font = `${13 * s}px system-ui, sans-serif`;
    ctx.fillText(lastDeathLine(), canvas.width * 0.42, canvas.height * 0.44);
  }
  drawTouch();
}

// ---------------------------------------------------------------- loop

const touchEnabled = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
const touchState = { left: false, right: false, jump: false };

/**
 * The one line the result screen shows and a harness can read back: where the last death was,
 * what caused it, and how far into the run. A function so the screen and the log cannot drift.
 */
function lastDeathLine(): string {
  const last = deathLog.at(-1);
  if (last === undefined) return "no deaths yet";
  return `x ${last.x} / ${last.cause} \u00b7 ${(last.simMs / 1000).toFixed(1)}s`;
}

function publish(): void {
  (window as typeof window & { __runnerState?: RunnerState }).__runnerState = {
    phase,
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    grounded: body.grounded,
    deaths,
    deathLog: deathLog.map((entry) => ({ ...entry })),
    respawnInMs: Math.round(respawnSeconds * 1000),
    cameraX,
    goalX: goal.x,
    worldWidth,
    level: level + 1,
    levelCount: levelCount(),
    simMs: Math.round(simSeconds * 1000),
    jumpHeight: jumpHeight(),
    gravity: GRAVITY,
    safe: { x: safe.x, y: safe.y },
    enemies: enemies.map((enemy) => ({
      x: enemy.x,
      y: enemy.y,
      w: enemy.w,
      h: enemy.h,
      dir: enemy.dir,
      mode: enemy.mode,
      speed: enemy.speed,
      minX: enemy.minX,
      maxX: enemy.maxX,
    })),
  };
}

const loop = createLoop({
  // The body moves faster than the demo this default was measured against: one step is 1/30 s.
  maxDelta: 1 / 30,
  onFrame(time) {
    const dt = time.delta;
    clock += dt;
    const snapshot = input.snapshot();
    const keys = new Set(snapshot.keys);
    const query = actions.tick(keys);

    // One layout read for the frame, however many thumbs are on the screen.
    const measured = measureCanvas(canvas);
    // The frame's pointers and the frame's `dt`. `holdMs` is what turns a tap that lands and lifts
    // between two frames into a press the game can act on; without it the harness has to hold.
    touch.update(
      snapshot.pointers.map((point) => ({ ...toCanvasPoint(point, measured.box, measured.size), id: point.id })),
      dt,
    );
    // Movement is presence, not a press: a thumb that lifts has to stop the runner on that frame,
    // or the hold would carry it 150 ms further — over the edge it was stopping for. The jump pad
    // is the opposite case: it keeps the press, because a tap has to outlive the gap between frames.
    touchState.left = touch.down("left");
    touchState.right = touch.down("right");
    touchState.jump = touch.held("jump");
    // The title screen is one button, not the jump pad. A first-time phone user reads
    // "Tap — start" and taps the middle of the screen; asking them to find the pad in the
    // corner first is a dead first move (QA measured exactly that). The pad still starts it,
    // because a tap on the pad is also a tap on the screen.
    const tappedAnywhere = touch.down("screen");

    if (phase === "title") {
      if (query.pressed("jump") || tappedAnywhere) {
        ensureAudio();
        phase = "play";
        // A new run always starts at level 1, even if the last one died on level 2.
        loadLevelAt(0);
        levelBannerSeconds = 0;
        reset.run();
      }
      publish();
      draw();
      return;
    }

    if (query.pressed("title")) {
      phase = "title";
      publish();
      draw();
      return;
    }
    // The result screens are buttons too. A phone has no Esc and no R, so a goal screen that
    // only the keyboard can leave is the same dead end QA found on the title screen.
    if ((phase === "goal" || phase === "dead") && tappedAnywhere) {
      ensureAudio();
      if (phase === "goal") {
        // "Run it again" means this level from its start, not a respawn on the goal line —
        // respawning there would clear the level again on the next frame.
        phase = "play";
        loadLevelAt(level);
        levelBannerSeconds = 0;
        reset.run();
      } else {
        respawn(true);
        phase = "play";
      }
      publish();
      draw();
      return;
    }

    if (query.pressed("retry")) {
      phase = "play";
      respawn(true);
      publish();
      draw();
      return;
    }

    if (phase === "dead") {
      respawnSeconds = Math.max(0, respawnSeconds - dt);
      if (respawnSeconds === 0) {
        phase = "play";
        respawn(true);
      }
      publish();
      draw();
      return;
    }

    if (phase === "play") {
      simSeconds += dt;
      const wasGrounded = body.grounded;
      stepBody(
        body,
        {
          left: query.down("left") || touch.down("left"),
          right: query.down("right") || touch.down("right"),
          jumpPressed: query.pressed("jump") || touch.pressed("jump"),
          jumpHeld: query.down("jump") || touch.held("jump"),
        },
        dt,
        solidAt,
      );
      stepEnemies(dt);
      // "Grounded" is not the same as "safe", and "safe" is not the same as "far enough".
      //
      // Asking only `!hazardAt(body)` stops standing *on* a spike from becoming the respawn point,
      // but leaves the respawn 0.8 px from one — and at 5.33 px per frame, holding right killed the
      // player on the next frame anyway. The interval between deaths stretched from 17 ms to
      // 600 ms and the trap stayed exactly where it was.
      //
      // 96 px of clear ground is 300 ms at MOVE_SPEED (320 px/s): enough to see the hazard, choose
      // and act. Until the runner has stood somewhere that clear, the safe spot stays where it was
      // (the level's spawn, set at load) — which is the "fall back to the spawn" half of the rule.
      if (body.grounded && body.vy === 0 && hazardWithin(body.x, body.y, body.w, body.h, SAFE_CLEARANCE) === false) {
        safe = { x: body.x, y: body.y };
      }
      if (!wasGrounded && body.grounded) {
        play("land");
      }
      if (query.pressed("jump") || touch.pressed("jump")) {
        ensureAudio();
        play("jump");
      }

      const hitEnemy = enemies.some(
        (enemy) =>
          body.x < enemy.x + enemy.w &&
          body.x + body.w > enemy.x &&
          body.y < enemy.y + enemy.h &&
          body.y + body.h > enemy.y,
      );
      // The cause is recorded, not just the fact: "died 3 times" says nothing about the level,
      // "died twice at x 1280 in the pit" says where to put the next platform.
      if (hazardAt(body)) {
        die("spike");
      } else if (hitEnemy) {
        die("enemy");
      } else if (body.y > worldHeight + 240) {
        die("pit");
      } else if (body.x + body.w > goal.x) {
        // Clearing a level runs straight into the next one: the run is the unit, not the level.
        if (level + 1 < levelCount()) {
          loadLevelAt(level + 1);
        } else {
          phase = "goal";
        }
      }

      levelBannerSeconds = Math.max(0, levelBannerSeconds - dt);

      const target = Math.max(0, Math.min(worldWidth - viewWidth(), body.x - viewWidth() * 0.33 + body.vx * 0.12));
      cameraX += (target - cameraX) * Math.min(1, dt * 8);
    }

    publish();
    draw();
  },
});

loop.start();
