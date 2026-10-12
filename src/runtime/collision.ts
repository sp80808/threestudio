/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Kinematic collision and trigger detection.
 *
 * The engine currently ships a dependency-free kinematic collision model
 * instead of a rigid-body solver: volumes are axis-aligned (spheres are tested
 * exactly against other spheres), movement is resolved per axis with sub-steps
 * to stop fast objects from tunnelling, and triggers only report overlaps.
 *
 * This keeps the Pressure Plate Door, doors, pickups and character controller
 * fully deterministic and testable. A Rapier adapter can later implement the
 * same `resolveMovement` contract without touching gameplay code.
 */

import type { Vec3 } from '../simulation/schema';
import { clamp, cloneVec3, scaleVec3 } from './math';
import type { MoveResult, RuntimeEntity } from './types';

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

/** Longest distance an entity may travel in a single collision sub-step. */
export const DEFAULT_MAX_SUBSTEP = 0.25;

const EPSILON = 1e-6;

function scaledSize(entity: RuntimeEntity): Vec3 {
  const size = entity.collider?.size ?? [0, 0, 0];
  return [
    Math.abs(size[0] * entity.scale[0]),
    Math.abs(size[1] * entity.scale[1]),
    Math.abs(size[2] * entity.scale[2]),
  ];
}

function colliderCentre(entity: RuntimeEntity, position: Vec3): Vec3 {
  const offset = entity.collider?.offset ?? [0, 0, 0];
  return [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]];
}

/** Axis-aligned volume of an entity placed at `position`. */
export function entityAabbAt(entity: RuntimeEntity, position: Vec3): Aabb | null {
  if (!entity.collider) return null;
  const size = scaledSize(entity);
  const centre = colliderCentre(entity, position);
  return {
    min: [centre[0] - size[0] / 2, centre[1] - size[1] / 2, centre[2] - size[2] / 2],
    max: [centre[0] + size[0] / 2, centre[1] + size[1] / 2, centre[2] + size[2] / 2],
  };
}

export function entityAabb(entity: RuntimeEntity): Aabb | null {
  return entityAabbAt(entity, entity.position);
}

export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] < b.max[0] - EPSILON &&
    a.max[0] > b.min[0] + EPSILON &&
    a.min[1] < b.max[1] - EPSILON &&
    a.max[1] > b.min[1] + EPSILON &&
    a.min[2] < b.max[2] - EPSILON &&
    a.max[2] > b.min[2] + EPSILON
  );
}

export function aabbContainsPoint(box: Aabb, point: Vec3): boolean {
  return (
    point[0] >= box.min[0] - EPSILON &&
    point[0] <= box.max[0] + EPSILON &&
    point[1] >= box.min[1] - EPSILON &&
    point[1] <= box.max[1] + EPSILON &&
    point[2] >= box.min[2] - EPSILON &&
    point[2] <= box.max[2] + EPSILON
  );
}

function sphereRadius(entity: RuntimeEntity): number {
  const size = scaledSize(entity);
  return Math.max(size[0], size[1], size[2]) / 2;
}

/**
 * Overlap test between two entities. Sphere/sphere pairs are tested exactly so
 * round colliders feel round; everything else falls back to box tests.
 */
export function collidersOverlap(a: RuntimeEntity, b: RuntimeEntity): boolean {
  if (!a.collider || !b.collider) return false;

  if (a.collider.shape === 'sphere' && b.collider.shape === 'sphere') {
    const centreA = colliderCentre(a, a.position);
    const centreB = colliderCentre(b, b.position);
    const distance = Math.hypot(
      centreA[0] - centreB[0],
      centreA[1] - centreB[1],
      centreA[2] - centreB[2],
    );
    return distance < sphereRadius(a) + sphereRadius(b) - EPSILON;
  }

  const boxA = entityAabb(a);
  const boxB = entityAabb(b);
  if (!boxA || !boxB) return false;
  return aabbIntersects(boxA, boxB);
}

export function hasActiveCollider(entity: RuntimeEntity): boolean {
  return Boolean(entity.collider) && entity.enabled && entity.colliderEnabled;
}

/** Solid volumes block movement (triggers never do). */
export function isSolidBody(entity: RuntimeEntity): boolean {
  return hasActiveCollider(entity) && !entity.collider?.isTrigger;
}

export function isTriggerVolume(entity: RuntimeEntity): boolean {
  return hasActiveCollider(entity) && Boolean(entity.collider?.isTrigger);
}

/**
 * Moves an entity by `delta`, stopping at solid volumes.
 *
 * Already-overlapping volumes are ignored so an object authored inside another
 * one can still escape instead of becoming permanently stuck.
 */
export function resolveMovement(
  entity: RuntimeEntity,
  delta: Vec3,
  blockers: RuntimeEntity[],
  maxSubstep: number = DEFAULT_MAX_SUBSTEP,
): MoveResult {
  const blocked = { x: false, y: false, z: false };
  let position = cloneVec3(entity.position);
  const distance = Math.hypot(delta[0], delta[1], delta[2]);
  if (distance < EPSILON) return { position, blocked };

  const initialBox = entityAabbAt(entity, position);
  const ignored = new Set<string>();
  if (initialBox) {
    for (const blocker of blockers) {
      const box = entityAabb(blocker);
      if (box && aabbIntersects(initialBox, box)) ignored.add(blocker.id);
    }
  }

  const activeBlockers = blockers.filter((blocker) => !ignored.has(blocker.id));
  const steps = Math.max(1, Math.ceil(distance / Math.max(maxSubstep, EPSILON)));
  const stepDelta = scaleVec3(delta, 1 / steps);
  // Horizontal axes first: sliding along floors/slopes stays stable, and the
  // vertical resolution can then detect "standing on something".
  const axes: (keyof typeof blocked)[] = ['x', 'z', 'y'];

  for (let step = 0; step < steps; step += 1) {
    for (const axis of axes) {
      const index = axis === 'x' ? 0 : axis === 'z' ? 2 : 1;
      const amount = stepDelta[index];
      if (Math.abs(amount) < EPSILON) continue;

      const candidate = cloneVec3(position);
      candidate[index] += amount;

      if (isBlockedAt(entity, candidate, activeBlockers)) {
        blocked[axis] = true;
        continue;
      }
      position = candidate;
    }
  }

  return { position, blocked };
}

function isBlockedAt(entity: RuntimeEntity, position: Vec3, blockers: RuntimeEntity[]): boolean {
  const box = entityAabbAt(entity, position);
  if (!box) return false;
  for (const blocker of blockers) {
    const other = entityAabb(blocker);
    if (other && aabbIntersects(box, other)) return true;
  }
  return false;
}

/** Keeps an entity inside a box-shaped play area (`null` disables the clamp). */
export function clampToBounds(position: Vec3, bounds: Aabb | null): Vec3 {
  if (!bounds) return position;
  return [
    clamp(position[0], bounds.min[0], bounds.max[0]),
    clamp(position[1], bounds.min[1], bounds.max[1]),
    clamp(position[2], bounds.min[2], bounds.max[2]),
  ];
}
