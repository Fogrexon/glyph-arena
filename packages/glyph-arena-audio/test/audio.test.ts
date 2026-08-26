import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createAudio } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type MockBufferSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  onended: (() => void) | null;
  connect: (node: unknown) => unknown;
  start: (when?: number) => void;
  stop: () => void;
  disconnect: () => void;
  started: boolean;
  stopped: boolean;
  simulateEnded: () => void;
};

type MockGainNode = {
  gain: { value: number };
  connect: (node: unknown) => unknown;
};

type MockAudioContext = {
  state: AudioContextState;
  destination: AudioDestinationNode;
  decodeAudioData: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  createBufferSource: () => MockBufferSource;
  createGain: () => MockGainNode;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  sources: MockBufferSource[];
  gainNodes: MockGainNode[];
  resumeCalls: number;
  closeCalls: number;
};

function createMockBufferSource(): MockBufferSource {
  const source: MockBufferSource = {
    buffer: null,
    loop: false,
    onended: null,
    started: false,
    stopped: false,
    connect: (node: unknown) => node,
    start: () => {
      source.started = true;
    },
    stop: () => {
      if (!source.started || source.stopped) {
        throw new DOMException("InvalidStateError");
      }
      source.stopped = true;
    },
    disconnect: () => {},
    simulateEnded: () => {
      source.stopped = true;
      if (source.onended !== null) {
        source.onended();
      }
    },
  };
  return source;
}

function createMockGainNode(): MockGainNode {
  return {
    gain: { value: 1 },
    connect: (node: unknown) => node,
  };
}

function createMockAudioContext(
  options: {
    state?: AudioContextState;
    decodeAudioData?: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  } = {},
): MockAudioContext {
  const sources: MockBufferSource[] = [];
  const gainNodes: MockGainNode[] = [];

  const context: MockAudioContext = {
    state: options.state ?? "running",
    destination: {} as AudioDestinationNode,
    sources,
    gainNodes,
    resumeCalls: 0,
    closeCalls: 0,
    decodeAudioData:
      options.decodeAudioData ??
      (async () => ({ duration: 1 } as AudioBuffer)),
    createBufferSource: () => {
      const source = createMockBufferSource();
      sources.push(source);
      return source;
    },
    createGain: () => {
      const gain = createMockGainNode();
      gainNodes.push(gain);
      return gain;
    },
    resume: async () => {
      context.resumeCalls += 1;
      context.state = "running";
    },
    close: async () => {
      context.closeCalls += 1;
      context.state = "closed";
    },
  };

  return context;
}

