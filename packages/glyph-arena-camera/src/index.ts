export type CameraState = {
  x: number;
  y: number;
  rotation: number;
  zoom: number;
};

export type Matrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type Camera = {
  set: (partial: Partial<CameraState>) => void;
  get: () => CameraState;
  view: (width: number, height: number) => Matrix2D;
  dispose: () => void;
};

const DEFAULT_STATE: CameraState = {
  x: 0,
  y: 0,
  rotation: 0,
  zoom: 1,
};

const IDENTITY_MATRIX: Matrix2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

const STATE_KEYS = ["x", "y", "rotation", "zoom"] as const;

function copyState(state: CameraState): CameraState {
  return {
    x: state.x,
    y: state.y,
    rotation: state.rotation,
    zoom: state.zoom,
  };
}

function copyDefault(): CameraState {
  return copyState(DEFAULT_STATE);
}

function copyMatrix(matrix: Matrix2D): Matrix2D {
  return {
    a: matrix.a,
    b: matrix.b,
    c: matrix.c,
    d: matrix.d,
    e: matrix.e,
    f: matrix.f,
  };
}

function composeView(
  state: CameraState,
  width: number,
  height: number,
): Matrix2D {
  const cos = Math.cos(state.rotation);
  const sin = Math.sin(state.rotation);
  const { x, y, zoom } = state;

  return {
    a: cos * zoom,
    b: sin * zoom,
    c: -sin * zoom,
    d: cos * zoom,
    e: width / 2 - zoom * (cos * x - sin * y),
    f: height / 2 - zoom * (sin * x + cos * y),
  };
}

export function createCamera(): Camera {
  let disposed = false;
  let state = copyDefault();

  const set = (partial: Partial<CameraState>): void => {
    if (disposed) {
      return;
    }

    const next = copyState(state);

    for (const key of STATE_KEYS) {
      const value = partial[key];
      if (value !== undefined) {
        next[key] = value;
      }
    }

    state = next;
  };

  const get = (): CameraState => {
    if (disposed) {
      return copyDefault();
    }

    return copyState(state);
  };

  const view = (width: number, height: number): Matrix2D => {
    if (disposed) {
      return copyMatrix(IDENTITY_MATRIX);
    }

    return copyMatrix(composeView(state, width, height));
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
  };

  return {
    set,
    get,
    view,
    dispose,
  };
}
