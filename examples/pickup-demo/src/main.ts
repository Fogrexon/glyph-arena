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

type Matrix6 = [number, number, number, number, number, number];

type EntityKind = "player" | "gem" | "wall";

type Drawable = {
  entity: Entity;
  node: Node;
  image: CanvasImageSource;
  width: number;
  height: number;
};

const PLAYER_SIZE = 28;
const ITEM_SIZE = 20;
const WALL_SPRITE_SIZE = 64;
const MOVE_SPEED = 180;
const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 900;
const ITEM_RESPAWN_SECONDS = 2.5;
const PICKUP_ZOOM = 1.18;
const PICKUP_ZOOM_DURATION = 0.18;
const GAMEPAD_DEADZONE = 0.25;

const COMPONENT_KIND = "kind";
const COMPONENT_AABB = "aabb";

const canvasEl = document.getElementById("game");
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const canvas: HTMLCanvasElement = canvasEl;

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

  transformApi.set(node, { x: aabb.x, y: aabb.y });
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
  const gemEntities: Entity[] = [];

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

  const worldRoot = forest.create();

  function parentOf(node: unknown): Node | null {
    return forest.parent(node as Node);
  }

  function spawnEntity(
    kind: EntityKind,
    aabb: Aabb,
    image: CanvasImageSource,
    spriteWidth: number,
    spriteHeight: number,
  ): Drawable {
    const entity = world.spawn();
    world.set(entity, COMPONENT_KIND, kind);
    world.set(entity, COMPONENT_AABB, aabb);

    const node = forest.create();
    forest.setParent(node, worldRoot);
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
    { x: 620, y: 320, width: 40, height: 240 },
    { x: 180, y: 520, width: 300, height: 40 },
    { x: 760, y: 120, width: 40, height: 200 },
    { x: 420, y: 680, width: 260, height: 40 },
  ];

  const wallDrawables: Drawable[] = [];
  for (const wall of wallLayout) {
    const drawable = spawnEntity(
      "wall",
      nodeAabb(wall.x, wall.y, wall.width, wall.height),
      wallImage,
      wall.width,
      wall.height,
    );
    wallEntities.push(drawable.entity);
    wallDrawables.push(drawable);
  }

  const itemSpawns: Array<{ x: number; y: number }> = [
    { x: 140, y: 140 },
    { x: 520, y: 220 },
    { x: 900, y: 180 },
    { x: 340, y: 420 },
    { x: 780, y: 520 },
    { x: 200, y: 720 },
    { x: 980, y: 700 },
    { x: 560, y: 760 },
  ];

  function spawnGem(spawn: { x: number; y: number }): Drawable {
    const drawable = spawnEntity(
      "gem",
      nodeAabb(spawn.x, spawn.y, ITEM_SIZE, ITEM_SIZE),
      gemImage,
      ITEM_SIZE,
      ITEM_SIZE,
    );
    gemEntities.push(drawable.entity);
    return drawable;
  }

  for (const spawn of itemSpawns) {
    spawnGem(spawn);
  }

  const playerCenterX = WORLD_WIDTH / 2;
  const playerCenterY = WORLD_HEIGHT / 2;
  const playerDrawable = spawnEntity(
    "player",
    playerAabbAtCenter(playerCenterX, playerCenterY),
    playerImage,
    PLAYER_SIZE,
    PLAYER_SIZE,
  );
  const playerEntity = playerDrawable.entity;

  let score = 0;
  let pickupZoomHandle: number | null = null;
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

  function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener("resize", resize);

  const input = createInput();
  input.attach(window);

  const actions = createActions();
  actions.bind("left", ["ArrowLeft"]);
  actions.bind("right", ["ArrowRight"]);
  actions.bind("up", ["ArrowUp"]);
  actions.bind("down", ["ArrowDown"]);

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

  function removeGem(entity: Entity): void {
    const index = gemEntities.indexOf(entity);
    if (index !== -1) {
      gemEntities.splice(index, 1);
    }

    const node = entityNodes.get(entity);
    if (node !== undefined) {
      transform.clear(node);
      forest.destroy(node);
      entityNodes.delete(entity);
    }

    world.despawn(entity);
  }

  function scheduleGemRespawn(spawn: { x: number; y: number }): void {
    timer.delay(ITEM_RESPAWN_SECONDS, () => {
      spawnGem(spawn);
    });
  }

  async function playPickupSound(): Promise<void> {
    if (pickupBuffer === null) {
      return;
    }
    await ensureAudioResumed();
    audio.play(pickupBuffer);
  }

  function playPickupZoom(): void {
    if (pickupZoomHandle !== null) {
      tween.cancel(pickupZoomHandle);
    }

    const baseZoom = 1;
    pickupZoomHandle = tween.to(camera.get().zoom, PICKUP_ZOOM, PICKUP_ZOOM_DURATION);
    timer.delay(PICKUP_ZOOM_DURATION, () => {
      if (pickupZoomHandle !== null) {
        tween.cancel(pickupZoomHandle);
        pickupZoomHandle = null;
      }
      camera.set({ zoom: baseZoom });
    });
  }

  function drawWorldSprite(drawable: Drawable, viewMatrix: Matrix2D): void {
    const worldMatrix = transform.world(drawable.node, parentOf);
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

  function drawWallSprite(wall: Drawable, viewMatrix: Matrix2D): void {
    const worldMatrix = transform.world(wall.node, parentOf);
    const [a, b, c, d, e, f] = composeViewAndWorld(viewMatrix, worldMatrix);
    ctx.setTransform(a, b, c, d, e, f);
    draw.sprite({
      image: wall.image,
      x: 0,
      y: 0,
    });
  }

  const loop = createLoop({
    onFrame(time) {
      timer.tick(time.elapsed);
      tween.tick(time.elapsed);

      const query = actions.tick(input.snapshot().keys);

      let left = query.down("left");
      let right = query.down("right");
      let up = query.down("up");
      let down = query.down("down");

      const pads = gamepad.snapshot();
      const pad = pads[0];
      if (pad !== undefined) {
        if (!audioResumed && padHasInput(pad)) {
          void ensureAudioResumed();
        }

        const directions = gamepadDirections(pad);
        left = left || directions.left;
        right = right || directions.right;
        up = up || directions.up;
        down = down || directions.down;
      }

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

      const playerAabb = getAabb(playerEntity, world);
      const { x: playerX, y: playerY } = playerCenterFromAabb(playerAabb);
      const walls = wallAABBs();
      let nextX = playerX;
      let nextY = playerY;

      if (dx !== 0 || dy !== 0) {
        const stepX = dx * MOVE_SPEED * time.delta;
        const stepY = dy * MOVE_SPEED * time.delta;

        const tentativeX = playerX + stepX;
        if (!collidesWithWalls(playerAabbAtCenter(tentativeX, playerY), walls)) {
          nextX = tentativeX;
        }

        const tentativeY = playerY + stepY;
        if (!collidesWithWalls(playerAabbAtCenter(nextX, tentativeY), walls)) {
          nextY = tentativeY;
        }
      }

      const nextPlayerAabb = playerAabbAtCenter(nextX, nextY);
      setAabb(playerEntity, world, nextPlayerAabb);
      syncTransformFromAabb(
        playerEntity,
        playerDrawable.node,
        "player",
        nextPlayerAabb,
        transform,
      );

      const playerBox = nextPlayerAabb;
      for (const gemEntity of [...gemEntities]) {
        const gemAabb = getAabb(gemEntity, world);
        if (overlaps(playerBox, gemAabb)) {
          removeGem(gemEntity);
          score += 1;
          scheduleGemRespawn({ x: gemAabb.x, y: gemAabb.y });
          void playPickupSound();
          playPickupZoom();
        }
      }

      if (pickupZoomHandle !== null) {
        const zoomValue = tween.get(pickupZoomHandle);
        if (zoomValue !== undefined) {
          camera.set({ zoom: zoomValue });
        }
      }

      const { x: cameraX, y: cameraY } = playerCenterFromAabb(nextPlayerAabb);
      camera.set({ x: cameraX, y: cameraY });

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

      drawWorldSprite(playerDrawable, viewMatrix);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#e8eaed";
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText(`Score: ${score}`, 16, 32);
      ctx.fillStyle = "#9aa0a6";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("Arrow keys or gamepad — collect gems", 16, 54);
    },
  });

  loop.start();
}

void main();
