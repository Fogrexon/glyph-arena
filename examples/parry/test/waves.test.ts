import assert from "node:assert/strict";
import { test } from "node:test";

import { CONTACT_SPACING, FIRST_WAVE, MAX_SPEED, WAVES, contactTimeOf, waveAt, waveShapeAt } from "../src/waves.ts";

const contacts = WAVES.map(contactTimeOf);

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

test("the scripted twenty are what the generator returns, wave for wave", () => {
  for (const [index, wave] of WAVES.entries()) {
    assert.deepEqual(waveShapeAt(index), { angle: wave.angle, speed: wave.speed, radius: wave.radius });
    assert.deepEqual(waveAt(index), wave);
  }
});

test("past twenty the run keeps going and the arrivals keep their gap", () => {
  let previous = contactTimeOf(waveAt(WAVES.length - 1));
  for (let index = WAVES.length; index < 200; index += 1) {
    const contact = contactTimeOf(waveAt(index));
    assert.ok(contact - previous >= CONTACT_SPACING - 1e-9, `wave ${index + 1} arrives too early`);
    previous = contact;
  }
});

test("the speed climbs to a cap and stops there", () => {
  let previous = waveShapeAt(WAVES.length).speed;
  assert.ok(previous > waveShapeAt(WAVES.length - 1).speed, "the ramp has to start");
  for (let index = WAVES.length + 1; index < 400; index += 1) {
    const speed = waveShapeAt(index).speed;
    assert.ok(speed >= previous, `wave ${index + 1} is slower than the one before it`);
    previous = speed;
  }
  assert.equal(waveShapeAt(400).speed, MAX_SPEED);
});

test("a later lap is not the first lap memorised", () => {
  for (let index = 0; index < WAVES.length; index += 1) {
    assert.notEqual(
      waveShapeAt(index).angle,
      waveShapeAt(index + WAVES.length).angle,
      `wave ${index + 21} repeats wave ${index + 1} exactly`,
    );
  }
});

test("the same index is the same wave in every run", () => {
  for (const index of [0, 19, 20, 57, 130]) {
    assert.deepEqual(waveAt(index), waveAt(index));
  }
});
