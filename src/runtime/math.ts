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

// ---------------------------------------------------------------------------
// Hierarchical transforms
//
// A transform is composed from a parent's transform the same way the renderer
// composes Three.js matrices: `world = parent * local`, with a TRS matrix using
// XYZ Euler angles. Only what the simulation needs is implemented here — the
// affine matrix (a 3x3 linear part plus a translation) — so the runtime stays
// free of Three.js while agreeing with it numerically.
// ---------------------------------------------------------------------------

/** Row-major 3x3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** An affine transform: `p' = linear * p + translation`. */
export interface AffineTransform {
  linear: Mat3;
  translation: Vec3;
}

export const IDENTITY_AFFINE: AffineTransform = {
  linear: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  translation: [0, 0, 0],
};

/** Rotation matrix for XYZ Euler angles, radians (three.js `Euler` order 'XYZ'). */
export function eulerXyzToMat3(rotation: Vec3): Mat3 {
  const [x, y, z] = rotation;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);

  return [
    cy * cz,
    -cy * sz,
    sy,
    cx * sz + sx * sy * cz,
    cx * cz - sx * sy * sz,
    -sx * cy,
    sx * sz - cx * sy * cz,
    sx * cz + cx * sy * sz,
    cx * cy,
  ];
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const result = new Array(9).fill(0) as unknown as Mat3;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      result[row * 3 + column] =
        a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column];
    }
  }
  return result;
}

/** Turns a local TRS transform into an affine matrix. */
export function affineFromTransform(position: Vec3, rotation: Vec3, scale: Vec3): AffineTransform {
  const rotationMatrix = eulerXyzToMat3(rotation);
  const linear = new Array(9).fill(0) as unknown as Mat3;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      linear[row * 3 + column] = rotationMatrix[row * 3 + column] * scale[column];
    }
  }
  return { linear, translation: cloneVec3(position) };
}

/** `a * b`: the transform of `b` expressed in `a`'s parent space. */
export function multiplyAffine(a: AffineTransform, b: AffineTransform): AffineTransform {
  return {
    linear: multiplyMat3(a.linear, b.linear),
    translation: addVec3(applyAffine(a, b.translation), [0, 0, 0]),
  };
}

export function applyAffine(transform: AffineTransform, point: Vec3): Vec3 {
  const { linear, translation } = transform;
  return [
    linear[0] * point[0] + linear[1] * point[1] + linear[2] * point[2] + translation[0],
    linear[3] * point[0] + linear[4] * point[1] + linear[5] * point[2] + translation[1],
    linear[6] * point[0] + linear[7] * point[1] + linear[8] * point[2] + translation[2],
  ];
}

/**
 * Axis-aligned box containing the transformed box.
 *
 * Transforming each of the eight corners and taking the extremes is exact for
 * an axis-aligned result and never smaller than the transformed volume, which is
 * what collision needs (an over-approximation, never a tunnel).
 */
export function transformAabb(
  transform: AffineTransform,
  min: Vec3,
  max: Vec3,
): { min: Vec3; max: Vec3 } {
  const result = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as Vec3,
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as Vec3,
  };

  for (let corner = 0; corner < 8; corner += 1) {
    const point: Vec3 = [
      corner & 1 ? max[0] : min[0],
      corner & 2 ? max[1] : min[1],
      corner & 4 ? max[2] : min[2],
    ];
    const transformed = applyAffine(transform, point);
    for (let axis = 0; axis < 3; axis += 1) {
      if (transformed[axis] < result.min[axis]) result.min[axis] = transformed[axis];
      if (transformed[axis] > result.max[axis]) result.max[axis] = transformed[axis];
    }
  }

  return result;
}

/**
 * Column-major 16-element array for `THREE.Matrix4.fromArray`, so the renderer
 * can consume runtime transforms without knowing how they were composed.
 */
export function affineToMatrix4Array(transform: AffineTransform): number[] {
  const { linear, translation } = transform;
  return [
    linear[0],
    linear[3],
    linear[6],
    0,
    linear[1],
    linear[4],
    linear[7],
    0,
    linear[2],
    linear[5],
    linear[8],
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];
}

/** In-place-free inverse of a TRS transform, used to convert world to local. */
export function invertAffine(transform: AffineTransform): AffineTransform {
  const { linear, translation } = transform;
  const determinant =
    linear[0] * (linear[4] * linear[8] - linear[5] * linear[7]) -
    linear[1] * (linear[3] * linear[8] - linear[5] * linear[6]) +
    linear[2] * (linear[3] * linear[7] - linear[4] * linear[6]);

  if (Math.abs(determinant) < 1e-12) {
    // Degenerate (a zero scale): fall back to translation-only inversion.
    return { linear: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [-translation[0], -translation[1], -translation[2]] };
  }

  const inverseDeterminant = 1 / determinant;
  const inverse: Mat3 = [
    (linear[4] * linear[8] - linear[5] * linear[7]) * inverseDeterminant,
    (linear[2] * linear[7] - linear[1] * linear[8]) * inverseDeterminant,
    (linear[1] * linear[5] - linear[2] * linear[4]) * inverseDeterminant,
    (linear[5] * linear[6] - linear[3] * linear[8]) * inverseDeterminant,
    (linear[0] * linear[8] - linear[2] * linear[6]) * inverseDeterminant,
    (linear[2] * linear[3] - linear[0] * linear[5]) * inverseDeterminant,
    (linear[3] * linear[7] - linear[4] * linear[6]) * inverseDeterminant,
    (linear[1] * linear[6] - linear[0] * linear[7]) * inverseDeterminant,
    (linear[0] * linear[4] - linear[1] * linear[3]) * inverseDeterminant,
  ];

  const inverseTranslation = applyAffine(
    { linear: inverse, translation: [0, 0, 0] },
    [-translation[0], -translation[1], -translation[2]],
  );

  return { linear: inverse, translation: inverseTranslation };
}