describe("createAudio", () => {
  it("decode returns AudioBuffer via context.decodeAudioData", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const expected = { duration: 2.5 } as AudioBuffer;
    const context = createMockAudioContext({
      decodeAudioData: async (input) => {
        assert.equal(input, bytes);
        return expected;
      },
    });

    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = await audio.decode(bytes);
    assert.equal(buffer, expected);
  });

  it("gain defaults to 1 and clamps to 0..1", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    audio.play(buffer);
    assert.equal(context.gainNodes[0].gain.value, 1);

    audio.play(buffer, { gain: 0.5 });
    assert.equal(context.gainNodes[1].gain.value, 0.5);

    audio.play(buffer, { gain: 2 });
    assert.equal(context.gainNodes[2].gain.value, 1);

    audio.play(buffer, { gain: -1 });
    assert.equal(context.gainNodes[3].gain.value, 0);
  });

  it("loop defaults to false", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    audio.play(buffer);
    assert.equal(context.sources[0].loop, false);

    audio.play(buffer, { loop: true });
    assert.equal(context.sources[1].loop, true);
  });

  it("stop ignores unknown handles", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });

    audio.stop(999);
    assert.equal(context.sources.length, 0);
  });

  it("stop of already-ended playback is a no-op", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    const handle = audio.play(buffer);
    const source = context.sources[0];
    source.simulateEnded();

    audio.stop(handle);
    assert.equal(source.stopped, true);
  });

  it("after dispose decode and resume reject", async () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });

    audio.dispose();

    await assert.rejects(audio.decode(new ArrayBuffer(0)), /Audio disposed/);
    await assert.rejects(audio.resume(), /Audio disposed/);
  });

  it("after dispose play returns a handle without starting sound", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    audio.dispose();

    const handle = audio.play(buffer, { gain: 0.5, loop: true });
    assert.equal(handle, 1);
    assert.equal(context.sources.length, 0);
    assert.equal(context.gainNodes.length, 0);
  });

  it("dispose stops in-progress playback", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    audio.play(buffer);
    const source = context.sources[0];
    assert.equal(source.stopped, false);

    audio.dispose();
    assert.equal(source.stopped, true);
  });

  it("dispose closes owned context but not borrowed context", () => {
    const borrowed = createMockAudioContext();
    const borrowedAudio = createAudio({
      context: borrowed as unknown as AudioContext,
    });
    borrowedAudio.dispose();
    assert.equal(borrowed.closeCalls, 0);

    const ownedContext = createMockAudioContext();
    const previousAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = class {
      constructor() {
        return ownedContext;
      }
    } as typeof AudioContext;

    try {
      const ownedAudio = createAudio();
      ownedAudio.dispose();
      assert.equal(ownedContext.closeCalls, 1);
    } finally {
      globalThis.AudioContext = previousAudioContext;
    }
  });

  it("never auto-calls resume on play", () => {
    const context = createMockAudioContext({ state: "suspended" });
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    const handle = audio.play(buffer);
    assert.equal(handle, 1);
    assert.equal(context.resumeCalls, 0);
    assert.equal(context.sources[0].started, true);
    assert.equal(context.state, "suspended");
  });

  it("play while suspended returns handle; sound starts after caller resumes", async () => {
    const context = createMockAudioContext({ state: "suspended" });
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    const handle = audio.play(buffer);
    assert.equal(handle, 1);
    assert.equal(context.state, "suspended");

    await audio.resume();
    assert.equal(context.resumeCalls, 1);
    assert.equal(context.state, "running");
  });

  it("decode of corrupt bytes rejects", async () => {
    const bytes = new Uint8Array([0]).buffer;
    const context = createMockAudioContext({
      decodeAudioData: async () => {
        throw new DOMException("EncodingError");
      },
    });
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });

    await assert.rejects(audio.decode(bytes), /EncodingError/);
  });

  it("dispose during in-flight decode rejects the waiting promise", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const bytes = new Uint8Array([9]).buffer;
    const context = createMockAudioContext({
      decodeAudioData: async () => {
        await gate;
        return { duration: 1 } as AudioBuffer;
      },
    });
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });

    const pending = audio.decode(bytes);
    audio.dispose();

    await assert.rejects(pending, /Audio disposed/);

    release();
    assert.equal(context.closeCalls, 0);
  });

  it("dispose during in-flight decode on owned context still closes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const ownedContext = createMockAudioContext({
      decodeAudioData: async () => {
        await gate;
        return { duration: 1 } as AudioBuffer;
      },
    });
    const previousAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = class {
      constructor() {
        return ownedContext;
      }
    } as typeof AudioContext;

    try {
      const audio = createAudio();
      const pending = audio.decode(new ArrayBuffer(1));
      audio.dispose();

      await assert.rejects(pending, /Audio disposed/);
      assert.equal(ownedContext.closeCalls, 1);

      release();
    } finally {
      globalThis.AudioContext = previousAudioContext;
    }
  });

  it("stop stops active playback", () => {
    const context = createMockAudioContext();
    const audio = createAudio({
      context: context as unknown as AudioContext,
    });
    const buffer = { duration: 1 } as AudioBuffer;

    const handle = audio.play(buffer);
    const source = context.sources[0];
    assert.equal(source.stopped, false);

    audio.stop(handle);
    assert.equal(source.stopped, true);
  });

  it("does not import sibling glyph-arena packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-assets/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-draw/);
  });
});
