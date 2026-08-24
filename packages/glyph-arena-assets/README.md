# @fogrexon/glyph-arena-assets

Fetch-based asset loading with in-flight deduplication and success caching.

## API

```ts
import { createAssets } from "@fogrexon/glyph-arena-assets";

const assets = createAssets({
  fetch,
  createImageBitmap,
});

const text = await assets.loadText(url, { signal });
const json = await assets.loadJson(url, { signal });
const bytes = await assets.loadBytes(url, { signal });
const image = await assets.loadImage(url, { signal });

assets.evict(url);
assets.dispose();
```

### `createAssets({ fetch?, createImageBitmap? })`

Returns an asset loader. `fetch` and `createImageBitmap` default to `globalThis`.

- `loadText(url, { signal? })` → `Promise<string>`
- `loadJson(url, { signal? })` → `Promise<unknown>`
- `loadBytes(url, { signal? })` → `Promise<ArrayBuffer>`
- `loadImage(url, { signal? })` → `Promise<ImageBitmap>`
- `evict(url)` — drop cached successful results for `url` (all kinds). No-op if not cached.
- `dispose()` — reject subsequent `load*` calls; `evict` becomes a no-op.

### Behavior

- Same `url` and load kind in-flight returns the same `Promise` (dedupe).
- Successful results are cached until `evict(url)` or `dispose()`.
- Failures are not cached; the next load retries.
- HTTP responses with `ok === false` reject.
- In-flight loads are not aborted on `dispose()` (caller `signal` still applies).
