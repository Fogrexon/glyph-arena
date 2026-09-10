import { createActions } from "@fogrexon/glyph-arena-actions";
import { createCamera } from "@fogrexon/glyph-arena-camera";
import { overlaps, type Aabb } from "@fogrexon/glyph-arena-collide";
import { createDraw } from "@fogrexon/glyph-arena-draw";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";
import { createForest, type Node } from "@fogrexon/glyph-arena-scene";
import { createTimer } from "@fogrexon/glyph-arena-timer";
import { createTransform, type Matrix2D } from "@fogrexon/glyph-arena-transform";
import { createTween } from "@fogrexon/glyph-arena-tween";

type Matrix6 = [number, number, number, number, number, number];

type Drawable = {
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

const playerSprite = createRectSprite(PLAYER_SIZE, PLAYER_SIZE, "#4cc9f0", "#7dd3fc");
const itemSprite = createRectSprite(ITEM_SIZE, ITEM_SIZE, "#f9e076", "#fbbf24");
const wallSprite = createRectSprite(WALL_SPRITE_SIZE, WALL_SPRITE_SIZE, "#3d4451", "#6b7280");

const draw = createDraw({ context: ctx });
const forest = createForest();
const transform = createTransform();
const camera = createCamera();
const timer = createTimer();
const tween = createTween();

const worldRoot = forest.create();
const playerNode = forest.create();
forest.setParent(playerNode, worldRoot);

const wallNodes: Drawable[] = [];
const itemNodes: Drawable[] = [];

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

for (const wall of wallLayout) {
  const node = forest.create();
  forest.setParent(node, worldRoot);
  transform.set(node, {
    x: wall.x,
    y: wall.y,
    scaleX: wall.width / WALL_SPRITE_SIZE,
    scaleY: wall.height / WALL_SPRITE_SIZE,
  });
  wallNodes.push({
    node,
    image: wallSprite,
    width: wall.width,
    height: wall.height,
  });
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

function spawnItem(spawn: { x: number; y: number }): Drawable {
  const node = forest.create();
  forest.setParent(node, worldRoot);
  transform.set(node, { x: spawn.x, y: spawn.y });
  const drawable: Drawable = {
    node,
    image: itemSprite,
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  };
  itemNodes.push(drawable);
  return drawable;
}

for (const spawn of itemSpawns) {
  spawnItem(spawn);
}

let playerX = WORLD_WIDTH / 2;
let playerY = WORLD_HEIGHT / 2;
let score = 0;
let pickupZoomHandle: number | null = null;

transform.set(playerNode, {
  x: playerX - PLAYER_SIZE / 2,
  y: playerY - PLAYER_SIZE / 2,
});

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

function playerAabbAt(x: number, y: number): Aabb {
  return nodeAabb(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
}

function wallAABBs(): Aabb[] {
  return wallNodes.map((wall) => {
    const local = transform.get(wall.node);
    return nodeAabb(local.x, local.y, wall.width, wall.height);
  });
}

function collidesWithWalls(aabb: Aabb, walls: Aabb[]): boolean {
  for (const wall of walls) {
    if (overlaps(aabb, wall)) {
      return true;
    }
  }
  return false;
}

function itemAabb(drawable: Drawable): Aabb {
  const local = transform.get(drawable.node);
  return nodeAabb(local.x, local.y, drawable.width, drawable.height);
}

function removeItem(drawable: Drawable): void {
  const index = itemNodes.indexOf(drawable);
  if (index !== -1) {
    itemNodes.splice(index, 1);
  }
  forest.destroy(drawable.node);
}

function scheduleItemRespawn(spawn: { x: number; y: number }): void {
  timer.delay(ITEM_RESPAWN_SECONDS, () => {
    spawnItem(spawn);
  });
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

function parentOf(node: unknown): Node | null {
  return forest.parent(node as Node);
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

    let dx = 0;
    let dy = 0;

    if (query.down("left")) dx -= 1;
    if (query.down("right")) dx += 1;
    if (query.down("up")) dy -= 1;
    if (query.down("down")) dy += 1;

    if (dx !== 0 && dy !== 0) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
    }

    const walls = wallAABBs();
    let nextX = playerX;
    let nextY = playerY;

    if (dx !== 0 || dy !== 0) {
      const stepX = dx * MOVE_SPEED * time.delta;
      const stepY = dy * MOVE_SPEED * time.delta;

      const tentativeX = playerX + stepX;
      if (!collidesWithWalls(playerAabbAt(tentativeX, playerY), walls)) {
        nextX = tentativeX;
      }

      const tentativeY = playerY + stepY;
      if (!collidesWithWalls(playerAabbAt(nextX, tentativeY), walls)) {
        nextY = tentativeY;
      }
    }

    playerX = nextX;
    playerY = nextY;

    transform.set(playerNode, {
      x: playerX - PLAYER_SIZE / 2,
      y: playerY - PLAYER_SIZE / 2,
    });

    const playerBox = playerAabbAt(playerX, playerY);
    for (const item of [...itemNodes]) {
      if (overlaps(playerBox, itemAabb(item))) {
        const local = transform.get(item.node);
        removeItem(item);
        score += 1;
        scheduleItemRespawn({ x: local.x, y: local.y });
        playPickupZoom();
      }
    }

    if (pickupZoomHandle !== null) {
      const zoomValue = tween.get(pickupZoomHandle);
      if (zoomValue !== undefined) {
        camera.set({ zoom: zoomValue });
      }
    }

    camera.set({ x: playerX, y: playerY });

    const viewWidth = canvas.width;
    const viewHeight = canvas.height;
    const viewMatrix = camera.view(viewWidth, viewHeight);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    draw.clear("#0f1115");

    for (const wall of wallNodes) {
      drawWallSprite(wall, viewMatrix);
    }

    for (const item of itemNodes) {
      drawWorldSprite(item, viewMatrix);
    }

    drawWorldSprite(
      {
        node: playerNode,
        image: playerSprite,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
      },
      viewMatrix,
    );

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#e8eaed";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(`Score: ${score}`, 16, 32);
    ctx.fillStyle = "#9aa0a6";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("Arrow keys to move — collect gems", 16, 54);
  },
});

loop.start();
