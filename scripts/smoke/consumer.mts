/**
 * Consumer used by `scripts/smoke-pack-install.mjs`.
 *
 * It is copied into a throwaway project where the 14 packed tarballs are
 * installed, so every import below must resolve through the published
 * `exports`/`types` fields — not through this repo's workspace links.
 * Keep it in sync with `fixtures/public-api/index.mts`.
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
import { createTween } from "@fogrexon/glyph-arena-tween";

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

export const factories = {
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
} satisfies Record<string, unknown>;

export type Types = {
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
