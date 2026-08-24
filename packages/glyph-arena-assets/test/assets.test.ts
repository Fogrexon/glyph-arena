import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createAssets } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  blob: () => Promise<Blob>;
};

function mockResponse(
  body: {
    text?: string;
    json?: unknown;
    bytes?: ArrayBuffer;
    blob?: Blob;
  },
  ok = true,
  status = 200,
): MockResponse {
  return {
    ok,
    status,
    text: async () => body.text ?? "",
    json: async () => body.json,
    arrayBuffer: async () => body.bytes ?? new ArrayBuffer(0),
    blob: async () => body.blob ?? new Blob(),
  };
}

function createMockFetch(
  handler: (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>,
): typeof fetch {
  return (async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    return handler(url, init) as Response;
  }) as typeof fetch;
}

function createMockImageBitmap(): typeof createImageBitmap {
  return (async (source) => {
    return {
      width: 1,
      height: 1,
      close: () => {},
    } as ImageBitmap;
  }) as typeof createImageBitmap;
}

describe("createAssets", () => {
  it("loadText returns response text", async () => {
    const assets = createAssets({
      fetch: createMockFetch(() =>
        mockResponse({ text: "hello" }),
      ),
    });

    const text = await assets.loadText("https://example.com/text");
    assert.equal(text, "hello");
  });

  it("loadJson returns parsed json", async () => {
    const payload = { a: 1, b: "two" };
    const assets = createAssets({
      fetch: createMockFetch(() => mockResponse({ json: payload })),
    });

    const json = await assets.loadJson("https://example.com/json");
    assert.deepEqual(json, payload);
  });

  it("loadBytes returns array buffer", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const assets = createAssets({
      fetch: createMockFetch(() => mockResponse({ bytes })),
    });

    const loaded = await assets.loadBytes("https://example.com/bytes");
    assert.deepEqual(new Uint8Array(loaded), new Uint8Array([1, 2, 3]));
  });

  it("loadImage decodes via createImageBitmap", async () => {
    const blob = new Blob(["img"]);
    let bitmapSource: Blob | undefined;

    const assets = createAssets({
      fetch: createMockFetch(() => mockResponse({ blob })),
      createImageBitmap: (async (source) => {
        bitmapSource = source as Blob;
        return { width: 4, height: 2, close: () => {} } as ImageBitmap;
      }) as typeof createImageBitmap,
    });

    const image = await assets.loadImage("https://example.com/image");
    assert.equal(image.width, 4);
    assert.equal(image.height, 2);
    assert.equal(bitmapSource, blob);
  });

  it("dedupes in-flight loads for the same url and kind", async () => {
    let fetchCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const assets = createAssets({
      fetch: createMockFetch(async () => {
        fetchCount += 1;
        await gate;
        return mockResponse({ text: "once" });
      }),
    });

    const first = assets.loadText("https://example.com/dedupe");
    const second = assets.loadText("https://example.com/dedupe");

    assert.equal(fetchCount, 1);
    assert.equal(first, second);

    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, "once");
    assert.equal(b, "once");
    assert.equal(fetchCount, 1);
  });

  it("caches successful results until evict", async () => {
    let fetchCount = 0;
    const assets = createAssets({
      fetch: createMockFetch(() => {
        fetchCount += 1;
        return mockResponse({ text: `hit-${fetchCount}` });
      }),
    });

    const url = "https://example.com/cache";
    const first = await assets.loadText(url);
    assert.equal(first, "hit-1");
    assert.equal(fetchCount, 1);

    const second = await assets.loadText(url);
    assert.equal(second, "hit-1");
    assert.equal(fetchCount, 1);

    assets.evict(url);

    const third = await assets.loadText(url);
    assert.equal(third, "hit-2");
    assert.equal(fetchCount, 2);
  });

  it("does not cache failures; next load retries", async () => {
    let fetchCount = 0;
    const assets = createAssets({
      fetch: createMockFetch(() => {
        fetchCount += 1;
        if (fetchCount === 1) {
          throw new Error("network fail");
        }
        return mockResponse({ text: "ok" });
      }),
    });

    const url = "https://example.com/retry";
    await assert.rejects(() => assets.loadText(url), /network fail/);
    assert.equal(fetchCount, 1);

    const text = await assets.loadText(url);
    assert.equal(text, "ok");
    assert.equal(fetchCount, 2);
  });

  it("rejects when HTTP response is not ok", async () => {
    const assets = createAssets({
      fetch: createMockFetch(() => mockResponse({}, false, 404)),
      createImageBitmap: createMockImageBitmap(),
    });

    await assert.rejects(
      () => assets.loadText("https://example.com/missing"),
      /HTTP 404/,
    );
  });

  it("evict drops cached results for all kinds on the same url", async () => {
    let fetchCount = 0;
    const url = "https://example.com/multi";

    const assets = createAssets({
      fetch: createMockFetch(() => {
        fetchCount += 1;
        return mockResponse({
          text: "hello",
          json: { n: 1 },
        });
      }),
    });

    await assets.loadText(url);
    await assets.loadJson(url);
    assert.equal(fetchCount, 2);

    await assets.loadText(url);
    await assets.loadJson(url);
    assert.equal(fetchCount, 2);

    assets.evict(url);

    await assets.loadText(url);
    await assets.loadJson(url);
    assert.equal(fetchCount, 4);
  });

  it("dispose rejects load* and makes evict a no-op", async () => {
    const assets = createAssets({
      fetch: createMockFetch(() => mockResponse({ text: "cached" })),
      createImageBitmap: createMockImageBitmap(),
    });

    const url = "https://example.com/dispose";
    await assets.loadText(url);
    assets.dispose();

    await assert.rejects(() => assets.loadText(url), /Assets disposed/);
    await assert.rejects(() => assets.loadJson(url), /Assets disposed/);
    await assert.rejects(() => assets.loadBytes(url), /Assets disposed/);
    await assert.rejects(() => assets.loadImage(url), /Assets disposed/);

    assert.doesNotThrow(() => {
      assets.evict(url);
      assets.dispose();
    });
  });

  it("does not import loop, input, or timer packages", () => {
    const source = readFileSync(join(packageRoot, "src", "index.ts"), "utf8");

    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-loop/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-input/);
    assert.doesNotMatch(source, /@fogrexon\/glyph-arena-timer/);
  });

  it("dispose during in-flight does not abort the waiting promise", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const assets = createAssets({
      fetch: createMockFetch(async () => {
        await gate;
        return mockResponse({ text: "late" });
      }),
    });

    const pending = assets.loadText("https://example.com/dispose-inflight");
    assets.dispose();

    release();
    const result = await pending;
    assert.equal(result, "late");
  });

  it("evict during in-flight does not abort and skips recache on success", async () => {
    let fetchCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const assets = createAssets({
      fetch: createMockFetch(async () => {
        fetchCount += 1;
        await gate;
        return mockResponse({ text: `hit-${fetchCount}` });
      }),
    });

    const url = "https://example.com/evict-inflight";
    const pending = assets.loadText(url);
    assets.evict(url);

    release();
    const result = await pending;
    assert.equal(result, "hit-1");

    const second = await assets.loadText(url);
    assert.equal(second, "hit-2");
    assert.equal(fetchCount, 2);
  });

  it("loadJson rejects invalid json", async () => {
    const assets = createAssets({
      fetch: createMockFetch(() => ({
        ok: true,
        status: 200,
        text: async () => "not json",
        json: async () => JSON.parse("not json"),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
      })),
    });

    await assert.rejects(() =>
      assets.loadJson("https://example.com/bad-json"),
    );
  });

  it("loadImage rejects when createImageBitmap is missing on global", async () => {
    const assets = createAssets({
      fetch: createMockFetch(() => mockResponse({ blob: new Blob() })),
    });

    await assert.rejects(
      () => assets.loadImage("https://example.com/no-bitmap"),
      /createImageBitmap is not available/,
    );
  });

  it("cached loads return the same reference for the same url and kind", async () => {
    const bytes = new Uint8Array([9, 8]).buffer;
    const payload = { tag: "ref" };
    const bitmap = { width: 2, height: 2, close: () => {} } as ImageBitmap;

    const assets = createAssets({
      fetch: createMockFetch(() =>
        mockResponse({ bytes, json: payload, blob: new Blob() }),
      ),
      createImageBitmap: async () => bitmap,
    });

    const url = "https://example.com/refs";
    const firstBytes = await assets.loadBytes(url);
    const secondBytes = await assets.loadBytes(url);
    assert.equal(firstBytes, secondBytes);

    const firstJson = await assets.loadJson(url);
    const secondJson = await assets.loadJson(url);
    assert.equal(firstJson, secondJson);

    const firstImage = await assets.loadImage(url);
    const secondImage = await assets.loadImage(url);
    assert.equal(firstImage, secondImage);
  });

  it("evict of unknown url is a no-op", async () => {
    let fetchCount = 0;
    const assets = createAssets({
      fetch: createMockFetch(() => {
        fetchCount += 1;
        return mockResponse({ text: "ok" });
      }),
    });

    const url = "https://example.com/never-loaded";
    assert.doesNotThrow(() => assets.evict(url));

    const text = await assets.loadText(url);
    assert.equal(text, "ok");
    assert.equal(fetchCount, 1);

    const again = await assets.loadText(url);
    assert.equal(again, "ok");
    assert.equal(fetchCount, 1);
  });
});
