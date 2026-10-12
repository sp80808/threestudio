/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Runtime contracts shared by behaviours, rules and the world.
 *
 * These interfaces are the boundary that keeps gameplay code free of React and
 * Three.js: behaviours only ever talk to `WorldAccess`.
 */

import type {
  Behaviour,
  BehaviourValue,
  ColliderComponent,
  Project,
  RenderComponent,
  Rule,
  Vec3,
} from '../simulation/schema';
import type { DiagnosticLevel } from './diagnostics';

/** Arbitrary per-behaviour-instance scratch data (timers, progress, ...). */
export type BehaviourRuntimeState = Record<string, unknown>;

/**
 * Mutable runtime view of an entity. The document is never mutated: play mode
 * runs on a clone so stopping always restores the authored scene.
 */
export interface RuntimeEntity {
  id: string;
  name: string;
  parentId: string | null;
  position: Vec3;
  /** Euler angles in radians. */
  rotation: Vec3;
  scale: Vec3;
  render: RenderComponent | null;
  collider: ColliderComponent | null;
  colliderEnabled: boolean;
  visible: boolean;
  enabled: boolean;
  tags: string[];
  behaviours: Behaviour[];
  rules: Rule[];
  /** Per-behaviour scratch state keyed by behaviour id. */
  state: Map<string, BehaviourRuntimeState>;
  /** Ids of entities currently overlapping this entity's collider. */
  overlaps: Set<string>;
  /** Authored transform, captured when the session starts. */
  initialPosition: Vec3;
  initialRotation: Vec3;
  initialScale: Vec3;
  initialVisible: boolean;
  initialEnabled: boolean;
  /** Stable evaluation order index. */
  order: number;
}

export type GameEventType =
  | 'scene-start'
  | 'scene-stop'
  | 'pointer-click'
  | 'trigger-enter'
  | 'trigger-exit'
  | 'variable-changed'
  | 'interval'
  | 'custom';

export interface GameEvent {
  type: GameEventType;
  /** Entity the event belongs to (the trigger, the clicked object, ...). */
  sourceEntityId: string | null;
  /** Custom event or message name. */
  name: string | null;
  /** Second entity involved (the body that entered a trigger). */
  otherEntityId: string | null;
  value: BehaviourValue;
  previousValue: BehaviourValue;
  time: number;
}

export interface PointerPick {
  entityId: string | null;
  point: Vec3;
}

/** Input abstraction so the game loop can be driven by a test double. */
export interface GameInput {
  /** Movement intent in screen space: `x` right, `y` forward. Unit range. */
  getMovementAxis(): { x: number; y: number };
  isKeyDown(code: string): boolean;
  /** Keys that went down since the previous fixed step. */
  getPressedKeys(): string[];
  /** Pointer picks recorded since the previous fixed step. */
  takePointerPicks(): PointerPick[];
  /** Called by the world at the end of every fixed step. */
  endStep(): void;
}

export interface MoveResult {
  position: Vec3;
  blocked: { x: boolean; y: boolean; z: boolean };
}

/** The slice of the world a behaviour is allowed to observe and change. */
export interface WorldAccess {
  readonly time: number;
  readonly delta: number;
  readonly gravity: number;
  /** Yaw of the play-mode camera in radians, used for camera-relative input. */
  readonly cameraYaw: number;
  readonly input: GameInput;
  /** Deterministic random source (seeded per session). */
  readonly random: () => number;
  getEntity(id: string): RuntimeEntity | undefined;
  getEntities(): RuntimeEntity[];
  getPlayer(): RuntimeEntity | undefined;
  findEntitiesByTag(tag: string): RuntimeEntity[];
  getOverlaps(entityId: string): string[];
  moveEntity(entityId: string, delta: Vec3): MoveResult;
  setColliderEnabled(entityId: string, enabled: boolean): void;
  /** Restores an entity to its authored transform/flags and clears its state. */
  resetEntity(entityId: string): void;
  hasVariable(id: string): boolean;
  getVariable(id: string): BehaviourValue;
  getVariableByName(name: string): BehaviourValue;
  setVariable(id: string, value: BehaviourValue): void;
  changeVariable(id: string, delta: number): void;
  sendMessage(targetEntityId: string, name: string, value?: BehaviourValue): void;
  emitEvent(event: Omit<GameEvent, 'time'>): void;
  report(level: DiagnosticLevel, code: string, message: string, entityId?: string): void;
}

export interface BehaviourContext {
  entity: RuntimeEntity;
  params: Record<string, BehaviourValue>;
  state: BehaviourRuntimeState;
  delta: number;
  time: number;
  world: WorldAccess;
}

export interface BehaviourMessageContext extends BehaviourContext {
  message: GameEvent;
}

export type BehaviourParameterKind =
  | 'number'
  | 'boolean'
  | 'string'
  | 'axis'
  | 'entity'
  | 'variable'
  | 'select';

export interface BehaviourParameterSpec {
  key: string;
  label: string;
  kind: BehaviourParameterKind;
  default: BehaviourValue;
  step?: number;
  min?: number;
  max?: number;
  help?: string;
  options?: { value: string; label: string }[];
}

export interface BehaviourDefinition {
  type: string;
  label: string;
  description: string;
  category: 'motion' | 'interaction' | 'gameplay';
  parameters: BehaviourParameterSpec[];
  /** Extra scratch state fields created when a session starts. */
  createState?: (entity: RuntimeEntity) => BehaviourRuntimeState;
  update: (context: BehaviourContext) => void;
  /** Optional reaction to messages sent to this entity. */
  onMessage?: (context: BehaviourMessageContext) => void;
}

export interface WorldOptions {
  project: Project;
  input?: GameInput;
  /** Deterministic seed for `world.random`. */
  seed?: number;
  /** Injectable clock for diagnostics/testing. */
  now?: () => number;
  stepRate?: number;
}
