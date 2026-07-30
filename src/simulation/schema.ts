import { z } from 'zod';

export const TransformSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()]),
});

export const RenderComponentSchema = z.object({
  type: z.literal('render'),
  geometry: z.enum(['box', 'sphere', 'plane', 'cylinder']),
  color: z.string(),
});

export const PhysicsComponentSchema = z.object({
  type: z.literal('physics'),
  bodyType: z.enum(['fixed', 'dynamic', 'kinematic-position']),
  collider: z.literal('box'),
  sensor: z.boolean(),
});

export const ComponentSchema = z.discriminatedUnion('type', [
  RenderComponentSchema,
  PhysicsComponentSchema,
]);

export const BehaviourValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const BehaviourSchema = z.object({
  id: z.string(),
  type: z.enum(['spin', 'bob', 'door', 'pressure-plate']),
  label: z.string(),
  enabled: z.boolean(),
  parameters: z.record(z.string(), BehaviourValueSchema),
});

export const RuleConditionSchema = z.object({
  id: z.string(),
  type: z.enum(['variable-equals', 'distance-less-than', 'entity-enabled']),
  subjectEntityId: z.string().nullable(),
  property: z.string().nullable(),
  value: BehaviourValueSchema,
});

export const RuleActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'set-enabled',
    'set-visible',
    'set-variable',
    'emit-event',
    'open-door',
    'close-door',
  ]),
  targetEntityId: z.string().nullable(),
  property: z.string().nullable(),
  value: BehaviourValueSchema,
});

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  event: z.object({
    type: z.enum(['scene-start', 'pointer-click', 'trigger-enter', 'trigger-exit']),
    sourceEntityId: z.string().nullable(),
  }),
  conditions: z.array(RuleConditionSchema),
  actions: z.array(RuleActionSchema),
});

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  transform: TransformSchema,
  components: z.record(z.string(), ComponentSchema),
  behaviours: z.array(BehaviourSchema).optional(),
  rules: z.array(RuleSchema).optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  version: z.number(),
  name: z.string(),
  entities: z.record(z.string(), EntitySchema),
});

export type Transform = z.infer<typeof TransformSchema>;
export type RenderComponent = z.infer<typeof RenderComponentSchema>;
export type PhysicsComponent = z.infer<typeof PhysicsComponentSchema>;
export type EntityComponent = z.infer<typeof ComponentSchema>;
export type BehaviourValue = z.infer<typeof BehaviourValueSchema>;
export type Behaviour = z.infer<typeof BehaviourSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Project = z.infer<typeof ProjectSchema>;

export function createDefaultProject(): Project {
  return {
    id: 'default',
    version: 2,
    name: 'New Project',
    entities: {},
  };
}
