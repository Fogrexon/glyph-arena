export type PlayHandle = number;

export type PlayOptions = {
  gain?: number;
  loop?: boolean;
};

export type CreateAudioOptions = {
  context?: AudioContext;
};

export type Audio = {
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  play: (buffer: AudioBuffer, options?: PlayOptions) => PlayHandle;
  stop: (handle: PlayHandle) => void;
  resume: () => Promise<void>;
  dispose: () => void;
};

const DISPOSED_ERROR = new Error("Audio disposed");

type PendingDecode = {
  settled: boolean;
  reject: (reason: Error) => void;
};

type Playback = {
  handle: PlayHandle;
  source: AudioBufferSourceNode;
  ended: boolean;
};

function clampGain(gain: number | undefined): number {
  if (gain === undefined) {
    return 1;
  }
  return Math.max(0, Math.min(1, gain));
}

export function createAudio(options: CreateAudioOptions = {}): Audio {
  const owned = options.context === undefined;
  const context = options.context ?? new AudioContext();

  let disposed = false;
  let nextHandle = 1;
  const pendingDecodes: PendingDecode[] = [];
  const playbacks = new Map<PlayHandle, Playback>();

  const decode = (bytes: ArrayBuffer): Promise<AudioBuffer> => {
    if (disposed) {
      return Promise.reject(DISPOSED_ERROR);
    }

    return new Promise<AudioBuffer>((resolve, reject) => {
      const pending: PendingDecode = {
        settled: false,
        reject: (reason: Error) => {
          if (!pending.settled) {
            pending.settled = true;
            reject(reason);
          }
        },
      };
      pendingDecodes.push(pending);

      context.decodeAudioData(bytes).then(
        (buffer) => {
          if (!pending.settled) {
            pending.settled = true;
            const index = pendingDecodes.indexOf(pending);
            if (index >= 0) {
              pendingDecodes.splice(index, 1);
            }
            resolve(buffer);
          }
        },
        (error: unknown) => {
          if (!pending.settled) {
            pending.settled = true;
            const index = pendingDecodes.indexOf(pending);
            if (index >= 0) {
              pendingDecodes.splice(index, 1);
            }
            reject(error);
          }
        },
      );
    });
  };

  const play = (
    buffer: AudioBuffer,
    options?: PlayOptions,
  ): PlayHandle => {
    const handle = nextHandle++;

    if (disposed) {
      return handle;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = options?.loop ?? false;

    const gainNode = context.createGain();
    gainNode.gain.value = clampGain(options?.gain);

    source.connect(gainNode);
    gainNode.connect(context.destination);

    const playback: Playback = {
      handle,
      source,
      ended: false,
    };
    playbacks.set(handle, playback);

    source.onended = () => {
      playback.ended = true;
      playbacks.delete(handle);
    };

    source.start();
    return handle;
  };

  const stop = (handle: PlayHandle): void => {
    const playback = playbacks.get(handle);
    if (playback === undefined || playback.ended) {
      return;
    }

    try {
      playback.source.stop();
    } catch {
      // Already stopped or never started.
    }

    playback.ended = true;
    playbacks.delete(handle);
  };

  const resume = (): Promise<void> => {
    if (disposed) {
      return Promise.reject(DISPOSED_ERROR);
    }

    return context.resume();
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;

    for (const pending of pendingDecodes) {
      pending.reject(DISPOSED_ERROR);
    }
    pendingDecodes.length = 0;

    for (const handle of playbacks.keys()) {
      stop(handle);
    }

    if (owned) {
      context.close();
    }
  };

  return {
    decode,
    play,
    stop,
    resume,
    dispose,
  };
}
