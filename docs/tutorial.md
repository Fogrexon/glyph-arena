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
pnpm --filter @fogrexon/glyph-arena pack     # writes fogrexon-glyph-arena-<version>.tgz here
npm install /path/to/glyph-arena/fogrexon-glyph-arena-<version>.tgz
```

`<version>` is the umbrella's `version`; `pack` prints the file name it wrote. The rest of this
page is unchanged either way.

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

let wasHeld = false; // module scope, next to the body

// inside onFrame
const keys = input.snapshot().keys;
const left = keys.has("ArrowLeft") || keys.has("KeyA");
const right = keys.has("ArrowRight") || keys.has("KeyD");
const jumpHeld = keys.has("Space");
const jump = jumpHeld && !wasHeld; // the edge, not the hold
wasHeld = jumpHeld;
```

`attach` takes any `EventTarget`, so the same code works on `window`, an element, or a test double.
`snapshot()` is a copy: the set you read cannot change under you mid-frame.

`jump` is the edge and `jumpHeld` is the level. `stepBody` arms its jump buffer for as long as
`input.jump` is true, so handing it the held state for both makes the body jump again the moment it
lands — the difference between "jump" and "bounce for as long as the key is down".

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
let jumpWasHeld = false; // `jump` is the edge: a press, not "the key is down"

console.log(jumpHeightOf(feel)); // 111.08 px, from the same config the body uses

createLoop({
  onFrame: ({ delta }) => {
    const dt = Math.min(delta, 1 / 30); // a long frame must not teleport the body
    const keys = input.snapshot().keys;
    const jumpHeld = keys.has("Space");
    const jump = jumpHeld && !jumpWasHeld;
    jumpWasHeld = jumpHeld;

    stepBody(
      player,
      {
        left: keys.has("ArrowLeft") || keys.has("KeyA"),
        right: keys.has("ArrowRight") || keys.has("KeyD"),
        jump,
        jumpHeld,
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

## On a phone

**These four functions arrived in `0.3.0`.** If your install predates that, this prints `false` and
the section below does not apply — the block above runs on every version either way:

```bash
node -e "import('@fogrexon/glyph-arena').then(m => console.log('createTouchControls' in m))"
```

The file above reads the keyboard, and a phone has none. Four functions close that gap, and they come
from the same import. This is the next five minutes, not a second tutorial: the block above stays the
fast path, and nothing here changes it.

The canvas has to be sized by the game rather than by CSS. `fitToWindow` sets the bitmap to the window
and keeps it set; its `onResize` is where anything measured in canvas pixels — the touch pad below —
has to be rebuilt, because the numbers it was built from just changed.

```ts
import { fitToWindow } from "@fogrexon/glyph-arena";

let pad = buildPad(canvas.width, canvas.height);
const fit = fitToWindow(canvas, window, {
  onResize: () => {
    pad = buildPad(canvas.width, canvas.height);
  },
});
```

Pointers arrive in **CSS** pixels — where the page put the canvas — while the game draws in **bitmap**
pixels, and on a phone those are different numbers. `measureCanvas` reads the box, the size and the
ratio in one go and `toCanvasPoint` converts. Measure once per frame and reuse it: `getBoundingClientRect`
forces layout, and two thumbs on the same frame do not need it twice.

```ts
import { measureCanvas, toCanvasPoint } from "@fogrexon/glyph-arena";

// in onFrame, before pad.update
const measured = measureCanvas(canvas);
const points = input.snapshot().pointers.map((pointer) => ({
  id: pointer.id,
  ...toCanvasPoint({ x: pointer.x, y: pointer.y }, measured.box, measured.size),
}));
```

`createTouchControls` turns those points into zones, in the same pixels the game draws in. It needs
`holdMs` because a tap can land and lift between two frames, and how long such a tap still counts is
the game's call; `down` is "a finger is there right now", `held` outlives the finger by that window,
`pressed` is true for one frame, and `axis` gives a stick's direction (a `circle` zone) rather than a
position.

```ts
import { createTouchControls } from "@fogrexon/glyph-arena";

function buildPad(width: number, height: number) {
  const margin = 24;
  const gap = 12;
  // Three squares and the gaps have to fit across the screen, so the size comes from the width.
  const size = Math.min(120, Math.floor((width - margin * 2 - gap * 2) / 3));
  const y = height - size - margin;
  return createTouchControls({
    zones: {
      left: { kind: "rect", x: margin, y, w: size, h: size },
      right: { kind: "rect", x: margin + size + gap, y, w: size, h: size },
      jump: { kind: "rect", x: width - margin - size, y, w: size, h: size },
    },
    holdMs: 120,
  });
}
```

`size` is derived rather than fixed because a constant does not fit a phone: three 120 px squares plus
the margins need 432 px, and below that the right zone and the jump zone overlap — by 30 px at 390 px
wide, 60 px at 360 px — so a thumb in the overlap walks and jumps at once. Deriving the size keeps 120
where there is room and shrinks it where there is not.

The frame then reads both sources into the same two variables, and the edge stays where it already
was — one edge over "the button is down", whichever button that is:

```ts
pad.update(points, dt);

const jumpHeld = keys.has("Space") || pad.held("jump");
const jump = jumpHeld && !jumpWasHeld;
jumpWasHeld = jumpHeld;

const left = keys.has("ArrowLeft") || keys.has("KeyA") || pad.down("left");
const right = keys.has("ArrowRight") || keys.has("KeyD") || pad.down("right");
```

Two things outside the library still matter. Give the canvas `touch-action: none` in CSS, or a drag
scrolls the page instead of moving the character. And draw the pad yourself with `draw.rect`: the
zones are where the fingers are, not what they look like, and the library has no opinion about that.
