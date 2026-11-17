/**
 * The vertical slice: one level, run and jump, die on a spike, come back where you were.
 *
 * Only the loop and the input are borrowed; every pixel is drawn here, so the look
 * is a decision and not a leftover. The numbers that decide how the jump feels live
 * in `physics.ts`; this file is camera, drawing, sound, death and the state mirror.
 */
import { createActions } from "@fogrexon/glyph-arena-actions";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";

import { TILE, currentLevel, goalLineX, isHazardTile, isSolidTile, levelColumns, levelCount, levelRows, loadLevel, spawnPoint } from "./level";
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
  /** Jump physics, published so a harness can pin the feel without reading the source. */
  jumpHeight: number;
  gravity: number;
};

const LOGICAL_HEIGHT = 540;
const MAX_FRAME_DELTA = 1 / 30;
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

/** Every solid tile the rectangle touches. Outside the level is empty sky. */
function solidAt(left: number, top: number, right: number, bottom: number): boolean {
  for (let row = Math.floor(top / TILE); row <= Math.floor((bottom - 0.001) / TILE); row += 1) {
    for (let column = Math.floor(left / TILE); column <= Math.floor((right - 0.001) / TILE); column += 1) {
      if (isSolidTile(column, row)) return true;
    }
  }
  return false;
}

function hazardAt(body: Body): boolean {
  for (let row = Math.floor(body.y / TILE); row <= Math.floor((body.y + body.h - 0.001) / TILE); row += 1) {
    for (let column = Math.floor(body.x / TILE); column <= Math.floor((body.x + body.w - 0.001) / TILE); column += 1) {
      if (isHazardTile(column, row)) return true;
    }
  }
  return false;
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
  enemy = makeEnemy(index);
  body = createBody(spawn.x + 6, spawn.y - 28, 20, 28);
  safe = { x: body.x, y: body.y };
  cameraX = 0;
  levelBannerSeconds = index === 0 ? 0 : 1.6;
}

function respawn(atSafe: boolean): void {
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

const TOUCH = { size: 72, inset: 24 };

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

const scale = (): number => canvas.height / LOGICAL_HEIGHT;
const viewWidth = (): number => canvas.width / scale();

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

type Rect = { x: number; y: number; w: number; h: number };

function inside(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

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
  const s = scale();
  const firstColumn = Math.max(0, Math.floor(cameraX / TILE) - 1);
  const lastColumn = Math.min(levelColumns() - 1, Math.floor((cameraX + viewWidth()) / TILE) + 1);
  const offsetY = (LOGICAL_HEIGHT - worldHeight) * 0.5;
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    for (let row = 0; row < levelRows(); row += 1) {
      const x = (column * TILE - cameraX) * s;
      const y = (row * TILE + offsetY) * s;
      if (isSolidTile(column, row)) {
        const shade = 0.85 + hash(column * 31 + row * 7) * 0.15;
        ctx.fillStyle = `rgb(${Math.round(60 * shade)}, ${Math.round(90 * shade)}, ${Math.round(70 * shade)})`;
        ctx.fillRect(x, y, TILE * s + 1, TILE * s + 1);
        if (!isSolidTile(column, row - 1)) {
          ctx.fillStyle = PALETTE.groundCap;
          ctx.fillRect(x, y, TILE * s + 1, 4 * s);
        }
      } else if (isHazardTile(column, row)) {
        ctx.fillStyle = PALETTE.spike;
        ctx.beginPath();
        for (let spike = 0; spike < 3; spike += 1) {
          const baseX = x + spike * (TILE / 3) * s;
          ctx.moveTo(baseX, y + TILE * s);
          ctx.lineTo(baseX + (TILE / 6) * s, y + 5 * s);
          ctx.lineTo(baseX + (TILE / 3) * s, y + TILE * s);
        }
        ctx.fill();
      }
    }
  }
  const gx = (goal.x - cameraX) * s;
  const gy = (3 * TILE + offsetY) * s;
  ctx.fillStyle = "#d9dee5";
  ctx.fillRect(gx + 6 * s, gy - 10 * s, 3 * s, (3.4 * TILE) * s);
  ctx.fillStyle = PALETTE.scarf;
  ctx.beginPath();
  ctx.moveTo(gx + 9 * s, gy - 8 * s);
  ctx.lineTo(gx + 46 * s, gy + 6 * s);
  ctx.lineTo(gx + 9 * s, gy + 20 * s);
  ctx.closePath();
  ctx.fill();
}

