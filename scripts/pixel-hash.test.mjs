import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  SCENES,
  compareSamples,
  environmentOf,
  environmentProblem,
  formatMismatch,
  goldenFileFor,
} from "./pixel-hash.mjs";

const ENVIRONMENT = environmentOf({
  chromium: "156.0.8078.79",
  platform: "linux",
  viewport: "900x540",
  deviceScaleFactor: 1,
  font: 210.5,
});

const golden = (overrides = {}) => ({
  scene: "runner-1",
  environment: { ...ENVIRONMENT, ...overrides },
  sampleFrames: [60, 120, 180],
  samples: [
    { frame: 60, sha256: "a".repeat(64) },
    { frame: 120, sha256: "b".repeat(64) },
    { frame: 180, sha256: "c".repeat(64) },
  ],
});

describe("environmentProblem", () => {
  it("compares within a major version, and refuses across one — naming both versions", () => {
    // The design's rule is the *major*: 156.0.8078.79 and 156.0.9000.1 are the same rendering
    // engine as far as this gate is allowed to assume.
    assert.equal(environmentProblem(golden({ chromium: "156.0.9000.1" }).environment, ENVIRONMENT), null);

    const problem = environmentProblem(golden({ chromium: "155.0.7000.1" }).environment, ENVIRONMENT);
    assert.match(problem, /155\.0\.7000\.1/);
    assert.match(problem, /156\.0\.8078\.79/);
    assert.match(problem, /different major/);
  });

  it("refuses when the font probe moves, because the same font name can be a different file", () => {
    const problem = environmentProblem(golden({ font: 199 }).environment, ENVIRONMENT);
    assert.match(problem, /font probe/);
    assert.match(problem, /210\.5/);
  });

  it("refuses on platform, viewport and deviceScaleFactor, and says which side is which", () => {
    assert.match(environmentProblem(golden({ platform: "darwin" }).environment, ENVIRONMENT), /darwin/);
    assert.match(environmentProblem(golden({ viewport: "800x540" }).environment, ENVIRONMENT), /800x540/);
    assert.match(environmentProblem(golden({ deviceScaleFactor: 2 }).environment, ENVIRONMENT), /deviceScaleFactor 2/);
  });
});

describe("compareSamples", () => {
  const samples = [
    { frame: 60, sha256: "a".repeat(64) },
    { frame: 120, sha256: "b".repeat(64) },
    { frame: 180, sha256: "c".repeat(64) },
  ];

  it("is silent when every frame matches", () => {
    assert.deepEqual(compareSamples(golden(), samples), []);
  });

  it("names the frame, the golden hash and the measured hash when one moves", () => {
    const moved = samples.map((sample) => (sample.frame === 120 ? { ...sample, sha256: "d".repeat(64) } : sample));
    const mismatches = compareSamples(golden(), moved);

    assert.equal(mismatches.length, 1);
    assert.deepEqual(mismatches[0], { frame: 120, expected: "b".repeat(64), measured: "d".repeat(64) });
  });

  it("reports a frame the run did not sample, rather than passing on the frames it did", () => {
    const mismatches = compareSamples(golden(), samples.slice(0, 2));

    assert.deepEqual(mismatches, [{ frame: 180, expected: "c".repeat(64), measured: null }]);
  });

  it("reports a frame the golden never had, so a new sample cannot slip in unnoticed", () => {
    const mismatches = compareSamples(golden(), [...samples, { frame: 240, sha256: "e".repeat(64) }]);

    assert.deepEqual(mismatches, [{ frame: 240, expected: null, measured: "e".repeat(64) }]);
  });
});

describe("formatMismatch", () => {
  it("says which scene, which frame, and both hashes — a red that can be read without the log above it", () => {
    const line = formatMismatch("runner-1", { frame: 120, expected: "b".repeat(64), measured: "d".repeat(64) });

    assert.match(line, /^FAIL runner-1 frame 120/);
    assert.match(line, new RegExp("b".repeat(16)));
    assert.match(line, new RegExp("d".repeat(16)));
  });

  it("says (not sampled) rather than printing half a hash that is really 'nothing'", () => {
    assert.match(formatMismatch("runner-1", { frame: 180, expected: "c".repeat(64), measured: null }), /not sampled/);
  });
});

describe("the goldens in the repository", () => {
  it("exist for every scene, and carry the environment and 64-hex hashes they claim", () => {
    for (const [name, scene] of Object.entries(SCENES)) {
      const file = goldenFileFor(name);
      assert.ok(existsSync(file), `${name}: no golden at ${file} — write one with \`pnpm e2e:pixel --write\``);

      const document = JSON.parse(readFileSync(file, "utf8"));
      assert.equal(document.scene, name, `${name}: the golden names another scene`);
      assert.equal(typeof document.environment?.chromium, "string", `${name}: the golden records no chromium version`);
      assert.deepEqual(document.sampleFrames, scene.sampleFrames, `${name}: the golden samples other frames`);

      for (const sample of document.samples) {
        assert.match(sample.sha256, /^[0-9a-f]{64}$/, `${name}: frame ${sample.frame} is not a sha256`);
      }
      assert.deepEqual(
        document.samples.map((sample) => sample.frame),
        scene.sampleFrames,
        `${name}: the golden has a sample for every frame, in order`,
      );
    }
  });
});
