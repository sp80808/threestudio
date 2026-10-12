/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hierarchy tests.
 *
 * `parentId` has been part of the document since v1, but transforms were only
 * ever composed for root objects. These tests pin down the contract that
 * `docs/DECISIONS.md` describes: a child's world transform is
 * `parent * local`, collision happens where the player sees the object, and a
 * broken hierarchy degrades to a diagnostic instead of a crash — or an infinite
 * loop.
 */

import { describe, expect, it } from 'vitest';
import { createEntity, createDefaultProject, type Project } from '../simulation/schema';
import { createBehaviourInstance } from './behaviours';
import { createHarness } from './testHarness';
import { createWorld } from './world';

function projectWith(entities: ReturnType<typeof createEntity>[]): Project {
  const project = createDefaultProject();
  for (const entity of entities) project.entities[entity.id] = entity;
  return project;
}

const ground = (id = 'ground') =>
  createEntity({
    id,
    name: 'Ground',
    geometry: 'plane',
    position: [0, -0.5, 0],
    scale: [20, 1, 20],
    collider: { size: [1, 1, 1] },
  });

describe('world transforms', () => {
  it('composes a child transform with its parent translation', () => {
    const project = projectWith([
      createEntity({ id: 'parent', name: 'Parent', geometry: 'box', position: [10, 2, -4] }),
      createEntity({ id: 'child', name: 'Child', geometry: 'box', position: [1, 0.5, 0], parentId: 'parent' }),
    ]);
    const world = createWorld({ project });

    expect(world.getEntity('child')?.position).toEqual([1, 0.5, 0]);
    expect(world.getWorldPosition('child')).toEqual([11, 2.5, -4]);
    expect(world.getWorldPosition('parent')).toEqual([10, 2, -4]);
  });

  it('rotates a child around its parent', () => {
    const project = projectWith([
      createEntity({
        id: 'parent',
        name: 'Parent',
        geometry: 'box',
        position: [0, 0, 0],
        rotation: [0, Math.PI / 2, 0],
      }),
      createEntity({ id: 'child', name: 'Child', geometry: 'box', position: [0, 0, 2], parentId: 'parent' }),
    ]);
    const world = createWorld({ project });

    // A quarter turn about Y maps local +Z onto world +X.
    const [x, y, z] = world.getWorldPosition('child');
    expect(x).toBeCloseTo(2, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('scales a child with its parent and walks deeper hierarchies', () => {
    const project = projectWith([
      createEntity({ id: 'a', name: 'A', geometry: 'box', position: [1, 0, 0], scale: [2, 2, 2] }),
      createEntity({ id: 'b', name: 'B', geometry: 'box', position: [0, 1, 0], parentId: 'a' }),
      createEntity({ id: 'c', name: 'C', geometry: 'box', position: [0, 0, 3], parentId: 'b' }),
    ]);
    const world = createWorld({ project });

    expect(world.getWorldPosition('b')).toEqual([1, 2, 0]);
    expect(world.getWorldPosition('c')).toEqual([1, 2, 6]);
  });

  it('exposes the same matrix the renderer builds', () => {
    const project = projectWith([
      createEntity({ id: 'parent', name: 'Parent', geometry: 'box', position: [4, 0, 0] }),
      createEntity({
        id: 'child',
        name: 'Child',
        geometry: 'box',
        position: [0, 1, 0],
        rotation: [0, 0, Math.PI / 2],
        parentId: 'parent',
      }),
    ]);
    const world = createWorld({ project });

    // Column-major, as `THREE.Matrix4.fromArray` expects.
    const matrix = world.getWorldMatrix('child');
    expect(matrix).not.toBeNull();
    expect(Array.from(matrix!.slice(12, 15))).toEqual([4, 1, 0]);
    // 90° about Z: the local X axis points along world +Y.
    expect(matrix![0]).toBeCloseTo(0, 6);
    expect(matrix![1]).toBeCloseTo(1, 6);
  });

  it('follows a parent that its own behaviour moves', () => {
    const project = projectWith([
      ground(),
      createEntity({
        id: 'lifter',
        name: 'Lifter',
        geometry: 'box',
        position: [0, 1, 0],
        behaviours: [createBehaviourInstance('bob', { axis: 'y', distance: 2, speed: 1 })],
      }),
      createEntity({ id: 'flag', name: 'Flag', geometry: 'box', position: [1, 0, 0], parentId: 'lifter' }),
    ]);
    const harness = createHarness(project);

    const startY = harness.world.getWorldPosition('flag')[1];
    harness.run(0.6);
    const laterY = harness.world.getWorldPosition('flag')[1];

    expect(laterY).not.toBeCloseTo(startY, 3);
    expect(harness.world.getWorldPosition('flag')[0]).toBeCloseTo(1, 6);
  });

  it('reports a cyclic hierarchy once and keeps running', () => {
    const project = projectWith([
      createEntity({ id: 'a', name: 'A', geometry: 'box', position: [1, 0, 0], parentId: 'b' }),
      createEntity({ id: 'b', name: 'B', geometry: 'box', position: [0, 2, 0], parentId: 'a' }),
    ]);
    const harness = createHarness(project);

    harness.run(0.2);

    const cycles = harness.world
      .getDiagnostics()
      .filter((diagnostic) => diagnostic.code === 'hierarchy');
    expect(cycles).toHaveLength(1);
    expect(cycles[0].level).toBe('warning');
    // The chain is cut at the cycle: `b` is used as a root, so `a` is still
    // placed relative to it and nothing recurses forever.
    expect(harness.world.getWorldPosition('a')).toEqual([1, 2, 0]);
    expect(harness.world.getWorldPosition('b')).toEqual([0, 2, 0]);
  });

  it('treats a missing parent as a root object', () => {
    const project = projectWith([
      createEntity({ id: 'orphan', name: 'Orphan', geometry: 'box', position: [3, 0, 0], parentId: 'gone' }),
    ]);
    const world = createWorld({ project });

    expect(world.getWorldPosition('orphan')).toEqual([3, 0, 0]);
  });
});

describe('collision in world space', () => {
  it('reports overlaps at the child transform position', () => {
    const project = projectWith([
      createEntity({ id: 'mover', name: 'Mover', geometry: 'box', position: [5, 0, 5] }),
      createEntity({
        id: 'pad',
        name: 'Pad',
        geometry: 'box',
        position: [0, 0, 0],
        parentId: 'mover',
        collider: { size: [2, 2, 2], isTrigger: true },
      }),
      createEntity({
        id: 'walker',
        name: 'Walker',
        geometry: 'box',
        position: [5, 0, 5],
        collider: { size: [1, 1, 1] },
      }),
    ]);
    const harness = createHarness(project);
    harness.run(0.1);

    // The pad sits on top of the mover, so the walker is inside it.
    expect(harness.world.getOverlaps('pad')).toContain('walker');

    // Move the parent away: the trigger follows and the overlap ends.
    harness.entity('mover').position = [50, 0, 50];
    harness.run(0.1);
    expect(harness.world.getOverlaps('pad')).toEqual([]);
  });

  it('blocks movement against a child solid volume', () => {
    const project = projectWith([
      createEntity({ id: 'mover', name: 'Mover', geometry: 'box', position: [0, 0, 0] }),
      createEntity({
        id: 'wall',
        name: 'Wall',
        geometry: 'box',
        position: [2, 0, 0],
        parentId: 'mover',
        collider: { size: [1, 4, 4] },
      }),
      createEntity({
        id: 'walker',
        name: 'Walker',
        geometry: 'box',
        position: [-1, 0, 0],
        collider: { size: [1, 1, 1] },
        behaviours: [createBehaviourInstance('character', { useGravity: false, speed: 4 })],
      }),
    ]);
    const harness = createHarness(project);

    harness.input.setAxis(1, 0);
    harness.run(2);
    harness.input.setAxis(0, 0);

    // The wall is at world x = 2, a metre wide, and the walker is a metre wide.
    expect(harness.entity('walker').position[0]).toBeLessThan(1.6);
    expect(harness.entity('walker').position[0]).toBeGreaterThan(0.8);
  });

  it('resolves movement against the parent transform', () => {
    const project = projectWith([
      createEntity({
        id: 'parent',
        name: 'Parent',
        geometry: 'box',
        position: [0, 0, 0],
        scale: [2, 2, 2],
      }),
      createEntity({
        id: 'child',
        name: 'Child',
        geometry: 'box',
        position: [0, 0, 0],
        parentId: 'parent',
        collider: { size: [1, 1, 1] },
      }),
      ground(),
    ]);
    const world = createWorld({ project });

    // Local +2 on X is +4 in world space because the parent doubles its scale.
    world.moveEntity('child', [0, 0, 0]);
    const moved = world.moveEntity('child', [2, 0, 0]);
    expect(moved.position[0]).toBeCloseTo(2, 6);
    expect(world.getWorldPosition('child')[0]).toBeCloseTo(4, 6);
  });

  it('reports the world-space volume of a child collider', () => {
    const project = projectWith([
      createEntity({ id: 'parent', name: 'Parent', geometry: 'box', position: [3, 0, 0] }),
      createEntity({
        id: 'child',
        name: 'Child',
        geometry: 'box',
        position: [0, 1, 0],
        parentId: 'parent',
        collider: { size: [2, 2, 2] },
      }),
    ]);
    const world = createWorld({ project });

    const box = world.getWorldAabb('child');
    expect(box).not.toBeNull();
    expect(box!.min[0]).toBeCloseTo(2, 6);
    expect(box!.max[1]).toBeCloseTo(2, 6);
    expect(box!.min[2]).toBeCloseTo(-1, 6);
    expect(world.getWorldAabb('parent')).toBeNull();
  });

  it('keeps a parented object upright when the parent is rotated', () => {
    const project = projectWith([
      createEntity({
        id: 'parent',
        name: 'Parent',
        geometry: 'box',
        rotation: [0, 0, Math.PI / 2],
      }),
      createEntity({
        id: 'child',
        name: 'Child',
        geometry: 'box',
        position: [1, 0, 0],
        parentId: 'parent',
        collider: { size: [2, 2, 2] },
      }),
    ]);
    const world = createWorld({ project });

    // Rotated 90° about Z, the child's local +X ends up along world +Y, and its
    // box is the axis-aligned bound of the rotated one.
    const box = world.getWorldAabb('child');
    expect(box!.min[0]).toBeCloseTo(-1, 6);
    expect(box!.max[0]).toBeCloseTo(1, 6);
    expect(box!.min[1]).toBeCloseTo(0, 6);
    expect(box!.max[1]).toBeCloseTo(2, 6);
  });
});
