import RAPIER, {
  ActiveEvents,
  ColliderDesc,
  EventQueue,
  RigidBody,
  RigidBodyDesc,
  World,
} from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BehaviourValue, Entity, PhysicsComponent, Project, Rule } from '../simulation/schema';
import { moveTowards, smoothStep01 } from './doorMotion';

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const MAX_SUBSTEPS = 5;

let rapierInitialization: Promise<void> | null = null;

async function ensureRapierInitialized(): Promise<void> {
  if (!rapierInitialization) {
    rapierInitialization = Promise.resolve(RAPIER.init()).then(() => undefined);
  }
  await rapierInitialization;
}

export interface RuntimeTraceEntry {
  kind: 'info' | 'event' | 'warning';
  message: string;
  entityId?: string;
}

interface BodyRecord {
  body: RigidBody;
  bodyType: PhysicsComponent['bodyType'];
  object: THREE.Object3D;
}

interface DoorRuntimeState {
  entityId: string;
  object: THREE.Object3D;
  bodyRecord?: BodyRecord;
  basePosition: THREE.Vector3;
  axis: 'x' | 'y' | 'z';
  distance: number;
  duration: number;
  progress: number;
  target: 0 | 1;
}

function asNumber(value: BehaviourValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asAxis(value: BehaviourValue | undefined): 'x' | 'y' | 'z' {
  return value === 'x' || value === 'z' ? value : 'y';
}

function bodyDescriptorFor(component: PhysicsComponent): RigidBodyDesc {
  switch (component.bodyType) {
    case 'dynamic':
      return RigidBodyDesc.dynamic();
    case 'kinematic-position':
      return RigidBodyDesc.kinematicPositionBased();
    default:
      return RigidBodyDesc.fixed();
  }
}

function entityQuaternion(entity: Entity): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      entity.transform.rotation[0],
      entity.transform.rotation[1],
      entity.transform.rotation[2],
      'XYZ',
    ),
  );
}

function hasPressurePlateBehaviour(entity: Entity): boolean {
  return (entity.behaviours ?? []).some(
    (behaviour) => behaviour.enabled && behaviour.type === 'pressure-plate',
  );
}

function evaluateRule(rule: Rule): boolean {
  return rule.enabled && rule.conditions.length === 0;
}

export class PhysicsRuntime {
  private accumulator = 0;
  private readonly world: World;
  private readonly eventQueue: EventQueue;
  private readonly bodies = new Map<string, BodyRecord>();
  private readonly colliderEntityIds = new Map<number, string>();
  private readonly sensorEntityIds = new Set<string>();
  private readonly activeSensorOverlaps = new Map<string, Set<string>>();
  private readonly doors = new Map<string, DoorRuntimeState>();
  private disposed = false;

  private constructor(
    private readonly project: Project,
    private readonly objects: Map<string, THREE.Object3D>,
    private readonly onTrace?: (entry: RuntimeTraceEntry) => void,
  ) {
    this.world = new World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_TIMESTEP_SECONDS;
    this.eventQueue = new EventQueue(true);
    this.buildBodies();
    this.buildDoorStates();
    this.trace({ kind: 'info', message: `Physics ready: ${this.bodies.size} bodies at 60 Hz.` });
  }

  static async create(
    project: Project,
    objects: Map<string, THREE.Object3D>,
    onTrace?: (entry: RuntimeTraceEntry) => void,
  ): Promise<PhysicsRuntime> {
    await ensureRapierInitialized();
    return new PhysicsRuntime(project, objects, onTrace);
  }

  private trace(entry: RuntimeTraceEntry): void {
    this.onTrace?.(entry);
  }

  private buildBodies(): void {
    for (const entity of Object.values(this.project.entities)) {
      const physics = entity.components.physics;
      const object = this.objects.get(entity.id);
      if (!object || !physics || physics.type !== 'physics') continue;

      const quaternion = entityQuaternion(entity);
      const bodyDescription = bodyDescriptorFor(physics)
        .setTranslation(
          entity.transform.position[0],
          entity.transform.position[1],
          entity.transform.position[2],
        )
        .setRotation({
          x: quaternion.x,
          y: quaternion.y,
          z: quaternion.z,
          w: quaternion.w,
        });

      const body = this.world.createRigidBody(bodyDescription);
      const halfExtentX = Math.max(0.001, Math.abs(entity.transform.scale[0]) / 2);
      const halfExtentY = Math.max(0.001, Math.abs(entity.transform.scale[1]) / 2);
      const halfExtentZ = Math.max(0.001, Math.abs(entity.transform.scale[2]) / 2);
      let colliderDescription = ColliderDesc.cuboid(halfExtentX, halfExtentY, halfExtentZ)
        .setSensor(physics.sensor);

      if (physics.sensor) {
        colliderDescription = colliderDescription.setActiveEvents(ActiveEvents.COLLISION_EVENTS);
        this.sensorEntityIds.add(entity.id);
        this.activeSensorOverlaps.set(entity.id, new Set());
      }

      const collider = this.world.createCollider(colliderDescription, body);
      this.colliderEntityIds.set(collider.handle, entity.id);
      this.bodies.set(entity.id, { body, bodyType: physics.bodyType, object });
    }
  }

  private buildDoorStates(): void {
    for (const entity of Object.values(this.project.entities)) {
      const behaviour = (entity.behaviours ?? []).find(
        (candidate) => candidate.enabled && candidate.type === 'door',
      );
      const object = this.objects.get(entity.id);
      if (!behaviour || !object) continue;

      this.doors.set(entity.id, {
        entityId: entity.id,
        object,
        bodyRecord: this.bodies.get(entity.id),
        basePosition: new THREE.Vector3(
          entity.transform.position[0],
          entity.transform.position[1],
          entity.transform.position[2],
        ),
        axis: asAxis(behaviour.parameters.direction),
        distance: asNumber(behaviour.parameters.distance, 2),
        duration: Math.max(0.05, asNumber(behaviour.parameters.duration, 0.8)),
        progress: 0,
        target: 0,
      });
    }
  }

