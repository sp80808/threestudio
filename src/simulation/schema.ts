import { z } from 'zod';

export const TransformSchema = z.object({
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]), // Euler angles
  scale: z.tuple([z.number(), z.number(), z.number()]),
});

export const RenderComponentSchema = z.object({
  type: z.literal('render'),
  geometry: z.enum(['box', 'sphere', 'plane', 'cylinder']),
  color: z.string(), // Hex color
});

export const ComponentSchema = z.discriminatedUnion('type', [
  RenderComponentSchema,
  // Later: Light, Camera, Physics...
]);

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  transform: TransformSchema,
  components: z.record(z.string(), ComponentSchema),
});

export const ProjectSchema = z.object({
  id: z.string(),
  version: z.number(),
  name: z.string(),
  entities: z.record(z.string(), EntitySchema),
});

export type Transform = z.infer<typeof TransformSchema>;
export type RenderComponent = z.infer<typeof RenderComponentSchema>;
export type EntityComponent = z.infer<typeof ComponentSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Project = z.infer<typeof ProjectSchema>;

export function createDefaultProject(): Project {
  return {
    id: 'default',
    version: 1,
    name: 'New Project',
    entities: {},
  };
}
