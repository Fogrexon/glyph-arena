# @fogrexon/glyph-arena-screen

Screen space: the CSS box a canvas is laid out in, the bitmap it actually is, and the ratio between them. See also [package README](../packages/glyph-arena-screen/README.md).

## Exports

| Name | Kind |
|------|------|
| `screenScale`, `toCanvasPoint`, `measureCanvas`, `fitToWindow` | functions |
| `ScreenSize`, `ScreenBox`, `ScreenPoint`, `ScreenScale`, `MeasuredCanvas`, `CanvasLike`, `CanvasSized`, `WindowLike`, `FitOptions`, `WindowFit` | types |

This package does not import a sibling `@fogrexon/glyph-arena-*` package.

## The two bugs this exists to stop

**A pointer arrives in CSS pixels and the game draws in bitmap pixels.** The canvas bitmap is `innerWidth x innerHeight` while the layout gives the element whatever the page decides, so on a phone those are different numbers. Comparing one against the other puts the touch buttons somewhere the player cannot see.

**A canvas has to be told its size, and told again when the window changes.** Three samples wrote the same `resize()` and the same `addEventListener`; forgetting the listener is invisible until someone resizes the window.

## Converting a pointer

```ts
const measured = measureCanvas(canvas); // once per frame, not once per pointer
const point = toCanvasPoint(pointer, measured.box, measured.size);

measured.scale; // bitmap px per CSS px, per axis
```

- `screenScale(box, size)` is `{ x: size.width / box.width, y: size.height / box.height }`. The axes are independent: a canvas whose CSS box has a different aspect ratio from its bitmap is stretched, and one scale for both would put the pointer on the right pixel of the wrong row.
- **A zero-sized box reports scale `1`, not `Infinity`.** `display: none` and the frame before the page is laid out both give a zero box; `Infinity` turns every later coordinate into `NaN`, and a game never recovers from that. This guard is the line everybody forgets, because it only runs while the page is hidden.
- A point outside the box comes back outside the bitmap, sign and all. Nothing is clamped: a thumb that slid off the left edge is at a negative x, and clamping to 0 would hide the drag.

`measureCanvas` reads `getBoundingClientRect()` exactly once. A frame with two thumbs on the screen would otherwise pay for the same answer twice, and `getBoundingClientRect` forces layout.

## Sizing the canvas

```ts
const fit = fitToWindow(canvas, window, {
  onResize: () => rebuildTouchZones(), // runs after the new size is in place
});

fit.resize(); // size it now, without waiting for an event
fit.stop();   // stop listening; safe to call twice
```

`fitToWindow` sets the bitmap to `innerWidth x innerHeight` **times the device pixel ratio** at construction and on every `resize`, and returns the `ratio` it applied (`canvas.width / innerWidth`, which is not the requested ratio when the canvas rounds). Geometry kept in canvas pixels (a touch pad, a HUD layout) belongs in `onResize`: rebuilding it on the frame instead would throw away a press in flight, and a resize can afford that while a frame cannot.

## What this package does not decide

**How big the game is.** The bitmap is the host's number — a phone and a laptop want different ones — and a game that draws a fixed 640x360 view scales *inside* the canvas. That transform is a camera decision, not a screen one, which is why `fitToWindow` has no `viewWidth`/`viewHeight`.

## No DOM types

Everything takes the smallest structural shape it needs (`width`/`height` and a bounding box; `innerWidth`/`innerHeight` and two listener methods), so the maths is testable with numbers and a game can pass a mock. Nothing here imports `HTMLCanvasElement` or `Window`.
