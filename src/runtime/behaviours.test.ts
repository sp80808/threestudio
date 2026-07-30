import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Entity } from '../simulation/schema';
import { applyRuntimeBehaviours, createRuntimeBehaviourState } from './behaviours';

function makeEntity(behaviours: Entity['behaviours']): Entity {
  return {
    id: 'entity-1',
    name: 'Test entity',
    parentId: null,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    components: {},
    behaviours,
  };
}

describe('runtime behaviours', () => {
  it('applies spin using degrees per second on the configured axis', () => {
    const object = new THREE.Object3D();
    const state = createRuntimeBehaviourState(object);
    const entity = makeEntity([
      {
        id: 'spin-1',
        type: 'spin',
        label: 'Spin',
        enabled: true,
        parameters: { axis: 'z', speed: 90 },
      },
    ]);

    applyRuntimeBehaviours(entity, object, state, 0.5);

    expect(object.rotation.z).toBeCloseTo(Math.PI / 4, 6);
    expect(object.rotation.x).toBe(0);
    expect(object.rotation.y).toBe(0);
  });

  it('applies bob relative to the captured base position without drift', () => {
    const object = new THREE.Object3D();
    object.position.set(2, 3, 4);
    const state = createRuntimeBehaviourState(object);
    const entity = makeEntity([
      {
        id: 'bob-1',
        type: 'bob',
        label: 'Float / Bob',
        enabled: true,
        parameters: { axis: 'y', amplitude: 2, frequency: 1 },
      },
    ]);

    applyRuntimeBehaviours(entity, object, state, 0.25);
    expect(object.position.toArray()).toEqual([2, 5, 4]);

    applyRuntimeBehaviours(entity, object, state, 0.25);
    expect(object.position.x).toBe(2);
    expect(object.position.y).toBeCloseTo(3, 6);
    expect(object.position.z).toBe(4);
  });

  it('ignores disabled behaviours', () => {
    const object = new THREE.Object3D();
    const state = createRuntimeBehaviourState(object);
    const entity = makeEntity([
      {
        id: 'spin-disabled',
        type: 'spin',
        label: 'Disabled spin',
        enabled: false,
        parameters: { axis: 'y', speed: 360 },
      },
    ]);

    applyRuntimeBehaviours(entity, object, state, 1);

    expect(object.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });
});
