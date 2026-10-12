/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Broad phase: which colliders could possibly be touching?
 *
 * The narrow phase (`collidersOverlap`) is exact but costs a box test per pair,
 * so testing every pair every step is O(n²). The world therefore asks this
 * module for candidate pairs first: a uniform grid keyed by world position, plus
 * an "oversized" list for volumes too large to bucket (a floor, typically).
 *
 * Correctness rule: the candidate set must be a *superset* of the pairs that
 * actually overlap — never smaller. That is what makes it safe to use as a
 * filter, and it is what `broadphase.test.ts` checks against brute force.
 */

import { entityAabb, type Aabb, type CollisionContext } from './collision';
import type { RuntimeEntity } from './types';

/**
 * Below this many colliders, walking every pair is cheaper than building a grid.
 * (n²/2 at n = 32 is ~500 box tests, less than the bookkeeping of bucketing.)
 */
export const BRUTE_FORCE_PAIR_LIMIT = 32;

/** A volume covering more cells than this is tested against everything instead. */
export const MAX_CELLS_PER_ENTITY = 256;

/** Default cell size in metres; roughly the size of a character. */
export const DEFAULT_CELL_SIZE = 4;

export interface CandidatePair {
  a: RuntimeEntity;
  b: RuntimeEntity;
}

export interface BroadphaseOptions {
  /** Needed so boxes are computed where the objects are actually drawn. */
  context?: CollisionContext | null;
  cellSize?: number;
  /** Pairs tested one at a time (exposed for tests and diagnostics). */
  onPairTested?: () => void;
}

const cellKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

function cellsFor(box: Aabb, cellSize: number): { keys: string[]; overflow: boolean } {
  const minX = Math.floor(box.min[0] / cellSize);
  const minY = Math.floor(box.min[1] / cellSize);
  const minZ = Math.floor(box.min[2] / cellSize);
  const maxX = Math.floor(box.max[0] / cellSize);
  const maxY = Math.floor(box.max[1] / cellSize);
  const maxZ = Math.floor(box.max[2] / cellSize);

  const count = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
  if (count > MAX_CELLS_PER_ENTITY) return { keys: [], overflow: true };

  const keys: string[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) keys.push(cellKey(x, y, z));
    }
  }
  return { keys, overflow: false };
}

/**
 * Candidate overlapping pairs, in a deterministic order.
 *
 * Determinism matters: rules fire in pair order, and a recording replays the
 * world frame by frame — so the pairs are returned sorted by the entities'
 * stable `order` index rather than by grid iteration order.
 */
export function findCandidatePairs(
  entities: RuntimeEntity[],
  options: BroadphaseOptions = {},
): CandidatePair[] {
  const context = options.context ?? null;
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  const pairs: CandidatePair[] = [];

  const boxes = new Map<string, Aabb>();
  for (const entity of entities) {
    const box = entityAabb(entity, context ? context.parentOf(entity) : null);
    if (box) boxes.set(entity.id, box);
  }

  const withBoxes = entities.filter((entity) => boxes.has(entity.id));

  if (withBoxes.length <= BRUTE_FORCE_PAIR_LIMIT) {
    for (let i = 0; i < withBoxes.length; i += 1) {
      for (let j = i + 1; j < withBoxes.length; j += 1) {
        options.onPairTested?.();
        pairs.push({ a: withBoxes[i], b: withBoxes[j] });
      }
    }
    return pairs;
  }

  const grid = new Map<string, RuntimeEntity[]>();
  const oversized: RuntimeEntity[] = [];

  for (const entity of withBoxes) {
    const { keys, overflow } = cellsFor(boxes.get(entity.id) as Aabb, cellSize);
    if (overflow) {
      oversized.push(entity);
      continue;
    }
    for (const key of keys) {
      const bucket = grid.get(key);
      if (bucket) bucket.push(entity);
      else grid.set(key, [entity]);
    }
  }

  // Pairs are deduplicated by id so two objects sharing several cells are only
  // tested once, and are keyed by the entity order index so results are stable.
  const seen = new Set<string>();
  const record = (a: RuntimeEntity, b: RuntimeEntity) => {
    const [first, second] = a.order <= b.order ? [a, b] : [b, a];
    const key = `${first.id}|${second.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.onPairTested?.();
    pairs.push({ a: first, b: second });
  };

  for (const bucket of grid.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) record(bucket[i], bucket[j]);
    }
  }

  // A floor or a skybox cannot be bucketed, so it is tested against everything.
  for (const entity of oversized) {
    for (const other of withBoxes) {
      if (other === entity) continue;
      record(entity, other);
    }
  }

  pairs.sort((left, right) => left.a.order - right.a.order || left.b.order - right.b.order);
  return pairs;
}

/**
 * How many pairs a step would test without a broad phase.
 *
 * Used by the crowd playtest and scenario test to show the grid works; the
 * numbers are also handy when tuning `cellSize`.
 */
export function bruteForcePairCount(entityCount: number): number {
  return (entityCount * (entityCount - 1)) / 2;
}
