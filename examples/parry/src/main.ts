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
import { createForest, type Node } from "@fogrexon/glyph-arena-scene";
import { createTimer } from "@fogrexon/glyph-arena-timer";
import { createTransform, type Matrix2D } from "@fogrexon/glyph-arena-transform";
import { createTween } from "@fogrexon/glyph-arena-tween";
import { comparisonLine, isImprovement } from "./history";
import { WAVES } from "./waves";

type Phase = "title" | "play" | "result";

type Matrix6 = [number, number, number, number, number, number];

type Drawable = {
  entity: Entity;
  node: Node;
  kind: "player" | "enemy";
  width: number;
  height: number;
};

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 900;
const PLAYER_SIZE = 28;
const ENEMY_SIZE = 24;
const MOVE_SPEED = 210;
const DASH_DURATION = 0.16;
const DASH_SPEED = 430;

/** Touch controls: the move pad bottom-left, the dash button bottom-right, same size. */
const TOUCH_CONTROL_INSET = 104;
const TOUCH_CONTROL_RADIUS = 64;
const PARRY_REACH = 40;
const PARRY_BOX = 56;
const INVULN_SECONDS = 1;
const HIT_KNOCKBACK = 40;
const HITSTOP_SECONDS = 0.06;
const MAX_FRAME_DELTA = 0.1;
const INITIAL_LIVES = 3;

/**
 * Parry acceptance, as time-to-contact. It has to stay wider than the contact
 * radius (player 28 + enemy 24 means the boxes touch at a 26 px gap), otherwise
 * the enemy hits you before a parry can ever register: at the slowest wave
 * 0.55 s x 70 px/s = 38 px, and at the fastest 0.20 s x 156 px/s = 31 px.
 * The window still narrows over the run (550 ms -> 200 ms).
 */
const PARRY_WINDOW_START = 0.55;
const PARRY_WINDOW_END = 0.2;

const COMPONENT_KIND = "kind";
const COMPONENT_AABB = "aabb";
const COMPONENT_VELOCITY = "velocity";

type Velocity = { vx: number; vy: number };

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}
const canvas: HTMLCanvasElement = canvasEl;
const touchEnabled = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

const context = canvas.getContext("2d");
if (context === null) {
  throw new Error("2D canvas context unavailable");
}
const ctx: CanvasRenderingContext2D = context;

function createRectSprite(width: number, height: number, fill: string, stroke: string): CanvasImageSource {
  const sprite = document.createElement("canvas");
  sprite.width = width;
  sprite.height = height;
  const spriteContext = sprite.getContext("2d");
  if (spriteContext === null) {
    throw new Error("2D sprite canvas context unavailable");
  }
  spriteContext.fillStyle = fill;
  spriteContext.fillRect(0, 0, width, height);
  spriteContext.strokeStyle = stroke;
  spriteContext.lineWidth = 2;
  spriteContext.strokeRect(1, 1, width - 2, height - 2);
  return sprite;
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
  return matrixToArgs(multiplyMatrices(view, world));
}

function nodeAabb(x: number, y: number, width: number, height: number): Aabb {
  return { x, y, width, height };
}

function centerOf(aabb: Aabb): { x: number; y: number } {
  return { x: aabb.x + aabb.width / 2, y: aabb.y + aabb.height / 2 };
}

