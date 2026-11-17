/**
 * The wave script — the one place a run's difficulty is decided.
 *
 * Each row is the *shape* of an enemy (angle, speed, radius). When it spawns is
 * **derived** from when it should reach the player:
 *
 *     contact = at + (radius - CONTACT_DISTANCE) / speed
 *     at      = contact - (radius - CONTACT_DISTANCE) / speed
 *
 * Two properties make a run readable: enemies arrive in the order they were
 * spawned, and no two arrive within `CONTACT_SPACING` of each other. Writing the
 * table as target contact times keeps both true by construction, and
 * `test/waves.test.ts` is the backstop for the day someone edits a speed or a
 * radius without moving the row.
 *
 * No RNG: a given run index is always the same run.
 */
export type Wave = { at: number; angle: number; speed: number; radius: number };

/** The player (28 px) and enemy (24 px) boxes touch at a 26 px centre distance. */
export const CONTACT_DISTANCE = 26;

/** Seconds between arrivals. Below this you cannot read one enemy and answer the next. */
export const CONTACT_SPACING = 0.9;

/** The onboarding enemy, unchanged: 1.8 s at 55 px/s from radius 340. */
export const FIRST_WAVE = { at: 1.8, angle: 90, speed: 55, radius: 340 };

const FIRST_CONTACT = FIRST_WAVE.at + (FIRST_WAVE.radius - CONTACT_DISTANCE) / FIRST_WAVE.speed;

/** Angle, speed and radius per wave — 20 rows, the first one is the onboarding enemy. */
const SHAPES: ReadonlyArray<{ angle: number; speed: number; radius: number }> = [
  { angle: FIRST_WAVE.angle, speed: FIRST_WAVE.speed, radius: FIRST_WAVE.radius },
  { angle: 270, speed: 78, radius: 360 },
  { angle: 0, speed: 84, radius: 360 },
  { angle: 180, speed: 90, radius: 360 },
  { angle: 45, speed: 96, radius: 380 },
  { angle: 225, speed: 100, radius: 380 },
  { angle: 135, speed: 104, radius: 380 },
  { angle: 315, speed: 108, radius: 380 },
  { angle: 90, speed: 112, radius: 400 },
  { angle: 270, speed: 116, radius: 400 },
  { angle: 20, speed: 120, radius: 400 },
  { angle: 200, speed: 124, radius: 400 },
  { angle: 110, speed: 128, radius: 400 },
  { angle: 290, speed: 132, radius: 400 },
  { angle: 60, speed: 136, radius: 420 },
  { angle: 240, speed: 140, radius: 420 },
  { angle: 150, speed: 144, radius: 420 },
  { angle: 330, speed: 148, radius: 420 },
  { angle: 75, speed: 152, radius: 420 },
  { angle: 255, speed: 156, radius: 420 },
];

/** The angle, speed and radius of wave `index` -- no `at` yet. */
export type WaveShape = { angle: number; speed: number; radius: number };

/** Past this the player cannot read one arrival before the next, so the ramp stops. */
export const MAX_SPEED = 220;

/** The last scripted speed; the generated waves keep climbing from here. */
const LAST_SCRIPTED_SPEED = 156;

/** How far the angle turns on each lap past the script, so a second lap is not the first. */
const LAP_TURN = 17;

/**
 * The shape of wave `index`, for a run that does not stop at twenty.
 *
 * The first twenty are the script, unchanged: that is the opening players learn
 * on. Past it the rule continues without inventing anything -- the same twenty
 * angles, turned one step further every lap so lap two cannot be memorised as
 * lap one, and a speed that keeps climbing until `MAX_SPEED`.
 *
 * Deterministic on purpose (no RNG): wave 40 is the same wave 40 in every run,
 * so a score can be compared between runs at all.
 */
export function waveShapeAt(index: number): WaveShape {
  const scripted = SHAPES[index];
  if (scripted !== undefined) {
    return scripted;
  }
  const lap = Math.floor(index / SHAPES.length);
  const base = SHAPES[index % SHAPES.length] as WaveShape;
  const beyond = index - SHAPES.length;
  return {
    angle: (base.angle + LAP_TURN * lap) % 360,
    speed: Math.min(LAST_SCRIPTED_SPEED + (beyond + 1) * 2, MAX_SPEED),
    radius: Math.min(base.radius + lap * 10, 520),
  };
}

/** When this wave reaches the player, in seconds from the start of the run. */
export function contactTimeOf(wave: Wave): number {
  return wave.at + (wave.radius - CONTACT_DISTANCE) / wave.speed;
}

/**
 * Wave `index` as the loop spawns it: the shape above, timed so it reaches the
 * player at `FIRST_CONTACT + index * CONTACT_SPACING`.
 *
 * Index is unbounded; the run picks how far it goes.
 */
export function waveAt(index: number): Wave {
  const shape = waveShapeAt(index);
  if (index === 0) {
    return { ...shape, at: FIRST_WAVE.at };
  }
  const contact = FIRST_CONTACT + index * CONTACT_SPACING;
  return { ...shape, at: contact - (shape.radius - CONTACT_DISTANCE) / shape.speed };
}

/** The scripted twenty, derived from the same `waveAt` the endless run will use. */
export const WAVES: Wave[] = SHAPES.map((_shape, index) => waveAt(index));
