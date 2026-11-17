# @fogrexon/glyph-arena-touch

On-screen controls: which zone a finger is on, whether it still counts as down, and how far a stick
is pushed.

```ts
const pad = createTouchControls({
  zones: {
    stick: { kind: "circle", x: 100, y: 400, radius: 80, deadZone: 16 },
    jump: { kind: "rect", x: 600, y: 300, w: 72, h: 72 },
  },
  holdMs: 150,
});

// every frame, with the frame's dt in seconds
pad.update(pointers, dt);

pad.held("jump"); // down now, or a press still inside its hold
pad.pressed("jump"); // this frame only: it went from nothing to something
pad.axis("stick"); // { x, y } normalised to -1..1, zero inside the dead zone
```

## Why the hold is required

The pad is sampled once per frame, so a tap that lands and lifts between two samples was never down
at all — and every test that drove the game mechanically had to hold each press for 150 ms, which is
a property of the harness, not of the game. `holdMs` moves that definition into the library: a press
keeps `held` true for `holdMs` after the last frame that saw the finger, and `pressed` fires once, on
the frame it landed.

## What it deliberately does not do

- **No drawing.** The zones are geometry; `draw.rect` already draws rectangles, and a pad that drew
  itself would bake in a scale and a safe area.
- **No DOM-to-canvas conversion.** `zones` and `pointers` are in the same units. Turning a CSS pixel
  into a canvas pixel is a screen-space job (`canvas.height / 540` is the game's number, not this
  package's).
- **No `update(pointers, now)`.** Time comes as `dt` in seconds and is accumulated, so the same list
  of frames produces the same result on any machine.

## Conventions

- a rectangle is half open, `[x, x + w)` × `[y, y + h)`, like `solidInRect`;
- a circle includes its boundary;
- overlapping zones both answer `true` — collapsing them would hide a layout mistake;
- a stick follows the first pointer that entered it, and is released when that pointer leaves rather
  than handing over to a second thumb.
