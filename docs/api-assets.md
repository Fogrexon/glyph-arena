# @fogrexon/glyph-arena-assets

URL asset loading with in-memory cache. See also [package README](../packages/glyph-arena-assets/README.md).

## Exports

| Name | Kind |
|------|------|
| `createAssets` | function |
| `LoadOptions`, `CreateAssetsOptions`, `Assets` | types |

This package does not import sibling `@fogrexon/glyph-arena-*` packages.

## `createAssets(options?)`

```ts
const assets = createAssets({
  fetch?,              // optional
  createImageBitmap?,  // optional
});

await assets.loadText(url, { signal? });
await assets.loadJson(url, { signal? });
await assets.loadBytes(url, { signal? });
await assets.loadImage(url, { signal? });

assets.evict(url);
assets.dispose();
```

### Options

- **`fetch?`** — fetch implementation. Defaults to `globalThis.fetch`.
- **`createImageBitmap?`** — image decoder. Defaults to `globalThis.createImageBitmap` when available.

### Methods

- **`loadText(url, options?)`** — fetch and return response text.
- **`loadJson(url, options?)`** — fetch and return parsed JSON as `unknown`.
- **`loadBytes(url, options?)`** — fetch and return `ArrayBuffer`.
- **`loadImage(url, options?)`** — fetch blob and decode to `ImageBitmap`.
- **`evict(url)`** — drop cached results for all kinds on `url`. Unknown URLs are no-ops.
- **`dispose()`** — clear cache. After dispose, `load*` reject with `"Assets disposed"`; `evict` is a no-op.

### `LoadOptions`

| Field | Description |
|-------|-------------|
| `signal?` | optional `AbortSignal` passed to fetch |

### Caching

- Successful loads are cached per URL and kind until `evict` or `dispose`.
- In-flight loads for the same URL and kind are deduped.
- Failures are not cached; the next load retries.
- Cached loads return the same reference for the same URL and kind.

### HTTP errors

Non-OK responses reject with `Error("HTTP <status> for <url>")`.

### `loadImage` requirements

Rejects with `"createImageBitmap is not available"` when no decoder is provided and `globalThis.createImageBitmap` is missing.

### Evict during in-flight load

Does not abort the in-flight request. On success, the result is not re-cached; the next load fetches again.
