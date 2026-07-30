import * as THREE from 'three';
import { BehaviourValue, Entity } from '../simulation/schema';

export interface RuntimeBehaviourState {
  basePosition: THREE.Vector3;
  elapsed: number;
}

export function createRuntimeBehaviourState(object: THREE.Object3D): RuntimeBehaviourState {
  return {
    basePosition: object.position.clone(),
    elapsed: 0,
  };
}

function asNumber(value: BehaviourValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function asAxis(value: BehaviourValue | undefined): 'x' | 'y' | 'z' {
  return value === 'x' || value === 'z' ? value : 'y';
}

export function applyRuntimeBehaviours(
  entity: Entity,
  object: THREE.Object3D,
  state: RuntimeBehaviourState,
  deltaSeconds: number,
): void {
  state.elapsed += deltaSeconds;

  for (const behaviour of entity.behaviours ?? []) {
    if (!behaviour.enabled) continue;

    if (behaviour.type === 'spin') {
      const axis = asAxis(behaviour.parameters.axis);
      const degreesPerSecond = asNumber(behaviour.parameters.speed, 45);
      object.rotation[axis] += THREE.MathUtils.degToRad(degreesPerSecond) * deltaSeconds;
      continue;
    }

    if (behaviour.type === 'bob') {
      const axis = asAxis(behaviour.parameters.axis);
      const amplitude = asNumber(behaviour.parameters.amplitude, 0.25);
      const frequency = Math.max(0, asNumber(behaviour.parameters.frequency, 1));
      const offset = Math.sin(state.elapsed * frequency * Math.PI * 2) * amplitude;
      object.position.copy(state.basePosition);
      object.position[axis] += offset;
    }
  }
}
