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

import { TILE, isHazardTile, isSolidTile, levelColumns, levelRows, spawnPoint } from "./level";
import { GRAVITY, createBody, jumpHeight, stepBody, type Body } from "./physics";

type Phase = "title" | "play" | "dead" | "goal";

/** Read-only mirror of the run, so a harness never has to guess from the pixels. */
type RunnerState = {
  phase: Phase;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  deaths: number;
  /** Milliseconds left in the death pause; 0 outside it. */
  respawnInMs: number;
  cameraX: number;
  goalX: number;
  worldWidth: number;
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

const spawn = spawnPoint();
const goal = { x: (levelColumns() - 2) * TILE, y: 0 };
const worldWidth = levelColumns() * TILE;
const worldHeight = levelRows() * TILE;

let phase: Phase = "title";
let body = createBody(spawn.x + 6, spawn.y - 28, 20, 28);
let cameraX = 0;
let deaths = 0;
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

function respawn(atSafe: boolean): void {
  const x = atSafe ? safe.x : spawn.x + 6;
  const y = atSafe ? safe.y : spawn.y - 28;
  body = createBody(x, y, 20, 28);
  respawnSeconds = 0;
  if (!atSafe) {
    cameraX = 0;
  }
}

function die(): void {
  deaths += 1;
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

