/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Broad-phase tests.
 *
 * The contract of a broad phase is one-sided: it may return pairs that do not
 * overlap, but it must never miss one that does. Everything else here follows
 * from that — the grid is compared against brute force on random scenes, and the
 * numbers are checked so a scene stops paying for every pair.
 */

import { describe, expect, it } from 'vitest';
import {
  BRUTE_FORCE_PAIR_LIMIT,
  findCandidatePairs,
  bruteForcePairCount,
} from './broadphase';
import { collidersOverlap, type CollisionContext } from './collision';
import { makeRuntimeEntity } from './testHarness';
import type { RuntimeEntity } from './types';

/** Deterministic PRNG so a failing scene can be reproduced from the seed. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomScene(seed: number, count: number): RuntimeEntity[] {
  const next = random(seed);
  return Array.from({ length: count }, (_, index) => {
    const size = 0.4 + next() * 3;
    const entity = makeRuntimeEntity({
      id: `e${index}`,
      name: `E${index}`,
      position: [(next() - 0.5) * 40, (next() - 0.5) * 10, (next() - 0.5) * 40],
      collider: { size: [size, size, size], isTrigger: next() > 0.6 },
    });
    entity.order = index;
    return entity;
  });
}

function bruteForcePairs(entities: RuntimeEntity[], context: CollisionContext | null = null) {
  const pairs: string[] = [];
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      if (collidersOverlap(entities[i], entities[j], context)) {
        pairs.push([entities[i].id, entities[j].id].sort().join('|'));
      }
    }
  }
  return pairs.sort();
}

describe('findCandidatePairs', () => {
  it('never misses a pair that actually overlaps', () => {
    for (const seed of [1, 2, 3, 7, 11, 50]) {
      const entities = randomScene(seed, 80 + seed);
      const candidates = new Set(
        findCandidatePairs(entities).map((pair) => [pair.a.id, pair.b.id].sort().join('|')),
      );

      for (const pair of bruteForcePairs(entities)) {
        expect(candidates.has(pair)).toBe(true);
      }
    }
  });

  it('returns a deterministic order', () => {
    const entities = randomScene(42, 120);
    const first = findCandidatePairs(entities).map((pair) => `${pair.a.id}|${pair.b.id}`);
    const second = findCandidatePairs([...entities].reverse()).map((pair) => `${pair.a.id}|${pair.b.id}`);

    expect(second).toEqual(first);
  });

  it('tests every pair in a small scene', () => {
    const entities = randomScene(9, BRUTE_FORCE_PAIR_LIMIT);
    let tested = 0;
    findCandidatePairs(entities, {
      onPairTested: () => {
        tested += 1;
      },
    });

    expect(tested).toBe(bruteForcePairCount(entities.length));
  });

  it('tests far fewer pairs than brute force in a spread-out scene', () => {
    const entities = randomScene(1234, 400);
    let tested = 0;
    findCandidatePairs(entities, {
      onPairTested: () => {
        tested += 1;
      },
    });

    const all = bruteForcePairCount(entities.length);
    expect(tested).toBeLessThan(all / 10);
    expect(tested).toBeGreaterThan(0);
  });

  it('still finds pairs through a large volume that cannot be bucketed', () => {
    const floor = makeRuntimeEntity({
      id: 'floor',
      name: 'Floor',
      position: [0, -0.5, 0],
      scale: [400, 1, 400],
      collider: { size: [1, 1, 1] },
    });
    floor.order = 0;
    const props = randomScene(5, BRUTE_FORCE_PAIR_LIMIT + 4).map((entity, index) => {
      entity.order = index + 1;
      return entity;
    });
    const entities = [floor, ...props];

    const candidates = new Set(
      findCandidatePairs(entities).map((pair) => [pair.a.id, pair.b.id].sort().join('|')),
    );
    for (const pair of bruteForcePairs(entities)) expect(candidates.has(pair)).toBe(true);
  });

  it('finds pairs inside a scaled parent', () => {
    const parent = makeRuntimeEntity({ id: 'parent', name: 'Parent', position: [20, 0, 20] });
    parent.order = 0;
    const child = makeRuntimeEntity({
      id: 'child',
      name: 'Child',
      position: [0, 0, 0],
      collider: { size: [2, 2, 2] },
    });
    child.parentId = 'parent';
    child.order = 1;
    const walker = makeRuntimeEntity({
      id: 'walker',
      name: 'Walker',
      position: [20, 0, 20],
      collider: { size: [1, 1, 1] },
    });
    walker.order = 2;
    const context: CollisionContext = {
      parentOf: (entity) => {
        const base = { linear: [1, 0, 0, 0, 1, 0, 0, 0, 1] as [number, number, number, number, number, number, number, number, number], translation: [0, 0, 0] as [number, number, number] };
        if (entity.parentId === 'parent') return { ...base, translation: [20, 0, 20] };
        return base;
      },
    };

    // Only the child and the walker touch, and the broad phase must see it
    // through the parent transform rather than at the child's local position.
    const candidates = findCandidatePairs([parent, child, walker], { context });
    const seen = candidates.map((pair) => [pair.a.id, pair.b.id].sort().join('|'));
    expect(seen).toContain('child|walker');
  });
});
