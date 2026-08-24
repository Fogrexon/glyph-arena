export type LoadOptions = {
  signal?: AbortSignal;
};

export type CreateAssetsOptions = {
  fetch?: typeof fetch;
  createImageBitmap?: typeof createImageBitmap;
};

export type Assets = {
  loadText: (url: string, options?: LoadOptions) => Promise<string>;
  loadJson: (url: string, options?: LoadOptions) => Promise<unknown>;
  loadBytes: (url: string, options?: LoadOptions) => Promise<ArrayBuffer>;
  loadImage: (url: string, options?: LoadOptions) => Promise<ImageBitmap>;
  evict: (url: string) => void;
  dispose: () => void;
};

type LoadKind = "text" | "json" | "bytes" | "image";

const DISPOSED_ERROR = new Error("Assets disposed");

function flightKey(url: string, kind: LoadKind): string {
  return `${kind}\0${url}`;
}

export function createAssets(options: CreateAssetsOptions = {}): Assets {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
  const createImageBitmapFn =
    options.createImageBitmap ??
    (typeof globalThis.createImageBitmap === "function"
      ? globalThis.createImageBitmap.bind(globalThis)
      : undefined);

  let disposed = false;
  const cache = new Map<string, Map<LoadKind, unknown>>();
  const inFlight = new Map<string, Promise<unknown>>();

  const getCached = (url: string, kind: LoadKind): unknown | undefined => {
    const byKind = cache.get(url);
    return byKind?.get(kind);
  };

  const setCached = (url: string, kind: LoadKind, value: unknown): void => {
    let byKind = cache.get(url);
    if (byKind === undefined) {
      byKind = new Map();
      cache.set(url, byKind);
    }
    byKind.set(kind, value);
  };

  const fetchOk = async (
    url: string,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const response = await fetchFn(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
  };

  const load = <T>(
    url: string,
    kind: LoadKind,
    loader: (signal?: AbortSignal) => Promise<T>,
    options?: LoadOptions,
  ): Promise<T> => {
    if (disposed) {
      return Promise.reject(DISPOSED_ERROR);
    }

    const cached = getCached(url, kind);
    if (cached !== undefined) {
      return Promise.resolve(cached as T);
    }

    const key = flightKey(url, kind);
    const existing = inFlight.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }

    const promise = loader(options?.signal)
      .then((result) => {
        inFlight.delete(key);
        if (!disposed) {
          setCached(url, kind, result);
        }
        return result;
      })
      .catch((error) => {
        inFlight.delete(key);
        throw error;
      });

    inFlight.set(key, promise);
    return promise;
  };

  const loadText = (url: string, options?: LoadOptions): Promise<string> =>
    load(
      url,
      "text",
      async (signal) => {
        const response = await fetchOk(url, signal);
        return response.text();
      },
      options,
    );

  const loadJson = (url: string, options?: LoadOptions): Promise<unknown> =>
    load(
      url,
      "json",
      async (signal) => {
        const response = await fetchOk(url, signal);
        return response.json();
      },
      options,
    );

  const loadBytes = (url: string, options?: LoadOptions): Promise<ArrayBuffer> =>
    load(
      url,
      "bytes",
      async (signal) => {
        const response = await fetchOk(url, signal);
        return response.arrayBuffer();
      },
      options,
    );

  const loadImage = (url: string, options?: LoadOptions): Promise<ImageBitmap> =>
    load(
      url,
      "image",
      async (signal) => {
        const response = await fetchOk(url, signal);
        const blob = await response.blob();
        if (createImageBitmapFn === undefined) {
          throw new Error("createImageBitmap is not available");
        }
        return createImageBitmapFn(blob);
      },
      options,
    );

  const evict = (url: string): void => {
    if (disposed) {
      return;
    }
    cache.delete(url);
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    cache.clear();
  };

  return {
    loadText,
    loadJson,
    loadBytes,
    loadImage,
    evict,
    dispose,
  };
}