/** A patrolling walker: touching it is death, so the level has a second verb. */
type Enemy = { x: number; y: number; w: number; h: number; minX: number; maxX: number; dir: number; speed: number };

/** The walker only exists where a level places one; level 2's new verb is height, not pursuit. */
function makeEnemy(index: number): Enemy | null {
  if (index !== 0) return null;
  return {
    x: 40 * TILE + 5,
    y: 10 * TILE + 2,
    w: 24,
    h: 26,
    minX: 38 * TILE,
    maxX: 45 * TILE,
    dir: 1,
    speed: 55,
  };
}

let enemy: Enemy | null = makeEnemy(currentLevel());

function stepEnemy(dt: number): void {
  if (enemy === null) return;
  enemy.x += enemy.dir * enemy.speed * dt;
  if (enemy.x < enemy.minX) {
    enemy.x = enemy.minX;
    enemy.dir = 1;
  } else if (enemy.x > enemy.maxX) {
    enemy.x = enemy.maxX;
    enemy.dir = -1;
  }
}

function drawEnemy(): void {
  if (enemy === null) return;
  const s = scale();
  const offsetY = (LOGICAL_HEIGHT - worldHeight) * 0.5;
  const x = (enemy.x - cameraX) * s;
  const y = (enemy.y + offsetY) * s;
  ctx.fillStyle = PALETTE.enemy;
  ctx.beginPath();
  ctx.roundRect(x, y, enemy.w * s, enemy.h * s, 6 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 3 * s, y);
  ctx.lineTo(x + 8 * s, y - 8 * s);
  ctx.lineTo(x + 12 * s, y);
  ctx.moveTo(x + 12 * s, y);
  ctx.lineTo(x + 17 * s, y - 8 * s);
  ctx.lineTo(x + 21 * s, y - 0.5 * s);
  ctx.fill();
  ctx.fillStyle = PALETTE.outline;
  ctx.beginPath();
  ctx.arc(x + 8 * s, y + 10 * s, 2 * s, 0, Math.PI * 2);
  ctx.arc(x + 17 * s, y + 10 * s, 2 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(): void {
  const s = scale();
  const offsetY = (LOGICAL_HEIGHT - worldHeight) * 0.5;
  const air = !body.grounded;
  const moving = Math.abs(body.vx) > 12;
  const pose = air ? "air" : moving ? "run" : "idle";
  const bob = pose === "run" ? Math.sin(clock * 18) * 2 : pose === "idle" ? Math.sin(clock * 3) * 1 : 0;
  const squash = Math.max(-0.22, Math.min(0.22, body.vy / 2600));
  const width = body.w * s * (1 - squash * 0.5);
  const height = body.h * s * (1 + squash * 0.5);
  const left = (body.x - cameraX) * s + (body.w * s - width) / 2;
  const top = (body.y + offsetY) * s + (body.h * s - height) + bob * s;

  ctx.fillStyle = PALETTE.outline;
  ctx.beginPath();
  ctx.roundRect(left - 2 * s, top - 2 * s, width + 4 * s, height + 4 * s, 7 * s);
  ctx.fill();

  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 5 * s);
  ctx.fill();

  const facing = Math.sign(body.vx) || 1;
  ctx.fillStyle = PALETTE.scarf;
  ctx.beginPath();
  ctx.moveTo(left + width * 0.5, top + height * 0.34);
  ctx.lineTo(
    left + width * 0.5 - facing * (pose === "air" ? 22 : 14) * s,
    top + height * 0.34 + Math.sin(clock * 10) * 3 * s,
  );
  ctx.lineTo(left + width * 0.5, top + height * 0.56);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = PALETTE.outline;
  ctx.lineWidth = 3 * s;
  const swing = pose === "run" ? Math.sin(clock * 18) * 4 * s : 0;
  ctx.beginPath();
  ctx.moveTo(left + width * 0.3, top + height);
  ctx.lineTo(left + width * 0.3 + swing, top + height + 4 * s);
  ctx.moveTo(left + width * 0.7, top + height);
  ctx.lineTo(left + width * 0.7 - swing, top + height + 4 * s);
  ctx.stroke();

  ctx.fillStyle = PALETTE.outline;
  const eyeY = top + height * 0.3;
  const eyeX = left + width * 0.5 + facing * 2 * s;
  ctx.beginPath();
  ctx.arc(eyeX - 3 * s, eyeY, 1.7 * s, 0, Math.PI * 2);
  ctx.arc(eyeX + 3 * s, eyeY, 1.7 * s, 0, Math.PI * 2);
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

function draw(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky();
  drawParallax();
  drawLevel();
  drawEnemy();
  drawPlayer();
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
let previousPointers = new Set<number>();
let touchJumpPressed = false;

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
  };
}

const loop = createLoop({
  onFrame(time) {
    const dt = Math.min(time.delta, MAX_FRAME_DELTA);
    clock += dt;
    const snapshot = input.snapshot();
    const keys = new Set(snapshot.keys);
    const query = actions.tick(keys);

    const freshTaps: Array<{ x: number; y: number }> = [];
    for (const point of snapshot.pointers) {
      if (!previousPointers.has(point.id)) {
        freshTaps.push(point);
      }
    }
    previousPointers = new Set(snapshot.pointers.map((point) => point.id));
    const rect = canvas.getBoundingClientRect();
    const toCanvas = (point: { x: number; y: number }) => ({
      x: (point.x - rect.left) * (rect.width === 0 ? 1 : canvas.width / rect.width),
      y: (point.y - rect.top) * (rect.height === 0 ? 1 : canvas.height / rect.height),
    });
    const buttons = touchButtons();
    let touchLeft = false;
    let touchRight = false;
    let touchJump = false;
    for (const point of snapshot.pointers) {
      const local = toCanvas(point);
      if (inside(local, buttons.left)) touchLeft = true;
      if (inside(local, buttons.right)) touchRight = true;
      if (inside(local, buttons.jump)) touchJump = true;
    }
    touchState.left = touchLeft;
    touchState.right = touchRight;
    touchState.jump = touchJump;
    touchJumpPressed = touchJump;
    const tapped = freshTaps.some((point) => {
      const local = toCanvas(point);
      return inside(local, buttons.jump);
    });
    // The title screen is one button, not the jump pad. A first-time phone user reads
    // "Tap — start" and taps the middle of the screen; asking them to find the pad in the
    // corner first is a dead first move (QA measured exactly that). The pad still starts it,
    // because a tap on the pad is also a tap on the screen.
    const tappedAnywhere = freshTaps.length > 0;

    if (phase === "title") {
      if (query.pressed("jump") || tappedAnywhere) {
        ensureAudio();
        phase = "play";
        simSeconds = 0;
        // A new run always starts at level 1, even if the last one died on level 2.
        loadLevelAt(0);
        levelBannerSeconds = 0;
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
          left: query.down("left") || touchLeft,
          right: query.down("right") || touchRight,
          jumpPressed: query.pressed("jump") || tapped,
          jumpHeld: query.down("jump") || touchJump,
        },
        dt,
        solidAt,
      );
      stepEnemy(dt);
      if (body.grounded && body.vy === 0) {
        safe = { x: body.x, y: body.y };
      }
      if (!wasGrounded && body.grounded) {
        play("land");
      }
      if (query.pressed("jump") || tapped) {
        ensureAudio();
        play("jump");
      }

      const hitEnemy =
        enemy !== null &&
        body.x < enemy.x + enemy.w &&
        body.x + body.w > enemy.x &&
        body.y < enemy.y + enemy.h &&
        body.y + body.h > enemy.y;
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
