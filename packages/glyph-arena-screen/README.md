# @fogrexon/glyph-arena-screen

Screen space: the CSS box a canvas is laid out in, the bitmap it actually is, and the ratio between them.

```ts
import { fitToWindow, measureCanvas, toCanvasPoint } from "@fogrexon/glyph-arena-screen";

// Size the canvas to the window, and keep it that way.
fitToWindow(canvas, window, { onResize: () => rebuildTouchZones() });

// Once per frame, convert the pointers the input reports (CSS pixels) to canvas pixels.
const measured = measureCanvas(canvas);
const point = toCanvasPoint(pointer, measured.box, measured.size);
```

## API

- `screenScale(box, size)` → `{ x, y }`, bitmap pixels per CSS pixel. A zero-sized box answers `1`, not
  `Infinity`.
- `toCanvasPoint(point, box, size)` → the same position in bitmap pixels. Nothing is clamped: a point
  outside the box comes back outside the bitmap.
- `measureCanvas(canvas)` → `{ box, size, scale }`, with one `getBoundingClientRect()` per call.
- `fitToWindow(canvas, window, { onResize? })` → `{ resize(), stop() }`. Sets the bitmap to
  `innerWidth x innerHeight` at construction and on every resize; `onResize` runs after the new size is
  in place, so geometry built from `canvas.width` sees the new number.

## Two bugs this is here to stop

- A pointer arrives in **CSS pixels**; the game draws in **bitmap pixels**. On a phone those differ, and
  comparing one with the other puts the touch buttons where the player cannot see them.
- The canvas has to be told its size, and told again when the window changes. Forgetting the listener is
  invisible until someone resizes.

## What it does not decide

How big the game is. The bitmap is the host's number; a game that draws a fixed 640x360 view scales
*inside* the canvas, and that transform is a camera decision.

Nothing here imports a DOM type: every function takes the smallest structural shape it needs, so the
maths is testable with numbers.