  private setDoorTarget(entityId: string, open: boolean): void {
    const door = this.doors.get(entityId);
    if (!door) {
      this.trace({ kind: 'warning', message: `Rule target is not an enabled Door: ${entityId}.`, entityId });
      return;
    }

    const target: 0 | 1 = open ? 1 : 0;
    if (door.target === target) return;
    door.target = target;
    this.trace({
      kind: 'event',
      message: `${open ? 'Opening' : 'Closing'} ${this.project.entities[entityId]?.name ?? 'door'}.`,
      entityId,
    });
  }

  private updateDoors(deltaSeconds: number): void {
    for (const door of this.doors.values()) {
      door.progress = moveTowards(
        door.progress,
        door.target,
        deltaSeconds / door.duration,
      );
      const offset = door.distance * smoothStep01(door.progress);
      const next = {
        x: door.basePosition.x,
        y: door.basePosition.y,
        z: door.basePosition.z,
      };
      next[door.axis] += offset;

      if (door.bodyRecord?.bodyType === 'kinematic-position') {
        door.bodyRecord.body.setNextKinematicTranslation(next);
      } else {
        door.object.position.set(next.x, next.y, next.z);
      }
    }
  }

  private executeTriggerRules(sourceEntityId: string, started: boolean): void {
    const source = this.project.entities[sourceEntityId];
    if (!source) return;

    const eventType = started ? 'trigger-enter' : 'trigger-exit';
    let actionWasExecuted = false;

    for (const rule of source.rules ?? []) {
      if (
        rule.event.type !== eventType ||
        rule.event.sourceEntityId !== sourceEntityId ||
        !evaluateRule(rule)
      ) continue;

      this.trace({ kind: 'event', message: rule.name, entityId: sourceEntityId });
      for (const action of rule.actions) {
        if (!action.targetEntityId) continue;
        if (action.type === 'open-door') {
          this.setDoorTarget(action.targetEntityId, true);
          actionWasExecuted = true;
        } else if (action.type === 'close-door') {
          this.setDoorTarget(action.targetEntityId, false);
          actionWasExecuted = true;
        }
      }
    }

    if (actionWasExecuted) return;

    for (const behaviour of source.behaviours ?? []) {
      if (!behaviour.enabled || behaviour.type !== 'pressure-plate') continue;
      const targetEntityId = behaviour.parameters.targetEntityId;
      if (typeof targetEntityId === 'string' && targetEntityId) {
        this.setDoorTarget(targetEntityId, started);
      }
    }
  }

  private processCollisionEvent(handle1: number, handle2: number, started: boolean): void {
    const entity1 = this.colliderEntityIds.get(handle1);
    const entity2 = this.colliderEntityIds.get(handle2);
    if (!entity1 || !entity2) return;

    const sensorId = this.sensorEntityIds.has(entity1)
      ? entity1
      : this.sensorEntityIds.has(entity2)
        ? entity2
        : null;
    if (!sensorId) return;

    const otherId = sensorId === entity1 ? entity2 : entity1;
    const otherBody = this.bodies.get(otherId);
    const sensorEntity = this.project.entities[sensorId];
    if (
      otherBody?.bodyType !== 'dynamic' ||
      !sensorEntity ||
      !hasPressurePlateBehaviour(sensorEntity)
    ) return;

    const overlaps = this.activeSensorOverlaps.get(sensorId) ?? new Set<string>();
    this.activeSensorOverlaps.set(sensorId, overlaps);

    if (started) {
      const wasEmpty = overlaps.size === 0;
      overlaps.add(otherId);
      if (wasEmpty) this.executeTriggerRules(sensorId, true);
      return;
    }

    overlaps.delete(otherId);
    if (overlaps.size === 0) this.executeTriggerRules(sensorId, false);
  }

  private syncObjectsFromPhysics(): void {
    for (const record of this.bodies.values()) {
      if (record.bodyType === 'fixed') continue;
      const translation = record.body.translation();
      const rotation = record.body.rotation();
      record.object.position.set(translation.x, translation.y, translation.z);
      record.object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
  }

  step(frameDeltaSeconds: number): void {
    if (this.disposed) return;
    this.accumulator += Math.min(Math.max(frameDeltaSeconds, 0), 0.1);

    let substeps = 0;
    while (this.accumulator >= FIXED_TIMESTEP_SECONDS && substeps < MAX_SUBSTEPS) {
      this.updateDoors(FIXED_TIMESTEP_SECONDS);
      this.world.step(this.eventQueue);
      this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        this.processCollisionEvent(handle1, handle2, started);
      });
      this.syncObjectsFromPhysics();
      this.accumulator -= FIXED_TIMESTEP_SECONDS;
      substeps += 1;
    }

    if (substeps === MAX_SUBSTEPS && this.accumulator >= FIXED_TIMESTEP_SECONDS) {
      this.accumulator = 0;
      this.trace({ kind: 'warning', message: 'Physics catch-up was capped to protect editor responsiveness.' });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.eventQueue.free();
    this.world.free();
    this.bodies.clear();
    this.colliderEntityIds.clear();
    this.sensorEntityIds.clear();
    this.activeSensorOverlaps.clear();
    this.doors.clear();
    this.trace({ kind: 'info', message: 'Physics runtime disposed; edit state restored.' });
  }
}
