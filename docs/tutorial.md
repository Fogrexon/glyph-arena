# Build a game in 30 minutes

This is the shortest path from an empty folder to something you can play: one canvas, one level, a
body that runs and jumps, and a camera that follows. No assets — every pixel comes from `draw`.

The time budget below is the order of work, not a promise about your machine: steps 1-3 are setup
and take minutes, steps 4-8 are the game and are each a few lines.

## 1. A project

**Before the commands:** Node 22 and its `npm`. Check with `node --version`; `v22.x` is the version
this project is built and shipped with, and the one every step below was run on. (`npm create vite`
also accepts Node 20.19+, but nothing here is tested below 22.) Nothing else has to be installed — no
bundler config, no TypeScript setup, no asset tooling.

```bash
npm create vite@latest my-game -- --template vanilla-ts
cd my-game
npm install @fogrexon/glyph-arena
```

One package is all you install. The modules the docs describe per package are bundled inside it and
are re-exported flat, so there is no second import to add later.

If you are offline, or you want the repository's own sources instead of the published package, the
checkout works too. It is a pnpm workspace, so it needs one `pnpm install` (pnpm 10) before it can be
packed; the package's `prepack` then runs the build, so the tarball it produces has `dist/` inside it:

```bash
git clone https://github.com/Fogrexon/glyph-arena
cd glyph-arena
pnpm install
pnpm --filter @fogrexon/glyph-arena pack     # writes fogrexon-glyph-arena-0.2.0.tgz in this directory
npm install /path/to/glyph-arena/fogrexon-glyph-arena-0.2.0.tgz
```

The rest of this page is unchanged either way.

## 2. A canvas

