# @fogrexon/glyph-arena-touch

On-screen controls: which zone a finger is on, whether it still counts as down, and how far a stick
is pushed. See also [package README](../packages/glyph-arena-touch/README.md).

## Exports

Generated from the package's source when the docs are built — do not edit this table by hand.

## `createTouchControls({ zones, holdMs })`

```ts
const pad = createTouchControls({
  zones: {
    stick: { kind: "circle", x: 100, y: 400, radius: 80, deadZone: 16 },
    jump: { kind: "rect", x: 600, y: 300, w: 72, h: 72 },
  },
  holdMs: 150,
});

pad.update(pointers, dt); // every frame: this frame's pointers, and dt in seconds
pad.held("jump"); // down now, or a press still inside its hold
pad.pressed("jump"); // this frame only: it went from nothing to something
pad.axis("stick"); // { x, y }, normalised to -1..1, zero inside the dead zone
```

## Why `holdMs` is required

The pad is sampled once per frame, so a tap that lands and lifts between two samples was never down at
all — which is why every mechanical test had to hold a press for 150 ms. That is a property of the
harness, not of the game, so the definition lives here instead: a press keeps `held` true for `holdMs`
after the last frame that saw the finger, and `pressed` fires once, on the frame it landed.

## What it does not do

- **It does not draw.** The zones are geometry; `draw.rect` already draws rectangles, and a pad that drew itself would bake in a scale and a safe area.
- **It does not convert DOM coordinates.** `zones` and `pointers` are in the same units; turning a CSS pixel into a canvas pixel (`canvas.height / 540`) is a screen-space job.
- **It does not read the clock.** `update` takes `dt` in seconds and accumulates it, so the same list of frames gives the same result on any machine.

## Conventions

A rectangle is half open, `[x, x + w)` × `[y, y + h)`, like `solidInRect`; a circle includes its
boundary. Overlapping zones both answer `true`. A stick stays with the first pointer that entered it
and is released when that pointer leaves, rather than handing over to a second thumb.
