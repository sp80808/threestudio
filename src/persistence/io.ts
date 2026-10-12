/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Document import/export and version migration.
 *
 * Everything that crosses the application boundary (files, clipboard, IndexedDB
 * records written by an older build) goes through `parseProject`, so a malformed
 * or outdated document can never reach the runtime.
 */

import {
  DOCUMENT_VERSION,
  DEFAULT_PROJECT_SETTINGS,
  ProjectSchema,
  type Entity,
  type Project,
} from '../simulation/schema';

export type ParseResult =
  | { ok: true; project: Project; migratedFrom: number | null }
  | { ok: false; error: string };

export function serializeProject(project: Project, options: { pretty?: boolean } = {}): string {
  return JSON.stringify(project, null, options.pretty ? 2 : undefined);
}

/**
 * Migrates a raw document to the current version.
 *
 * v1 documents predate game variables, scene rules and project settings, so the
 * defaults are filled in rather than failing validation.
 */
export function migrateDocument(raw: unknown): { document: unknown; migratedFrom: number | null } {
  if (typeof raw !== 'object' || raw === null) {
    return { document: raw, migratedFrom: null };
  }

  const source = raw as Record<string, unknown>;
  const version = typeof source.version === 'number' ? source.version : 1;
  if (version >= DOCUMENT_VERSION) return { document: raw, migratedFrom: null };

  const document: Record<string, unknown> = { ...source, version: DOCUMENT_VERSION };
  document.variables ??= {};
  document.rules ??= [];
  document.settings ??= { ...DEFAULT_PROJECT_SETTINGS };

  // v1 stored components either as a list or as a keyed object; normalise both.
  if (typeof document.entities === 'object' && document.entities !== null) {
    const entities: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(document.entities as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const entity = { ...(value as Record<string, unknown>) };
      if (Array.isArray(entity.components)) {
        const keyed: Record<string, unknown> = {};
        for (const component of entity.components as Record<string, unknown>[]) {
          if (component && typeof component.type === 'string') keyed[component.type] = component;
        }
        entity.components = keyed;
      }
      entity.components ??= {};
      entity.behaviours ??= [];
      entity.rules ??= [];
      entities[id] = entity;
    }
    document.entities = entities;
  }

  return { document, migratedFrom: version };
}

export function parseProject(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `That file is not valid JSON (${(error as Error).message})` };
  }

  const { document, migratedFrom } = migrateDocument(raw);
  const result = ProjectSchema.safeParse(document);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      error: `Invalid project document: ${first?.path.join('.') || '(root)'} ${first?.message ?? ''}`.trim(),
    };
  }

  return { ok: true, project: normaliseProject(result.data), migratedFrom };
}

/** Fills in optional collections so the rest of the app never checks for them. */
export function normaliseProject(project: Project): Project {
  const entities: Record<string, Entity> = {};
  for (const [id, entity] of Object.entries(project.entities)) {
    entities[id] = {
      ...entity,
      components: entity.components ?? {},
      behaviours: entity.behaviours ?? [],
      rules: entity.rules ?? [],
    };
  }

  return {
    ...project,
    version: DOCUMENT_VERSION,
    entities,
    variables: project.variables ?? {},
    rules: project.rules ?? [],
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...(project.settings ?? {}) },
  };
}

/** Trims a project down to something shareable in a chat message or issue. */
export function summariseProject(project: Project): string {
  const entities = Object.values(project.entities);
  const behaviours = entities.reduce((total, entity) => total + (entity.behaviours?.length ?? 0), 0);
  const rules =
    (project.rules?.length ?? 0) +
    entities.reduce((total, entity) => total + (entity.rules?.length ?? 0), 0);

  return [
    `${project.name}`,
    `${entities.length} objects`,
    `${behaviours} behaviours`,
    `${rules} rules`,
    `${Object.keys(project.variables ?? {}).length} variables`,
  ].join(' · ');
}
