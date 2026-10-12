/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Small pure vector/math helpers for the game runtime.
 *
 * The runtime intentionally avoids Three.js so the whole simulation can run in
 * a worker, in a test or headlessly. Vectors are plain tuples so they remain
 * structured-clone friendly (no class instances to serialise).
 */

import type { Axis, Vec3 } from '../simulation/schema';

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scaleVec3(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function lengthVec3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function distanceVec3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Horizontal (XZ) distance, which is what most top-down gameplay needs. */
export function planarDistanceVec3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function normalizeVec3(a: Vec3): Vec3 {
  const length = lengthVec3(a);
  if (length < 1e-8) return [0, 0, 0];
  return [a[0] / length, a[1] / length, a[2] / length];
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function getAxisValue(value: Vec3, axis: Axis): number {
  if (axis === 'x') return value[0];
  if (axis === 'z') return value[2];
  return value[1];
}

export function setAxisValue(value: Vec3, axis: Axis, next: number): Vec3 {
  const result = cloneVec3(value);
  if (axis === 'x') result[0] = next;
  else if (axis === 'z') result[2] = next;
  else result[1] = next;
  return result;
}

export function addAxisValue(value: Vec3, axis: Axis, delta: number): Vec3 {
  return setAxisValue(value, axis, getAxisValue(value, axis) + delta);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Moves `current` toward `target` by at most `maxDelta`, never overshooting. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const difference = target - current;
  if (Math.abs(difference) <= maxDelta) return target;
  return current + Math.sign(difference) * maxDelta;
}

/** Frame-rate independent exponential smoothing factor for a half-life time. */
export function smoothingFactor(halfLifeSeconds: number, deltaSeconds: number): number {
  if (halfLifeSeconds <= 0) return 1;
  return 1 - Math.pow(0.5, deltaSeconds / halfLifeSeconds);
}

/** Interprets an angle as a yaw rotation that points from `from` toward `to`. */
export function yawTowards(from: Vec3, to: Vec3): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

/** Shortest signed angular difference in radians, in the range (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let difference = (to - from) % (Math.PI * 2);
  if (difference > Math.PI) difference -= Math.PI * 2;
  if (difference <= -Math.PI) difference += Math.PI * 2;
  return difference;
}

export function rotateTowards(from: number, to: number, maxDelta: number): number {
  return from + clamp(angleDelta(from, to), -maxDelta, maxDelta);
}
