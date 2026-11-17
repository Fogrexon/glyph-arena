/**
 * Compiles against the **published surface** of every package, by name.
 *
 * The other typechecks in this repo resolve workspace packages through their
 * built declaration files, which only proves those declarations are usable
 * *by accident* and stops working the moment `tsconfig.base.json` maps sources
 * in. This fixture is the deliberate check: its tsconfig points the package
 * names at each package's emitted `dist/index.d.ts` (never at `src`), so it
 * goes red when a declaration is missing, unparsable, or stops exporting the
 * public API.
 *
 * It is type-only: nothing here is bundled or executed. The companion step
 * `pnpm check:package-entry-points` covers the other half — that each
 * `package.json` entry field points at a file that actually exists.
 */

import { createActions } from "@fogrexon/glyph-arena-actions";
import { createAssets } from "@fogrexon/glyph-arena-assets";
import { createAudio } from "@fogrexon/glyph-arena-audio";
import { createCamera } from "@fogrexon/glyph-arena-camera";
import { overlaps } from "@fogrexon/glyph-arena-collide";
import { createDraw } from "@fogrexon/glyph-arena-draw";
import { createWorld } from "@fogrexon/glyph-arena-ecs";
import { createGamepad } from "@fogrexon/glyph-arena-gamepad";
import { createInput } from "@fogrexon/glyph-arena-input";
import { createLoop } from "@fogrexon/glyph-arena-loop";
import { createForest } from "@fogrexon/glyph-arena-scene";
import { createTimer } from "@fogrexon/glyph-arena-timer";
import { createTransform } from "@fogrexon/glyph-arena-transform";
import { approach, createTween } from "@fogrexon/glyph-arena-tween";

import type { Actions } from "@fogrexon/glyph-arena-actions";
import type { Assets } from "@fogrexon/glyph-arena-assets";
import type { Audio } from "@fogrexon/glyph-arena-audio";
import type { Camera } from "@fogrexon/glyph-arena-camera";
import type { Aabb } from "@fogrexon/glyph-arena-collide";
import type { Draw } from "@fogrexon/glyph-arena-draw";
import type { World } from "@fogrexon/glyph-arena-ecs";
import type { GamepadReader } from "@fogrexon/glyph-arena-gamepad";
import type { Input } from "@fogrexon/glyph-arena-input";
import type { Loop } from "@fogrexon/glyph-arena-loop";
import type { Forest } from "@fogrexon/glyph-arena-scene";
import type { Timer } from "@fogrexon/glyph-arena-timer";
import type { Transform } from "@fogrexon/glyph-arena-transform";
import type { Tween } from "@fogrexon/glyph-arena-tween";

import { createWorld as createWorldFromUmbrella } from "@fogrexon/glyph-arena";
import type { Matrix2D as UmbrellaMatrix2D } from "@fogrexon/glyph-arena";

/** One export per package: fails if a value export is missing or renamed. */
export const publicFactories = {
  actions: createActions,
  assets: createAssets,
  audio: createAudio,
  camera: createCamera,
  collide: overlaps,
  draw: createDraw,
  ecs: createWorld,
  gamepad: createGamepad,
  input: createInput,
  loop: createLoop,
  scene: createForest,
  timer: createTimer,
  transform: createTransform,
  tween: createTween,
  // Not just the factory: a second value export proves the package surface reaches consumers.
  tweenApproach: approach,
} satisfies Record<string, unknown>;

/** One type per package: fails if a declaration stops exporting it. */
export type PublicTypes = {
  actions: Actions;
  assets: Assets;
  audio: Audio;
  camera: Camera;
  collide: Aabb;
  draw: Draw;
  ecs: World;
  gamepad: GamepadReader;
  input: Input;
  loop: Loop;
  scene: Forest;
  timer: Timer;
  transform: Transform;
  tween: Tween;
};

/**
 * The single package intended for npm. Its flat surface must resolve by name
 * too: the umbrella re-exports through relative paths inside its own `dist/`,
 * never through the (unpublished) sibling package names.
 */
export const publicUmbrella = {
  ecs: createWorldFromUmbrella,
} satisfies Record<string, unknown>;

export type PublicUmbrellaTypes = {
  matrix: UmbrellaMatrix2D;
};
