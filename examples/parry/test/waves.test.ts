import assert from "node:assert/strict";
import { test } from "node:test";

import { CONTACT_SPACING, FIRST_WAVE, WAVES, contactTimeOf, type Wave } from "../src/waves.ts";

const contacts = WAVES.map(contactTimeOf);

function waveAt(index: number): Wave {
  const wave = WAVES[index];
  assert.ok(wave !== undefined, `wave ${index} is missing`);
  return wave;
}

function seconds(value: number): string {
  return `${value.toFixed(3)}s`;
}

test("twenty waves, and the onboarding enemy is untouched", () => {
  assert.equal(WAVES.length, 20);
  assert.equal(waveAt(0).at, FIRST_WAVE.at);
  assert.equal(waveAt(0).speed, FIRST_WAVE.speed);
  assert.equal(waveAt(0).radius, FIRST_WAVE.radius);
});

test("enemies reach the player in the order they were spawned", () => {
  for (let index = 1; index < contacts.length; index += 1) {
    const previous = contacts[index - 1] as number;
    const current = contacts[index] as number;
    assert.ok(
      current > previous,
      `wave ${index + 1} arrives at ${seconds(current)}, not after wave ${index} at ${seconds(previous)}`,
    );
  }
});

test("no two enemies arrive closer than the reaction gap", () => {
  for (let index = 1; index < contacts.length; index += 1) {
    const gap = (contacts[index] as number) - (contacts[index - 1] as number);
    assert.ok(
      gap >= CONTACT_SPACING - 1e-9,
      `waves ${index} and ${index + 1} arrive ${seconds(gap)} apart, need ${seconds(CONTACT_SPACING)}`,
    );
  }
});

test("spawn times rise too, so no row is held back by a later time above it", () => {
  for (let index = 1; index < WAVES.length; index += 1) {
    const previous = waveAt(index - 1);
    const current = waveAt(index);
    assert.ok(
      current.at > previous.at,
      `wave ${index + 1} spawns at ${seconds(current.at)}, not after wave ${index} at ${seconds(previous.at)}`,
    );
  }
});
