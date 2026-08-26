export type Aabb = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function isValidAabb(a: Aabb): boolean {
  if (a.width <= 0 || a.height <= 0) {
    return false;
  }

  return (
    Number.isFinite(a.x) &&
    Number.isFinite(a.y) &&
    Number.isFinite(a.width) &&
    Number.isFinite(a.height)
  );
}

export function overlaps(a: Aabb, b: Aabb): boolean {
  if (!isValidAabb(a) || !isValidAabb(b)) {
    return false;
  }

  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}
