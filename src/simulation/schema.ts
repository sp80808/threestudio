/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Serialisable project document.
 *
 * This module is the single source of truth for everything that is saved,
 * loaded, exported or handed to the runtime. It must stay free of Three.js,
 * React and DOM imports so documents remain portable and testable.
 *
 * Runtime-only concepts (per-frame behaviour state, overlap sets, ...) live in
 * `src/runtime/` and never leak into the document.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Basic value types
// ---------------------------------------------------------------------------

/**
 * Vectors are plain 3-tuples. The explicit type keeps them exact (Zod 4 widens
 * tuple inference, which would make every `[number, number, number]` field
 * optional) while validation still runs on load.
 */
export type Vec3 = [number, number, number];
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]) as unknown as z.ZodType<Vec3>;

export const TransformSchema = z.object({
  position: Vec3Schema,
  /** Euler angles in radians, XYZ order. */
  rotation: Vec3Schema,
  scale: Vec3Schema,
});

export const GeometryKindSchema = z.enum([
  'box',
  'sphere',
  'plane',
  'cylinder',
  'cone',
  'capsule',
]);

export const AxisSchema = z.enum(['x', 'y', 'z']);

/**
 * Values that can be stored on a variable, a behaviour parameter or carried by
 * a rule condition/action. Kept intentionally small for no-code authoring.
 */
export const BehaviourValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const VariableTypeSchema = z.enum(['number', 'boolean', 'string']);

export const VariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: VariableTypeSchema,
  initialValue: BehaviourValueSchema,
  description: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const RenderComponentSchema = z.object({
  type: z.literal('render'),
  geometry: GeometryKindSchema,
  color: z.string(),
  visible: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

export const ColliderShapeSchema = z.enum(['box', 'sphere']);

/**
 * A collider is an axis-aligned volume used for solid blocking and trigger
 * overlap tests. `size` is the full extent (width, height, depth); spheres use
 * `size[0]` as their diameter.
 */
export const ColliderComponentSchema = z.object({
  type: z.literal('collider'),
  shape: ColliderShapeSchema,
  size: Vec3Schema,
  offset: Vec3Schema.optional(),
  /** Triggers never block movement; they only report overlaps. */
  isTrigger: z.boolean().optional(),
});

export const ComponentSchema = z.discriminatedUnion('type', [
  RenderComponentSchema,
  ColliderComponentSchema,
]);

/**
 * Components are stored as a keyed object rather than a list so documents stay
 * readable and diffs stay small. Schema-level keys keep `entity.components.render`
 * precisely typed instead of degrading to a union.
 */
export const ComponentsSchema = z.object({
  render: RenderComponentSchema.optional(),
  collider: ColliderComponentSchema.optional(),
});

// ---------------------------------------------------------------------------
// Behaviours
// ---------------------------------------------------------------------------

/**
 * Behaviour types are *not* closed by the schema. The runtime behaviour
 * registry (`src/runtime/behaviours.ts`) is the source of truth, so new
 * behaviours can be registered, documented and unit tested in one place.
 * Unknown types are reported through runtime diagnostics instead of being
 * silently dropped while parsing.
 */
export const BehaviourSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  enabled: z.boolean(),
  parameters: z.record(z.string(), BehaviourValueSchema),
});

// ---------------------------------------------------------------------------
// Rules (WHEN / IF / DO)
// ---------------------------------------------------------------------------

export const RuleEventTypeSchema = z.enum([
  'scene-start',
  'pointer-click',
  'trigger-enter',
  'trigger-exit',
  'variable-changed',
  'interval',
  'custom',
]);

/**
 * Entity references inside rules accept concrete ids plus a few reserved
 * tokens so rules stay reusable when objects are renamed or duplicated.
 */
export const ENTITY_REF_SELF = '$self';
export const ENTITY_REF_EVENT_SOURCE = '$source';
export const ENTITY_REF_EVENT_OTHER = '$other';
/** Only meaningful for `emit-event`: broadcast instead of targeting one object. */
export const ENTITY_REF_BROADCAST = '$all';

export const EntityRefSchema = z.string().nullable();

