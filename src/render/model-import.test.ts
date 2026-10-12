// @vitest-environment jsdom
/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Model import tests.
 *
 * The interesting properties are that a hierarchy survives the trip, that a
 * mesh lands where it was drawn in the file, and that the result is a valid
 * document — the same JSON the editor saves and the runtime plays.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { describe, expect, it } from 'vitest';
import { entitiesFromObject3D, loadModel, MAX_IMPORTED_OBJECTS } from './model-import';
import { ProjectSchema, createDefaultProject } from '../simulation/schema';

function modelWithParts() {
  const root = new THREE.Group();
  root.name = 'Blockout';

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1, 2),
    new THREE.MeshStandardMaterial({ color: 0x3366ff }),
  );
  base.name = 'Base';
  root.add(base);

  const tower = new THREE.Group();
  tower.name = 'Tower';
  tower.position.set(3, 1.5, 0);
  tower.rotation.set(0, Math.PI / 2, 0);
  root.add(tower);

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshStandardMaterial({ color: 0xff6633 }),
  );
  top.name = 'Top';
  top.position.set(0, 1, 0);
  top.scale.set(2, 1, 1);
  tower.add(top);

  return root;
}

describe('model import', () => {
  it('turns every node into an object, keeping the hierarchy', () => {
    const { entities, meshCount, nodeCount, truncated } = entitiesFromObject3D(modelWithParts(), {
      idPrefix: 'blockout',
    });

    expect(truncated).toBe(false);
    expect(nodeCount).toBe(4);
    expect(meshCount).toBe(2);
    expect(entities.map((entity) => entity.name)).toEqual(['Blockout', 'Base', 'Tower', 'Top']);
    expect(entities[0].parentId).toBeNull();
    expect(entities[1].parentId).toBe(entities[0].id);
    expect(entities[2].parentId).toBe(entities[0].id);
    expect(entities[3].parentId).toBe(entities[2].id);
    // A group has no appearance of its own.
    expect(entities[0].components.render).toBeUndefined();
    expect(entities[2].components.render).toBeUndefined();
  });

  it('approximates meshes with a box that matches the mesh extent', () => {
    const { entities } = entitiesFromObject3D(modelWithParts(), { idPrefix: 'blockout' });
    const [, base, , top] = entities;

    expect(base.components.render?.geometry).toBe('box');
    expect(base.transform.scale).toEqual([4, 1, 2]);
    expect(base.transform.position).toEqual([0, 0, 0]);
    expect(base.components.render?.color?.toLowerCase()).toBe('#3366ff');

    // The child of a rotated, translated group keeps its own transform: the
    // parent's rotation moves it in the scene, not in the file.
    expect(top.transform.position).toEqual([0, 1, 0]);
    expect(top.transform.scale).toEqual([2, 2, 1]);
  });

  it('keeps off-centre geometry in place', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1).translate(2, 0, 0),
      new THREE.MeshStandardMaterial(),
    );
    const { entities } = entitiesFromObject3D(mesh, { idPrefix: 'chip' });

    expect(entities[0].transform.position[0]).toBeCloseTo(2, 6);
    expect(entities[0].transform.scale).toEqual([1, 1, 1]);
  });

  it('produces a document the schema and the runtime accept', () => {
    const { entities } = entitiesFromObject3D(modelWithParts(), { idPrefix: 'blockout' });
    const project = { ...createDefaultProject(), id: 'imported', name: 'Imported' };
    for (const entity of entities) project.entities[entity.id] = entity;

    const result = ProjectSchema.safeParse(project);
    if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2));
    expect(Object.keys(project.entities)).toHaveLength(entities.length);
  });

  it('stops at the object limit instead of flooding the scene', () => {
    const root = new THREE.Group();
    for (let index = 0; index < MAX_IMPORTED_OBJECTS + 25; index += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      mesh.name = `Part ${index}`;
      root.add(mesh);
    }

    const { entities, truncated, nodeCount } = entitiesFromObject3D(root, { idPrefix: 'crowd' });
    expect(truncated).toBe(true);
    expect(entities).toHaveLength(MAX_IMPORTED_OBJECTS);
    expect(nodeCount).toBeGreaterThan(MAX_IMPORTED_OBJECTS);
  });

  it('round-trips a scene through GLB export and import', async () => {
    const source = new THREE.Scene();
    const part = new THREE.Mesh(
      new THREE.BoxGeometry(2, 3, 4),
      new THREE.MeshStandardMaterial({ color: 0x22cc88 }),
    );
    part.name = 'Slab';
    part.position.set(5, 1, -2);
    source.add(part);

    const exported = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(
        source,
        (result) => resolve(result as ArrayBuffer),
        reject,
        { binary: true },
      );
    });

    const scene = await loadModel(exported);
    const { entities } = entitiesFromObject3D(scene, { idPrefix: 'roundtrip' });
    const slab = entities.find((entity) => entity.name === 'Slab');

    expect(slab).toBeDefined();
    expect(slab?.transform.scale.map((value) => Number(value.toFixed(3)))).toEqual([2, 3, 4]);
    expect(slab?.transform.position.map((value) => Number(value.toFixed(3)))).toEqual([5, 1, -2]);
  });
});
