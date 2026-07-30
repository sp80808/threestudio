export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smoothStep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function moveTowards(current: number, target: number, maximumDelta: number): number {
  if (maximumDelta <= 0 || current === target) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}