export const RuleEventSchema = z.object({
  type: RuleEventTypeSchema,
  /** Restrict the rule to events coming from this object. */
  sourceEntityId: EntityRefSchema,
  /** Custom event / message name, or variable id for `variable-changed`. */
  name: z.string().nullable(),
  /** Seconds between firings for `interval` events. */
  interval: z.number().nullable(),
});

export const RuleConditionTypeSchema = z.enum([
  'always',
  'variable-equals',
  'variable-greater-than',
  'distance-less-than',
  'entity-enabled',
  'entity-visible',
  'is-overlapping',
]);

export const RuleConditionSchema = z.object({
  id: z.string(),
  type: RuleConditionTypeSchema,
  subjectEntityId: EntityRefSchema,
  /** Comparison target: variable id, other entity reference or axis. */
  property: z.string().nullable(),
  value: BehaviourValueSchema,
});

export const RuleActionTypeSchema = z.enum([
  'set-variable',
  'change-variable',
  'set-enabled',
  'set-visible',
  'set-behaviour-enabled',
  'move-entity',
  'reset-entity',
  'emit-event',
]);

export const RuleActionSchema = z.object({
  id: z.string(),
  type: RuleActionTypeSchema,
  targetEntityId: EntityRefSchema,
  /** Behaviour id, axis, variable id or event name depending on `type`. */
  property: z.string().nullable(),
  value: BehaviourValueSchema,
});

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  /** Fires at most once per play session when true. */
  once: z.boolean().optional(),
  event: RuleEventSchema,
  conditions: z.array(RuleConditionSchema),
  actions: z.array(RuleActionSchema),
});

// ---------------------------------------------------------------------------
// Entities and project
// ---------------------------------------------------------------------------

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  transform: TransformSchema,
  components: ComponentsSchema,
  behaviours: z.array(BehaviourSchema).optional(),
  rules: z.array(RuleSchema).optional(),
  /** Disabled entities are skipped by the runtime (hidden + inert). */
  enabled: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const ProjectSettingsSchema = z.object({
  /** Fixed simulation step in steps per second. */
  stepRate: z.number().positive(),
  gravity: z.number(),
  /** Play mode camera follows the player character when true. */
  cameraFollow: z.boolean(),
  /** Safety valve against runaway frame deltas. */
  maxStepsPerFrame: z.number().positive(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  version: z.number(),
  name: z.string(),
  entities: z.record(z.string(), EntitySchema),
  variables: z.record(z.string(), VariableSchema).optional(),
  /** Scene-wide rules that are not owned by a specific object. */
  rules: z.array(RuleSchema).optional(),
  settings: ProjectSettingsSchema.optional(),
});

export type Transform = z.infer<typeof TransformSchema>;
export type GeometryKind = z.infer<typeof GeometryKindSchema>;
export type Axis = z.infer<typeof AxisSchema>;
export type RenderComponent = z.infer<typeof RenderComponentSchema>;
export type ColliderComponent = z.infer<typeof ColliderComponentSchema>;
export type EntityComponent = z.infer<typeof ComponentSchema>;
export type EntityComponents = z.infer<typeof ComponentsSchema>;
export type BehaviourValue = z.infer<typeof BehaviourValueSchema>;
export type Behaviour = z.infer<typeof BehaviourSchema>;
export type Variable = z.infer<typeof VariableSchema>;
export type VariableType = z.infer<typeof VariableTypeSchema>;
export type RuleEvent = z.infer<typeof RuleEventSchema>;
export type RuleEventType = z.infer<typeof RuleEventTypeSchema>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleConditionType = z.infer<typeof RuleConditionTypeSchema>;
export type RuleAction = z.infer<typeof RuleActionSchema>;
export type RuleActionType = z.infer<typeof RuleActionTypeSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export const DOCUMENT_VERSION = 2;

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  stepRate: 60,
  gravity: -9.81,
  cameraFollow: true,
  maxStepsPerFrame: 5,
};

export function resolveSettings(project: Project): ProjectSettings {
  return { ...DEFAULT_PROJECT_SETTINGS, ...(project.settings ?? {}) };
}