Replace `index.html`'s body with a canvas that fills the window:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>First game</title>
    <link rel="icon" href="data:," />
    <style>
      html, body { margin: 0; height: 100%; background: #0d1626; }
      canvas { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## 3. A frame loop that paints

```ts
import { createDraw, createLoop } from "@fogrexon/glyph-arena";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const draw = createDraw({ context: canvas.getContext("2d")! });

createLoop({
  onFrame: ({ delta }) => {
    draw.clear("#0d1626");
    draw.rect({ x: 40, y: 260, w: 60, h: 60, fill: "#f7b32b" });
    void delta;
  },
}).start();
```

`draw.clear` resets the transform before it paints, so a camera set in one frame cannot leave a strip
of the previous frame behind. `npm run dev` now shows a square on a dark background: the
plumbing works, and everything after this is game.

## 4. A level as text

A tile map is a list of equal-length strings plus a legend. `#` is solid, `.` is empty, and the cell
size is yours:

```ts
import { createTileMap, hasTag, solidInRect, surfaceRowBelow } from "@fogrexon/glyph-arena";

const LEVEL = [
  "................................",
  "................................",
  "..........#####.................",
  "................................",
  "########.......################",
  "################################",
];

const map = createTileMap(LEVEL.join("\n"), {
  legend: { "#": ["solid"] },
  cell: 32,
});
```

Row 5 is solid all the way across, so the gap in row 4 is a one-cell trench rather than a hole
into nothing: falling into it costs a jump, not the game.

`mapColumns(map)` and `mapRows(map)` give the size, `hasTag(map, column, row, "solid")` asks about one
cell, and `solidInRect(map, left, top, right, bottom, "solid")` asks about a box in pixels.

## 5. A body with gravity and a jump

The body takes no numbers of its own: gravity, jump velocity and the rest are your game's feel, so
you write them down once and the same object goes to `stepBody` every frame.

```ts
import { createBody, jumpHeightOf, stepBody } from "@fogrexon/glyph-arena";

const feel = {
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
  jumpCutFactor: 0.35,
};

// The floor's top edge is row 4, so y = 4 * 32 - 28 = 100 puts the body's feet on it.
const player = createBody({ x: 70, y: 100, w: 20, h: 28 }, feel);
console.log(jumpHeightOf(feel)); // 111.08 px, from the same config the body uses
```

`stepBody(player, { left, right, jump, jumpHeld }, delta, solid, { grid: 32 })` moves it. `solid` is
your own function, and the tile map already answers it:

```ts
const solid = (left: number, top: number, right: number, bottom: number) =>
  solidInRect(map, left, top, right, bottom, "solid");
```

`jump` is the press and `jumpHeld` is whether the button is still down: that pair is what makes a
short tap a short jump.

## 6. Input

```ts
import { createInput } from "@fogrexon/glyph-arena";

const input = createInput();
input.attach(window);

// inside onFrame
const keys = input.snapshot().keys;
const left = keys.has("ArrowLeft") || keys.has("KeyA");
const right = keys.has("ArrowRight") || keys.has("KeyD");
const jump = keys.has("Space");
```

`attach` takes any `EventTarget`, so the same code works on `window`, an element, or a test double.
`snapshot()` is a copy: the set you read cannot change under you mid-frame.

## 7. A camera that follows

```ts
import { createCamera } from "@fogrexon/glyph-arena";

const camera = createCamera();
// each frame, before drawing the world
camera.set({ x: player.x - canvas.width * 0.33, y: 0 });
draw.setView(camera.view(canvas.width, canvas.height));
// ... draw map and player in world pixels ...
draw.setView(null); // the HUD goes back to screen pixels
```

`draw.setView` takes the matrix `camera.view()` returns, and `null` restores screen coordinates. Draw
the world with a view and the HUD without one, in that order.

## 8. The HUD

```ts
draw.text({ text: `x ${Math.round(player.x)}`, x: 16, y: 16, size: 16, fill: "#e8eaed" });
draw.text({ text: "SCORE 0", x: canvas.width - 16, y: 16, size: 16, fill: "#e8eaed", align: "right" });
draw.measureText({ text: "SCORE 0", size: 16 }).width; // when you need the number itself
```

`text` puts `y` at the top of the line by default, so the same code does not look shifted down on
someone else's screen. `align: "right"` makes `x` the right edge; `measureText` gives the width when a
layout needs it as a number.

## The whole file

Everything above, in one file, in the order the frame runs it: `strict` TypeScript compiles this as it
stands. Two lines carry more weight than they look like — `dt` is clamped to `1 / 30` because `loop`
already clamps to `0.1 s`, and a long frame at that step would let the body pass through a wall;
`jump` is the press and `jumpHeld` is "still down", and that pair is what makes a short tap a short
jump.

```ts
import {
  createBody,
  createCamera,
  createDraw,
  createInput,
  createLoop,
  createTileMap,
  hasTag,
  jumpHeightOf,
  solidInRect,
  stepBody,
} from "@fogrexon/glyph-arena";

const CELL = 32;
const COLS = 32;
const ROWS = 6;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const draw = createDraw({ context: canvas.getContext("2d")! });
const input = createInput();
input.attach(window);

const LEVEL = [
  "................................",
  "................................",
  "..........#####.................",
  "................................",
  "########.......################",
  "################################",
];
const map = createTileMap(LEVEL.join("\n"), { legend: { "#": ["solid"] }, cell: CELL });

// Every number this game feels by lives here; the library holds none of them.
const feel = {
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
  jumpCutFactor: 0.35,
};

const solid = (left: number, top: number, right: number, bottom: number) =>
  solidInRect(map, left, top, right, bottom, "solid");

const player = createBody({ x: 70, y: 100, w: 20, h: 28 }, feel);
const camera = createCamera();

console.log(jumpHeightOf(feel)); // 111.08 px, from the same config the body uses

createLoop({
  onFrame: ({ delta }) => {
    const dt = Math.min(delta, 1 / 30); // a long frame must not teleport the body
    const keys = input.snapshot().keys;

    stepBody(
      player,
      {
        left: keys.has("ArrowLeft") || keys.has("KeyA"),
        right: keys.has("ArrowRight") || keys.has("KeyD"),
        jump: keys.has("Space"),
        jumpHeld: keys.has("Space"),
      },
      dt,
      solid,
      { grid: CELL },
    );

    draw.clear("#0d1626");

    camera.set({ x: player.x - canvas.width * 0.33, y: 0 });
    draw.setView(camera.view(canvas.width, canvas.height));

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (hasTag(map, col, row, "solid")) {
          draw.rect({ x: col * CELL, y: row * CELL, w: CELL, h: CELL, fill: "#2a3550" });
        }
      }
    }
    draw.rect({ x: player.x, y: player.y, w: player.w, h: player.h, fill: "#f7b32b" });

    draw.setView(null);
    draw.text({ text: `x ${Math.round(player.x)}`, x: 16, y: 16, size: 16, fill: "#e8eaed" });
    draw.text({
      text: "SCORE 0",
      x: canvas.width - 16,
      y: 16,
      size: 16,
      fill: "#e8eaed",
      align: "right",
    });
  },
}).start();
```

## What you have

A canvas, a text level, a body with gravity, coyote time and a jump buffer, a camera, and a HUD. That
is the vertical slice this repository's own samples are built from, and no art was needed.

Next, in this order:

- [The umbrella package](api-glyph-arena.html) — what else is in the one import.
- [body](api-body.html) and [tilemap](api-tilemap.html) — the two modules you just used, in full.
- [camera](api-camera.html), [draw](api-draw.html), [loop](api-loop.html) — the rest of the frame.
- [ecs](api-ecs.html), [collide](api-collide.html), [scene](api-scene.html) — when one rectangle is not enough.
