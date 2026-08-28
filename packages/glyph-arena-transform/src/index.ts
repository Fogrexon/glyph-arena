export type LocalTransform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

export type Matrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type Transform = {
  set: (node: unknown, local: Partial<LocalTransform>) => void;
  get: (node: unknown) => LocalTransform;
  clear: (node: unknown) => void;
  world: (
    node: unknown,
    parentOf: (node: unknown) => object | null,
  ) => Matrix2D;
  dispose: () => void;
};

const DEFAULT_LOCAL: LocalTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

const IDENTITY_MATRIX: Matrix2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
};

const LOCAL_KEYS = ["x", "y", "rotation", "scaleX", "scaleY"] as const;

function isObjectNode(node: unknown): node is object {
  return typeof node === "object" && node !== null;
}

function copyLocal(local: LocalTransform): LocalTransform {
  return {
    x: local.x,
    y: local.y,
    rotation: local.rotation,
    scaleX: local.scaleX,
    scaleY: local.scaleY,
  };
}

function copyDefault(): LocalTransform {
  return copyLocal(DEFAULT_LOCAL);
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

function localToMatrix(local: LocalTransform): Matrix2D {
  const cos = Math.cos(local.rotation);
  const sin = Math.sin(local.rotation);

  return {
    a: cos * local.scaleX,
    b: sin * local.scaleX,
    c: -sin * local.scaleY,
    d: cos * local.scaleY,
    e: local.x,
    f: local.y,
  };
}

function multiply(parent: Matrix2D, local: Matrix2D): Matrix2D {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    e: parent.a * local.e + parent.c * local.f + parent.e,
    f: parent.b * local.e + parent.d * local.f + parent.f,
  };
}

function buildChain(
  node: object,
  parentOf: (node: unknown) => object | null,
): object[] {
  const chain: object[] = [];
  const visited = new Set<object>();
  let current: object = node;

  while (true) {
    if (visited.has(current)) {
      break;
    }

    visited.add(current);
    chain.push(current);

    const parent = parentOf(current);
    if (!isObjectNode(parent)) {
      break;
    }

    if (visited.has(parent)) {
      break;
    }

    current = parent;
  }

  return chain;
}

export function createTransform(): Transform {
  let disposed = false;
  const locals = new WeakMap<object, LocalTransform>();

  const getOrDefault = (node: object): LocalTransform => {
    const existing = locals.get(node);
    return existing === undefined ? DEFAULT_LOCAL : existing;
  };

  const set = (node: unknown, partial: Partial<LocalTransform>): void => {
    if (disposed || !isObjectNode(node)) {
      return;
    }

    const current = copyLocal(getOrDefault(node));

    for (const key of LOCAL_KEYS) {
      const value = partial[key];
      if (value !== undefined) {
        current[key] = value;
      }
    }

    locals.set(node, current);
  };

  const get = (node: unknown): LocalTransform => {
    if (disposed || !isObjectNode(node)) {
      return copyDefault();
    }

    return copyLocal(getOrDefault(node));
  };

  const clear = (node: unknown): void => {
    if (disposed || !isObjectNode(node)) {
      return;
    }

    locals.delete(node);
  };

  const world = (
    node: unknown,
    parentOf: (node: unknown) => object | null,
  ): Matrix2D => {
    if (disposed || !isObjectNode(node)) {
      return copyMatrix(IDENTITY_MATRIX);
    }

    const chain = buildChain(node, parentOf);
    let matrix = localToMatrix(getOrDefault(chain[chain.length - 1]!));

    for (let index = chain.length - 2; index >= 0; index -= 1) {
      const chainNode = chain[index]!;
      const local = getOrDefault(chainNode);
      matrix = multiply(matrix, localToMatrix(local));
    }

    return copyMatrix(matrix);
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
    clear,
    world,
    dispose,
  };
}