export function getEntities(project: Project): Entity[] {
  return Object.values(project.entities);
}

export function isEntityVisible(entity: Entity): boolean {
  return entity.components.render?.visible ?? true;
}

export function isEntityEnabled(entity: Entity): boolean {
  return entity.enabled ?? true;
}

export function createDefaultProject(): Project {
  return {
    id: 'default',
    version: DOCUMENT_VERSION,
    name: 'New Project',
    entities: {},
    variables: {},
    rules: [],
    settings: { ...DEFAULT_PROJECT_SETTINGS },
  };
}

export interface EntityOptions {
  id?: string;
  name?: string;
  parentId?: string | null;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  color?: string;
  geometry?: GeometryKind;
  collider?: { shape?: 'box' | 'sphere'; size: Vec3; isTrigger?: boolean; offset?: Vec3 };
  behaviours?: Behaviour[];
  rules?: Rule[];
  tags?: string[];
  enabled?: boolean;
  visible?: boolean;
}

function createId(prefix: string): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${uuid.slice(0, 8)}`;
}

/** Factory used by the editor toolbar, templates and tests. */
export function createEntity(options: EntityOptions = {}): Entity {
  const components: EntityComponents = {};

  if (options.geometry) {
    components.render = {
      type: 'render',
      geometry: options.geometry,
      color: options.color ?? '#888888',
      ...(options.visible === undefined ? {} : { visible: options.visible }),
    };
  }

  if (options.collider) {
    components.collider = {
      type: 'collider',
      shape: options.collider.shape ?? 'box',
      size: options.collider.size,
      isTrigger: options.collider.isTrigger ?? false,
      ...(options.collider.offset ? { offset: options.collider.offset } : {}),
    };
  }

  return {
    id: options.id ?? createId('entity'),
    name: options.name ?? 'Object',
    parentId: options.parentId ?? null,
    transform: {
      position: options.position ?? [0, 0, 0],
      rotation: options.rotation ?? [0, 0, 0],
      scale: options.scale ?? [1, 1, 1],
    },
    components,
    behaviours: options.behaviours ?? [],
    rules: options.rules ?? [],
    ...(options.tags ? { tags: options.tags } : {}),
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  };
}

let behaviourCounter = 0;

export function createBehaviour(
  type: string,
  label: string,
  parameters: Record<string, BehaviourValue> = {},
  enabled = true,
): Behaviour {
  behaviourCounter += 1;
  return {
    id: `${type}-${Date.now().toString(36)}-${behaviourCounter}`,
    type,
    label,
    enabled,
    parameters: { ...parameters },
  };
}

let conditionCounter = 0;

export function createRuleCondition(
  type: RuleConditionType,
  init: Partial<RuleCondition> = {},
): RuleCondition {
  conditionCounter += 1;
  return {
    id: init.id ?? `condition-${Date.now().toString(36)}-${conditionCounter}`,
    type,
    subjectEntityId: init.subjectEntityId ?? null,
    property: init.property ?? null,
    value: init.value ?? null,
  };
}

let actionCounter = 0;

export function createRuleAction(type: RuleActionType, init: Partial<RuleAction> = {}): RuleAction {
  actionCounter += 1;
  return {
    id: init.id ?? `action-${Date.now().toString(36)}-${actionCounter}`,
    type,
    targetEntityId: init.targetEntityId ?? null,
    property: init.property ?? null,
    value: init.value ?? null,
  };
}

let ruleCounter = 0;

export function createRule(init: Partial<Rule> = {}): Rule {
  ruleCounter += 1;
  const suffix = `${Date.now().toString(36)}-${ruleCounter}`;
  return {
    id: init.id ?? `rule-${suffix}`,
    name: init.name ?? 'New rule',
    enabled: init.enabled ?? true,
    once: init.once ?? false,
    event: init.event ?? { type: 'scene-start', sourceEntityId: null, name: null, interval: null },
    conditions: init.conditions ?? [],
    actions: init.actions ?? [],
  };
}

export function createVariable(
  id: string,
  name: string,
  type: VariableType,
  initialValue: BehaviourValue,
): Variable {
  return { id, name, type, initialValue };
}
