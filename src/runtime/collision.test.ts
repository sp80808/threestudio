import { describe, expect, it } from 'vitest';
import {
  aabbIntersects,
  collidersOverlap,
  isSolidBody,
  isTriggerVolume,
  resolveMovement,
} from './collision';
import { makeRuntimeEntity } from './testHarness';

describe('collision helpers', () => {
  it('treats touching but not overlapping boxes as separate', () => {
    const a = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
    const b = { min: [1, 0, 0] as [number, number, number], max: [2, 1, 1] as [number, number, number] };
    const c = { min: [0.9, 0, 0] as [number, number, number], max: [2, 1, 1] as [number, number, number] };

    expect(aabbIntersects(a, b)).toBe(false);
    expect(aabbIntersects(a, c)).toBe(true);
  });

  it('detects sphere overlaps exactly instead of using bounding boxes', () => {
    const a = makeRuntimeEntity({
      id: 'a',
      position: [0, 0, 0],
      collider: { shape: 'sphere', size: [2, 2, 2] },
    });
    const diagonal = makeRuntimeEntity({
      id: 'b',
      position: [1.2, 0, 1.2],
      collider: { shape: 'sphere', size: [2, 2, 2] },
    });
    const far = makeRuntimeEntity({
      id: 'c',
      position: [1.5, 0, 1.5],
      collider: { shape: 'sphere', size: [2, 2, 2] },
    });

    // Boxes would overlap here (1.2 + 1.2 > 2 on each axis) but spheres do.
    expect(collidersOverlap(a, diagonal)).toBe(true);
    expect(collidersOverlap(a, far)).toBe(false);
  });

  it('classifies solid bodies and trigger volumes', () => {
    const solid = makeRuntimeEntity({ collider: { size: [1, 1, 1] } });
    const trigger = makeRuntimeEntity({ collider: { size: [1, 1, 1], isTrigger: true } });
    const none = makeRuntimeEntity();

    expect(isSolidBody(solid)).toBe(true);
    expect(isTriggerVolume(solid)).toBe(false);
    expect(isSolidBody(trigger)).toBe(false);
    expect(isTriggerVolume(trigger)).toBe(true);
    expect(isSolidBody(none)).toBe(false);
  });

  it('ignores disabled entities and disabled colliders', () => {
    const solid = makeRuntimeEntity({ collider: { size: [1, 1, 1] } });
    solid.colliderEnabled = false;
    expect(isSolidBody(solid)).toBe(false);

    solid.colliderEnabled = true;
    solid.enabled = false;
    expect(isSolidBody(solid)).toBe(false);
  });
});

describe('resolveMovement', () => {
  it('stops an entity against a solid wall and reports the blocked axis', () => {
    const mover = makeRuntimeEntity({ position: [0, 0, 0], collider: { size: [1, 1, 1] } });
    const wall = makeRuntimeEntity({ id: 'wall', position: [2, 0, 0], collider: { size: [1, 1, 1] } });

    const result = resolveMovement(mover, [3, 0, 0], [wall]);

    // The mover stops as soon as its face would cross the wall: its 1-unit box
    // ends up exactly against the wall's near face at x = 1.5.
    expect(result.blocked.x).toBe(true);
    expect(result.position[0] + 0.5).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(result.position[0]).toBeGreaterThan(0.9);
  });

  it('slides along a wall instead of sticking to it', () => {
    const mover = makeRuntimeEntity({ position: [0, 0, 0], collider: { size: [1, 1, 1] } });
    const wall = makeRuntimeEntity({ id: 'wall', position: [2, 0, 0], collider: { size: [1, 1, 1] } });

    const result = resolveMovement(mover, [3, 0, 3], [wall]);

    expect(result.blocked.x).toBe(true);
    expect(result.blocked.z).toBe(false);
    expect(result.position[2]).toBeCloseTo(3, 5);
  });

  it('resolves in sub-steps so fast objects cannot tunnel through walls', () => {
    const mover = makeRuntimeEntity({ position: [0, 0, 0], collider: { size: [1, 1, 1] } });
    const thinWall = makeRuntimeEntity({ id: 'wall', position: [5, 0, 0], collider: { size: [0.2, 4, 4] } });

    const result = resolveMovement(mover, [10, 0, 0], [thinWall]);

    expect(result.blocked.x).toBe(true);
    expect(result.position[0]).toBeLessThan(5);
  });

  it('lets an entity escape a collider it is already inside', () => {
    const mover = makeRuntimeEntity({ position: [0, 0, 0], collider: { size: [1, 1, 1] } });
    const overlapping = makeRuntimeEntity({ id: 'overlapping', position: [0, 0, 0], collider: { size: [1, 1, 1] } });

    const result = resolveMovement(mover, [2, 0, 0], [overlapping]);

    expect(result.blocked.x).toBe(false);
    expect(result.position[0]).toBeCloseTo(2, 5);
  });

  it('does not block against trigger volumes', () => {
    const mover = makeRuntimeEntity({ position: [0, 0, 0], collider: { size: [1, 1, 1] } });
    const pad = makeRuntimeEntity({
      id: 'pad',
      position: [1, 0, 0],
      collider: { size: [2, 2, 2], isTrigger: true },
    });

    // Callers only pass solid bodies as blockers; this asserts the helper keeps
    // trigger behaviour in the caller's hands via `isSolidBody`.
    expect(isSolidBody(pad)).toBe(false);
    const blockers = [pad].filter(isSolidBody);
    const result = resolveMovement(mover, [2, 0, 0], blockers);
    expect(result.blocked.x).toBe(false);
  });
});
