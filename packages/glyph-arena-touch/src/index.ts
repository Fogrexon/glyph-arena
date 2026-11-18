/**
 * On-screen controls: which zone a finger is on, whether that finger still counts as down, and the
 * direction a stick is pushed in.
 *
 * Both samples grew this by hand — a circular stick in one, three rectangles in the other — and they
 * grew the same two bugs with it:
 *
 * 1. **A tap shorter than a frame is invisible.** The pad is sampled once per frame, so a finger
 *    that lands and lifts between two samples was never down at all; the test harness had to hold
 *    every press for 150–160 ms, and a machine that did not was told the game was broken. The fix is
 *    not a longer hold in the harness, it is a definition of "down" here: a press keeps `held` true
 *    for `holdMs` after the last frame that saw the finger.
 * 2. **"The first pointer" is not "the finger on the pad".** The other thumb is usually somewhere
 *    else, so every zone looks at all pointers, and two zones that overlap both answer true —
 *    collapsing that to one would hide a layout mistake instead of showing it.
 *
 * ## Three verbs, because they answer three different questions
 *
 * Using it from the samples added the third. A `held` that keeps answering for `holdMs` after the
 * finger leaves is right for a button — a tap has to survive the gap between two frames — and wrong
 * for a direction: the runner's right pad still said "held" 150 ms after the thumb lifted, so the
 * runner kept walking into the pit it was stopping for. So `down` is presence with no hold, `held`
 * is a press, `pressed` is the edge, and a game picks per zone.
 *
 * ## What this package does not do
 *
 * No drawing: the zones are geometry, and `draw.rect` already draws rectangles. No DOM-to-canvas
 * conversion either: `zones` and `pointers` are in the same units, and the scale that turns a CSS
 * pixel into a canvas pixel (`canvas.height / 540`) belongs to a screen-space package, not here —
 * baking 540 in would make every game that is not 540 tall wrong.
 *
 * ## Time
 *
 * `update` takes `dt` in seconds, not a timestamp. A pad is a state machine over "how long has this
 * been held", and feeding it wall time would make the same input sequence produce different results
 * on a slow machine — which is exactly the flakiness the samples spent a day removing.
 *
 * ## Two conventions, both written down
 *
 * - a rectangle is half open, `[x, x + w)` × `[y, y + h)`, like `solidInRect`;
 * - a circle includes its boundary.
 */

export type TouchZone =
  /** A rectangle in the same pixels as the caller's drawing. Half open. */
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  /** A stick. Returns a direction, not a position. */
  | {
      readonly kind: "circle";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      /** Movement smaller than this is no direction at all — required, because it is feel. */
      readonly deadZone: number;
    };

export type TouchControlsConfig = {
  readonly zones: Readonly<Record<string, TouchZone>>;
  /**
   * How long a press survives after the last frame that saw the finger, in milliseconds.
   * Required: a tap that lands and lifts between two frames is how a phone is used, and how long
   * it counts for is the game's decision, not a default.
   */
  readonly holdMs: number;
};

export type TouchPointer = { readonly id: number; readonly x: number; readonly y: number };

export type TouchControls = {
  /** Feed this frame's pointers and the frame's `dt` in seconds. Call once per frame. */
  update: (pointers: readonly TouchPointer[], dtSeconds: number) => void;
  /** Is a finger in this zone *right now*? No hold. Movement is this one. */
  down: (name: string) => boolean;
  /** Is a finger in this zone, or a press still inside its hold? Overlapping zones both answer. */
  held: (name: string) => boolean;
  /** One frame only: the frame this zone went from nothing to something. */
  pressed: (name: string) => boolean;
  /** A `circle` zone's direction, normalised to `-1..1` per axis; zero inside the dead zone. */
  axis: (name: string) => { x: number; y: number };
};

const MS_PER_SECOND = 1000;

function insideZone(zone: TouchZone, x: number, y: number): boolean {
  if (zone.kind === "rect") {
    return x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
  }

  const dx = x - zone.x;
  const dy = y - zone.y;
  return dx * dx + dy * dy <= zone.radius * zone.radius;
}

export function createTouchControls(config: TouchControlsConfig): TouchControls {
  /** Seconds of hold left, per zone. The zone is "down" while it is in this map. */
  const holdLeft = new Map<string, number>();
  /** Zones a finger is inside *this* frame, before the hold. */
  const inside = new Set<string>();
  /** The pointer a stick is following: the first one that entered, kept while it stays. */
  const tracked = new Map<string, number>();
  const fresh = new Set<string>();
  const axes = new Map<string, { x: number; y: number }>();
  const holdSeconds = config.holdMs / MS_PER_SECOND;

  const update = (pointers: readonly TouchPointer[], dtSeconds: number): void => {
    const step = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;

    fresh.clear();
    inside.clear();
    axes.clear();

    // The hold runs out first: a press recorded last frame and not seen this one still has the
    // whole of `holdMs` ahead of it, and `held` stays true until that is spent.
    for (const [name, left] of holdLeft) {
      const next = left - step;
      if (next > 0) holdLeft.set(name, next);
      else holdLeft.delete(name);
    }

    for (const [name, zone] of Object.entries(config.zones)) {
      const on = pointers.filter((pointer) => insideZone(zone, pointer.x, pointer.y));

      if (on.length > 0) {
        inside.add(name);
        // An edge is "this zone had nothing and now has something". A second thumb arriving while
        // the first is still there is not a second press.
        if (!holdLeft.has(name)) fresh.add(name);
        holdLeft.set(name, holdSeconds);
      }

      if (zone.kind !== "circle") continue;

      const id = tracked.get(name);
      const following = on.find((pointer) => pointer.id === id) ?? (id === undefined ? on[0] : undefined);

      if (following === undefined) {
        // The finger this stick was following left. It does not hand over to the other one: the
        // axis snapping to a second thumb mid-push is how a stick feels broken.
        tracked.delete(name);
        axes.set(name, { x: 0, y: 0 });
        continue;
      }

      tracked.set(name, following.id);
      axes.set(name, directionOf(zone, following));
    }
  };

  const down = (name: string): boolean => inside.has(name);

  const held = (name: string): boolean => holdLeft.has(name);

  const pressed = (name: string): boolean => fresh.has(name);

  const axis = (name: string): { x: number; y: number } => axes.get(name) ?? { x: 0, y: 0 };

  return { update, down, held, pressed, axis };
}

/** Direction of a stick, normalised: inside the dead zone it is zero, at the rim it is length 1. */
function directionOf(
  zone: { readonly x: number; readonly y: number; readonly radius: number; readonly deadZone: number },
  pointer: TouchPointer,
): { x: number; y: number } {
  const dx = pointer.x - zone.x;
  const dy = pointer.y - zone.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= zone.deadZone || distance === 0) return { x: 0, y: 0 };

  const strength = Math.min(1, (distance - zone.deadZone) / (zone.radius - zone.deadZone));
  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}