function playerAabbAtCenter(x: number, y: number): Aabb {
  return nodeAabb(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
}

function applyDeadzone(value: number): number {
  return Math.abs(value) < 0.25 ? 0 : value;
}

function gamepadDirections(pad: GamepadState): { left: boolean; right: boolean; up: boolean; down: boolean } {
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

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

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

  const playerSprite = createRectSprite(PLAYER_SIZE, PLAYER_SIZE, "#4cc9f0", "#7dd3fc");
  const enemySprite = createRectSprite(ENEMY_SIZE, ENEMY_SIZE, "#e63946", "#ff6b6b");

  let parryBuffer: AudioBuffer | null = null;
  try {
    const bytes = await assets.loadBytes(`${assetBase}parry.wav`);
    parryBuffer = await audio.decode(bytes);
  } catch {
    parryBuffer = null;
  }

  const screenRoot = forest.create();
  let titleRoot = forest.create();
  forest.setParent(titleRoot, screenRoot);

  let playRoot: Node | null = null;
  let fieldNode!: Node;
  let playerDrawable!: Drawable;
  let playerEntity!: Entity;

  let phase: Phase = "title";

  const enemies: Drawable[] = [];
  const entityNodes = new Map<Entity, Node>();

  let scheduleSeconds = 0;
  let lives = INITIAL_LIVES;
  let parried = 0;
  let waveIndex = 0;
  let lastErrorMs: number | null = null;
  const errorSamples: number[] = [];
  /**
   * The last few runs, newest last. Kept in memory on purpose: nothing is written
   * to storage, so a page reload starts a fresh history.
   */
  const runHistory: Array<{ parried: number; absoluteMs: number; wave: number; result: string }> = [];
  const RUN_HISTORY_LIMIT = 5;
  let resultText = "";
  let dashUntil = 0;
  let facingX = 0;
  let facingY = -1;
  let invulnerableUntil = 0;
  let hitstopUntil = 0;
  let shakeUntil = 0;
  let shakeStrength = 0;
  let punchX = 0;
  let punchY = 0;
  let punchHandle: number | null = null;

  function isInvulnerable(): boolean {
    return scheduleSeconds < invulnerableUntil;
  }

  function spawnEntity(kind: "player" | "enemy", aabb: Aabb, size: number): Drawable {
    const entity = world.spawn();
    world.set(entity, COMPONENT_KIND, kind);
    world.set(entity, COMPONENT_AABB, aabb);
    const node = forest.create();
    forest.setParent(node, playRoot!);
    entityNodes.set(entity, node);
    transform.set(node, { x: aabb.x, y: aabb.y });
    return { entity, node, kind, width: size, height: size };
  }

  function getAabb(entity: Entity): Aabb {
    const aabb = world.get(entity, COMPONENT_AABB);
    if (aabb === undefined || typeof aabb !== "object" || aabb === null) {
      throw new Error("Entity missing aabb component");
    }
    return aabb as Aabb;
  }

  function setAabb(entity: Entity, aabb: Aabb): void {
    world.set(entity, COMPONENT_AABB, aabb);
    const node = entityNodes.get(entity);
    if (node !== undefined) {
      transform.set(node, { x: aabb.x, y: aabb.y });
    }
  }

  function parryWindow(): number {
    const progress = Math.min(1, waveIndex / WAVES.length);
    return PARRY_WINDOW_START + (PARRY_WINDOW_END - PARRY_WINDOW_START) * progress;
  }

  function spawnWave(index: number): void {
    const wave = WAVES[index];
    if (wave === undefined) {
      return;
    }
    const radians = (wave.angle * Math.PI) / 180;
    const spawnX = WORLD_WIDTH / 2 + Math.cos(radians) * wave.radius;
    const spawnY = WORLD_HEIGHT / 2 + Math.sin(radians) * wave.radius;
    const enemy = spawnEntity("enemy", nodeAabb(spawnX, spawnY, ENEMY_SIZE, ENEMY_SIZE), ENEMY_SIZE);
    const playerCenter = centerOf(getAabb(playerEntity));
    const enemyCenter = centerOf(getAabb(enemy.entity));
    const dx = playerCenter.x - enemyCenter.x;
    const dy = playerCenter.y - enemyCenter.y;
    const length = Math.hypot(dx, dy) || 1;
    world.set(enemy.entity, COMPONENT_VELOCITY, {
      vx: (dx / length) * wave.speed,
      vy: (dy / length) * wave.speed,
    } satisfies Velocity);
    enemies.push(enemy);
  }

  function removeEnemy(index: number): void {
    const enemy = enemies[index];
    const node = entityNodes.get(enemy.entity);
    world.despawn(enemy.entity);
    entityNodes.delete(enemy.entity);
    if (node !== undefined) {
      forest.destroy(node);
    }
    enemies.splice(index, 1);
  }

  function punch(distance: number, duration: number): void {
    if (punchHandle !== null) {
      tween.cancel(punchHandle);
    }
    punchHandle = tween.to(distance, 0, duration);
  }

  function parryEnemy(index: number, enemy: Drawable): void {
    const playerCenter = centerOf(getAabb(playerEntity));
    const enemyCenter = centerOf(getAabb(enemy.entity));
    const distance = Math.hypot(playerCenter.x - enemyCenter.x, playerCenter.y - enemyCenter.y);
    const velocity = world.get(enemy.entity, COMPONENT_VELOCITY) as Velocity | undefined;
    const speed = velocity === undefined ? 1 : Math.hypot(velocity.vx, velocity.vy) || 1;
    // How early the parry landed, in ms: 0 is the perfect contact instant.
    lastErrorMs = Math.round((distance / speed) * 1000);
    errorSamples.push(lastErrorMs);
    parried += 1;
    removeEnemy(index);
    hitstopUntil = scheduleSeconds + HITSTOP_SECONDS;
    shakeUntil = scheduleSeconds + 0.18;
    shakeStrength = 6;
    punch(10, 0.14);
    if (parryBuffer !== null) {
      void audio.resume().then(() => {
        if (parryBuffer !== null) {
          audio.play(parryBuffer);
        }
      });
    }
  }

  function damagePlayer(): void {
    lives -= 1;
    if (lives <= 0) {
      fail();
      return;
    }
    invulnerableUntil = scheduleSeconds + INVULN_SECONDS;
    shakeUntil = scheduleSeconds + 0.2;
    shakeStrength = 9;
    punch(12, 0.16);
    // Shove the player away from the centre so a hit is felt, not just counted.
    const playerBox = getAabb(playerEntity);
    const playerCenter = centerOf(playerBox);
    const dx = playerCenter.x - WORLD_WIDTH / 2;
    const dy = playerCenter.y - WORLD_HEIGHT / 2;
    const length = Math.hypot(dx, dy) || 1;
    const pushed = playerAabbAtCenter(
      playerCenter.x + (dx / length) * HIT_KNOCKBACK,
      playerCenter.y + (dy / length) * HIT_KNOCKBACK,
    );
    const margin = 40;
    if (
      pushed.x > margin &&
      pushed.y > margin &&
      pushed.x + pushed.width < WORLD_WIDTH - margin &&
      pushed.y + pushed.height < WORLD_HEIGHT - margin
    ) {
      setAabb(playerEntity, pushed);
    }
  }

  function recordRun(result: string): void {
    const absoluteMs =
      errorSamples.length === 0 ? 0 : Math.round(median(errorSamples.map((value) => Math.abs(value))));
    runHistory.push({ parried, absoluteMs, wave: Math.min(waveIndex, WAVES.length), result });
    if (runHistory.length > RUN_HISTORY_LIMIT) {
      runHistory.shift();
    }
  }

  function fail(): void {
    resultText = "FAIL";
    recordRun("FAIL");
    phase = "result";
  }

  function clear(): void {
    resultText = "CLEAR";
    recordRun("CLEAR");
    phase = "result";
  }

  function resetRun(): void {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
      removeEnemy(index);
    }
    enemies.length = 0;
    lives = INITIAL_LIVES;
    parried = 0;
    waveIndex = 0;
    lastErrorMs = null;
    errorSamples.length = 0;
    dashUntil = 0;
    invulnerableUntil = 0;
    hitstopUntil = 0;
    shakeUntil = 0;
    scheduleSeconds = 0;
    const center = playerAabbAtCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    setAabb(playerEntity, center);
    transform.set(playerDrawable.node, { rotation: 0 });
    facingX = 0;
    facingY = -1;
  }

  function spawnPlayer(): void {
    playerDrawable = spawnEntity("player", playerAabbAtCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2), PLAYER_SIZE);
    playerEntity = playerDrawable.entity;
    transform.set(playerDrawable.node, { rotation: 0 });
  }

  const input = createInput();
  input.attach(window);
  const actions = createActions();
  actions.bind("moveLeft", ["ArrowLeft"]);
  actions.bind("moveRight", ["ArrowRight"]);
  actions.bind("moveUp", ["ArrowUp"]);
  actions.bind("moveDown", ["ArrowDown"]);
  actions.bind("dash", ["ShiftLeft", "ShiftRight", "Space"]);
  actions.bind("start", ["Space", "Enter"]);
  actions.bind("restart", ["KeyR"]);

  function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  function touchDirections(): { left: boolean; right: boolean; up: boolean; down: boolean } {
    const snapshot = input.snapshot();
    if (!touchEnabled) {
      return { left: false, right: false, up: false, down: false };
    }
    const centerX = TOUCH_CONTROL_INSET;
    const centerY = canvas.height - TOUCH_CONTROL_INSET;
    // The pointer on the pad, not "the first pointer": the other thumb may be on DASH.
    const point = snapshot.pointers.find(
      (candidate) => Math.hypot(candidate.x - centerX, candidate.y - centerY) <= 160,
    );
    if (point === undefined) {
      return { left: false, right: false, up: false, down: false };
    }
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return { left: dx < -14, right: dx > 14, up: dy < -14, down: dy > 14 };
  }

  function drawTouchPad(): void {
    if (!touchEnabled) {
      return;
    }
    const centerX = TOUCH_CONTROL_INSET;
    const centerY = canvas.height - TOUCH_CONTROL_INSET;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#e8eaed";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#9aa0a6";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 26, centerY);
    ctx.lineTo(centerX + 26, centerY);
    ctx.moveTo(centerX, centerY - 26);
    ctx.lineTo(centerX, centerY + 26);
    ctx.stroke();

    // The dash button: a phone has no Shift, and parrying is the whole game.
    const dashX = canvas.width - TOUCH_CONTROL_INSET;
    const dashY = canvas.height - TOUCH_CONTROL_INSET;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(dashX, dashY, TOUCH_CONTROL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(dashX, dashY, TOUCH_CONTROL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fbbf24";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DASH", dashX, dashY);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1;
  }

  function drawScene(offsetX: number, offsetY: number): void {
    const playerCenter = centerOf(getAabb(playerEntity));
    camera.set({ x: playerCenter.x - offsetX, y: playerCenter.y - offsetY, zoom: 1 });
    const view = camera.view(canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    draw.clear("#0f1115");
    const [a, b, c, d, e, f] = matrixToArgs(view);
    ctx.setTransform(a, b, c, d, e, f);
    ctx.strokeStyle = "#2a2f38";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (const enemy of enemies) {
      drawSpriteAt(enemy, enemySprite, view);
    }
    drawSpriteAt(playerDrawable, playerSprite, view, isInvulnerable() && Math.floor(scheduleSeconds * 20) % 2 === 0 ? 0.35 : 1);
  }

  function drawSpriteAt(drawable: Drawable, image: CanvasImageSource, view: Matrix2D, alpha = 1): void {
    const worldMatrix = transform.world(drawable.node, forest.parent);
    const [a, b, c, d, e, f] = composeViewAndWorld(view, worldMatrix);
    ctx.setTransform(a, b, c, d, e, f);
    const half = drawable.kind === "player" ? PLAYER_SIZE / 2 : 0;
    draw.sprite({
      image,
      x: drawable.kind === "player" ? -half : 0,
      y: drawable.kind === "player" ? -half : 0,
      width: drawable.width,
      height: drawable.height,
      alpha,
    });
  }

  /** Draws text one word at a time so a narrow viewport never clips a line. Returns the line count. */
  function drawWrapped(text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
    const words = text.split(" ");
    let line = "";
    let offsetY = 0;
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (line !== "" && ctx.measureText(candidate).width > maxWidth) {
        ctx.fillText(line, x, y + offsetY);
        offsetY += lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line !== "") {
      ctx.fillText(line, x, y + offsetY);
    }
    return Math.round(offsetY / lineHeight) + 1;
  }

  function drawHud(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (phase === "play") {
      ctx.fillStyle = "#e8eaed";
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText(`Parried: ${parried}`, 16, 32);
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(`Lives: ${lives}`, 16, 56);
      ctx.fillText(`Wave: ${Math.min(waveIndex, WAVES.length)}/${WAVES.length}`, 16, 78);
      if (parried === 0 && waveIndex === 1 && enemies.length > 0) {
        ctx.fillStyle = "#fbbf24";
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillText(
          touchEnabled ? "Dash into it \u2014 tap DASH" : "Dash into it \u2014 Shift or Space",
          16,
          152,
        );
      }
      if (lastErrorMs !== null) {
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(`Last parry: ${lastErrorMs}ms early`, 16, 102);
      }
      ctx.fillStyle = "#9aa0a6";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(`Parry window: ${Math.round(parryWindow() * 1000)}ms`, 16, 126);
    } else if (phase === "result") {
      ctx.fillStyle = "#e8eaed";
      ctx.font = "20px system-ui, sans-serif";
      const latest = runHistory[runHistory.length - 1];
      ctx.fillText(`Parried: ${parried}/${WAVES.length}`, 16, 32);
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(`Reached wave: ${latest === undefined ? 0 : latest.wave}/${WAVES.length}`, 16, 56);
      ctx.fillText(
        `Median error: ${latest === undefined || latest.parried === 0 ? "\u2014" : `${latest.absoluteMs}ms`}`,
        16,
        78,
      );
      ctx.fillStyle = resultText === "CLEAR" ? "#fbbf24" : "#e63946";
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText(`${resultText} \u2014 ${touchEnabled ? "Tap to retry" : "R restart"}`, 16, 106);

      // "Was that better?" answered before the player has to read the list.
      const previous = runHistory[runHistory.length - 2];
      if (latest !== undefined) {
        ctx.fillStyle = isImprovement(latest, previous) ? "#fbbf24" : "#9aa0a6";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText(comparisonLine(latest, previous), 16, 132);
      }

      // The last runs, newest first, so five runs can be compared at a glance.
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillStyle = "#9aa0a6";
      ctx.fillText("Last runs (newest first):", 16, 164);
      for (let index = runHistory.length - 1; index >= 0; index -= 1) {
        const run = runHistory[index];
        const row = runHistory.length - index;
        ctx.fillText(
          `${row}. ${run.result} - parried ${run.parried}, ${run.parried === 0 ? "\u2014" : `${run.absoluteMs}ms`}, wave ${run.wave}`,
          16,
          184 + (runHistory.length - 1 - index) * 18,
        );
      }
      if (runHistory.length >= 2) {
        const parriedMedian = median(runHistory.map((run) => run.parried));
        const msMedian = median(runHistory.map((run) => run.absoluteMs));
        ctx.fillStyle = "#e8eaed";
        ctx.fillText(
          `${runHistory.length}-run median: parried ${parriedMedian}, ${Math.round(msMedian)}ms`,
          16,
          184 + runHistory.length * 18 + 6,
        );
      }
    }
  }

  function destroyTitle(): void {
    forest.destroy(titleRoot);
  }

  function startPlay(): void {
    playRoot = forest.create();
    forest.setParent(playRoot, screenRoot);
    fieldNode = forest.create();
    forest.setParent(fieldNode, playRoot);
    spawnPlayer();
    phase = "play";
    resetRun();
  }

  // Pointer ids seen on the previous frame, so a tap is an edge and not a held finger.
  let seenPointerIds: ReadonlySet<number> = new Set<number>();

  const loop = createLoop({
    onFrame(time) {
      const delta = Math.min(time.delta, MAX_FRAME_DELTA);
      const snapshot = input.snapshot();
      const freshTap = snapshot.pointers.some((point) => !seenPointerIds.has(point.id));
      seenPointerIds = new Set(snapshot.pointers.map((point) => point.id));
      const keys = new Set(snapshot.keys);
      const pads = gamepad.snapshot();
      const pad = pads[0];
      if (pad !== undefined) {
        const directions = gamepadDirections(pad);
        if (directions.left) keys.add("ArrowLeft");
        if (directions.right) keys.add("ArrowRight");
        if (directions.up) keys.add("ArrowUp");
        if (directions.down) keys.add("ArrowDown");
      }
      if (touchEnabled) {
        const touch = touchDirections();
        if (touch.left) keys.add("ArrowLeft");
        if (touch.right) keys.add("ArrowRight");
        if (touch.up) keys.add("ArrowUp");
        if (touch.down) keys.add("ArrowDown");
        // The button is a Shift, injected where the keys come from, so the dash gate stays in one place.
        const dashX = canvas.width - TOUCH_CONTROL_INSET;
        const dashY = canvas.height - TOUCH_CONTROL_INSET;
        if (
          snapshot.pointers.some((point) => Math.hypot(point.x - dashX, point.y - dashY) <= TOUCH_CONTROL_RADIUS)
        ) {
          keys.add("ShiftLeft");
        }
      }
      const query = actions.tick(keys);

      if (phase === "title") {
        if (query.pressed("start") || (touchEnabled && snapshot.pointers[0] !== undefined)) {
          destroyTitle();
          startPlay();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        draw.clear("#0f1115");
        ctx.fillStyle = "#e8eaed";
        ctx.font = "28px system-ui, sans-serif";
        ctx.fillText("Parry", 16, 48);
        ctx.font = "18px system-ui, sans-serif";
        const subtitleLines = drawWrapped(
          "Dash into an incoming enemy to parry it \u2014 20 waves",
          16,
          84,
          canvas.width - 32,
          22,
        );
        const controlsY = 84 + subtitleLines * 22 + 10;
        ctx.font = "14px system-ui, sans-serif";
        ctx.fillStyle = "#9aa0a6";
        ctx.fillText(
          touchEnabled ? "Drag the pad to move \u00b7 tap DASH to dash" : "Arrows / gamepad move \u00b7 Shift or Space dash \u00b7 R restart",
          16,
          controlsY,
        );
        ctx.fillStyle = "#fbbf24";
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillText(touchEnabled ? "Tap \u2014 start" : "Space / Enter \u2014 start", 16, controlsY + 36);
        return;
      }

      // A phone has no R key: a fresh tap on the result screen restarts, through this same path.
      if (query.pressed("restart") || (phase === "result" && freshTap)) {
        resetRun();
        phase = "play";
      }

      if (phase === "play" && scheduleSeconds < hitstopUntil) {
        // Hitstop: hold everything for a few frames so a parry lands with weight.
        drawScene(0, 0);
        drawHud();
        drawTouchPad();
        return;
      }

      if (phase === "play") {
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
        if (dx !== 0 || dy !== 0) {
          const length = Math.hypot(dx, dy);
          dx /= length;
          dy /= length;
          facingX = dx;
          facingY = dy;
        }

        if (query.pressed("dash") && scheduleSeconds >= dashUntil) {
          dashUntil = scheduleSeconds + DASH_DURATION;
        }
        const dashing = scheduleSeconds < dashUntil;
        const speed = dashing ? DASH_SPEED : MOVE_SPEED;
        const playerBox = getAabb(playerEntity);
        const playerCenter = centerOf(playerBox);
        const nextX = playerCenter.x + dx * speed * delta;
        const nextY = playerCenter.y + dy * speed * delta;
        const margin = 24;
        const clampedX = Math.min(WORLD_WIDTH - margin, Math.max(margin, nextX));
        const clampedY = Math.min(WORLD_HEIGHT - margin, Math.max(margin, nextY));
        setAabb(playerEntity, playerAabbAtCenter(clampedX, clampedY));
        transform.set(playerDrawable.node, { rotation: Math.atan2(facingX, -facingY) });

        // Enemies move along the vector they were given at spawn.
        for (const enemy of enemies) {
          const box = getAabb(enemy.entity);
          const velocity = (world.get(enemy.entity, COMPONENT_VELOCITY) as Velocity | undefined) ?? { vx: 0, vy: 0 };
          setAabb(enemy.entity, { ...box, x: box.x + velocity.vx * delta, y: box.y + velocity.vy * delta });
        }

        // Parry check: only while dashing, only inside the forward box, only for enemies still ahead.
        if (dashing) {
          const parryCenter = {
            x: clampedX + facingX * PARRY_REACH,
            y: clampedY + facingY * PARRY_REACH,
          };
          const parryBox = nodeAabb(parryCenter.x - PARRY_BOX / 2, parryCenter.y - PARRY_BOX / 2, PARRY_BOX, PARRY_BOX);
          for (let index = enemies.length - 1; index >= 0; index -= 1) {
            const enemy = enemies[index];
            const enemyBox = getAabb(enemy.entity);
            const enemyCenter = centerOf(enemyBox);
            if (!overlaps(parryBox, enemyBox)) {
              continue;
            }
            const toEnemyX = enemyCenter.x - clampedX;
            const toEnemyY = enemyCenter.y - clampedY;
            if (toEnemyX * facingX + toEnemyY * facingY <= 0) {
              continue;
            }
            const distance = Math.hypot(toEnemyX, toEnemyY);
            const velocity = (world.get(enemy.entity, COMPONENT_VELOCITY) as Velocity | undefined) ?? { vx: 1, vy: 0 };
            const speedTowards = Math.hypot(velocity.vx, velocity.vy) || 1;
            const earlyMs = (distance / speedTowards) * 1000;
            if (earlyMs > parryWindow() * 1000) {
              continue;
            }
            parryEnemy(index, enemy);
            break;
          }
        }

        // Contact: an enemy that reaches the player and was not parried costs a life.
        if (!isInvulnerable()) {
          const box = getAabb(playerEntity);
          for (const enemy of enemies) {
            if (overlaps(box, getAabb(enemy.entity))) {
              damagePlayer();
              break;
            }
          }
        }

        while (waveIndex < WAVES.length && WAVES[waveIndex].at <= scheduleSeconds) {
          spawnWave(waveIndex);
          waveIndex += 1;
        }
        if (waveIndex >= WAVES.length && enemies.length === 0 && lives > 0) {
          clear();
        }

        scheduleSeconds += delta;
        timer.tick(scheduleSeconds);
        tween.tick(scheduleSeconds);
        if (punchHandle !== null) {
          const value = tween.get(punchHandle);
          punchX = value ?? 0;
          punchY = value ?? 0;
          if (value === undefined) {
            punchHandle = null;
            punchX = 0;
            punchY = 0;
          }
        }
      }

      if (phase === "result") {
        // The round is over: nothing left on the field still means anything, so show the verdict alone.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        draw.clear("#0f1115");
        drawHud();
        return;
      }

      const shakeOffset = scheduleSeconds < shakeUntil ? shakeStrength : 0;
      const jitterX = shakeOffset === 0 ? 0 : Math.sin(scheduleSeconds * 90) * shakeOffset;
      const jitterY = shakeOffset === 0 ? 0 : Math.cos(scheduleSeconds * 73) * shakeOffset;
      drawScene(jitterX + punchX, jitterY + punchY);
      drawHud();
      drawTouchPad();
    },
  });

  loop.start();
}

void main();
