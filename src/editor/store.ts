/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Editor state.
 *
 * The document (`Project`) is the single source of truth; Three.js objects are
 * only a view of it (see `docs/DECISIONS.md`). Undo/redo uses capped document
 * snapshots: transforms are committed once per drag, so snapshots stay cheap and
 * every edit — entity, behaviour, rule, variable or setting — is undoable with
 * no per-action bookkeeping.
 */

import { create } from 'zustand';
import {
  DEFAULT_PROJECT_SETTINGS,
  createDefaultProject,
  createEntity,
  type Behaviour,
  type Entity,
  type EntityComponent,
  type GeometryKind,
  type Project,
  type ProjectSettings,
  type Rule,
  type Variable,
} from '../simulation/schema';
import { createPressurePlateDoorScene, createSceneTemplate } from '../simulation/scenarios';
import { deleteProject, listProjects, loadProject, saveProject } from '../persistence/db';

const HISTORY_LIMIT = 80;

export type TransformMode = 'translate' | 'rotate' | 'scale';

/** A saved project as the library lists it (no document payload). */
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}
export type TransformSpace = 'local' | 'world';

interface EditorState {
  project: Project;
  selectedEntityId: string | null;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
  /** Undo stack (oldest first) and redo stack (newest last). */
  past: Project[];
  future: Project[];
  dirty: boolean;
  lastSavedAt: number | null;
  /** Saved projects in this browser, newest first. */
  library: ProjectSummary[];
  /** Saves the document automatically a moment after editing stops. */
  autosave: boolean;
  lastAutosaveAt: number | null;

  selectEntity: (id: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setTransformSpace: (space: TransformSpace) => void;

  replaceProject: (project: Project, options?: { dirty?: boolean }) => void;
  newProject: () => void;
  loadTemplate: (id: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  addEntity: (entity: Entity) => void;
  addPrimitive: (
    geometry: GeometryKind,
    options?: { name?: string; color?: string; collider?: boolean; position?: [number, number, number] },
  ) => void;
  removeEntity: (id: string) => void;
  /**
   * Adds several objects as one undoable edit (used by the model importer).
   *
   * Imported ids are namespaced so importing the same file twice does not
   * overwrite the first copy.
   */
  addEntities: (entities: Entity[], options?: { select?: string | null }) => void;
  duplicateEntity: (id: string) => void;
  updateEntityTransform: (id: string, transform: Entity['transform']) => void;
  updateEntityName: (id: string, name: string) => void;
  updateEntityComponent: (id: string, component: EntityComponent) => void;
  removeEntityComponent: (id: string, type: EntityComponent['type']) => void;
  setEntityEnabled: (id: string, enabled: boolean) => void;
  /**
   * Attaches an object to another one (or detaches it with `null`).
   *
   * Returns false when the move would create a cycle — an object cannot be its
   * own ancestor — so callers can tell the user why nothing happened.
   */
  setParent: (id: string, parentId: string | null) => boolean;

  addBehaviour: (entityId: string, behaviour: Behaviour) => void;
  updateBehaviour: (entityId: string, behaviourId: string, patch: Partial<Behaviour>) => void;
  removeBehaviour: (entityId: string, behaviourId: string) => void;

  addRule: (entityId: string | null, rule: Rule) => void;
  updateRule: (entityId: string | null, ruleId: string, patch: Partial<Rule>) => void;
  removeRule: (entityId: string | null, ruleId: string) => void;

  addVariable: (variable: Variable) => void;
  updateVariable: (id: string, patch: Partial<Variable>) => void;
  removeVariable: (id: string) => void;

  undo: () => void;
  redo: () => void;

  save: () => Promise<void>;
  load: (id: string) => Promise<void>;

  /** Re-reads the list of saved projects. */
  refreshLibrary: () => Promise<void>;
  /** Saves the current document under a new name/id and opens it. */
  saveAs: (name: string) => Promise<void>;
  /** Loads a saved project by id (an alias of `load` that also refreshes). */
  openDocument: (id: string) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  setAutosave: (enabled: boolean) => void;
  /** Called by the autosave timer; a no-op when nothing changed. */
  autosaveNow: () => Promise<void>;
}

type Commit = (mutate: (project: Project) => Project) => void;

function withEntity(project: Project, id: string, entity: Entity): Project {
  return { ...project, entities: { ...project.entities, [id]: entity } };
}

function patchEntity(project: Project, id: string, patch: Partial<Entity>): Project {
  const entity = project.entities[id];
  if (!entity) return project;
  return withEntity(project, id, { ...entity, ...patch });
}

export const useEditorStore = create<EditorState>((set, get) => {
  const commit: Commit = (mutate) => {
    set((state) => {
      const next = mutate(state.project);
      if (next === state.project) return state;
      return {
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    });
  };

  return {
    // The editor opens on the tutorial scene so the viewport is never empty.
    project: createPressurePlateDoorScene(),
    selectedEntityId: null,
    transformMode: 'translate',
    transformSpace: 'local',
    past: [],
    future: [],
    library: [],
    autosave: true,
    lastAutosaveAt: null,
    dirty: false,
    lastSavedAt: null,

    selectEntity: (id) => set({ selectedEntityId: id }),
    setTransformMode: (mode) => set({ transformMode: mode }),
    setTransformSpace: (space) => set({ transformSpace: space }),

    replaceProject: (project) =>
      set({
        project,
        selectedEntityId: null,
        past: [...get().past, get().project].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      }),

    newProject: () =>
      set({
        project: createDefaultProject(),
        selectedEntityId: null,
        past: [...get().past, get().project].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      }),

    loadTemplate: (id) =>
      set({
        project: id === 'empty' ? createDefaultProject() : createSceneTemplate(id),
        selectedEntityId: null,
        past: [...get().past, get().project].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      }),

    updateSettings: (patch) =>
      commit((project) => ({
        ...project,
        settings: { ...DEFAULT_PROJECT_SETTINGS, ...(project.settings ?? {}), ...patch },
      })),

    addEntity: (entity) => {
      commit((project) => withEntity(project, entity.id, entity));
      get().selectEntity(entity.id);
    },

    addPrimitive: (geometry, options) => {
      const entity = createEntity({
        geometry,
        name: options?.name ?? `New ${geometry}`,
        color: options?.color,
        position: options?.position ?? [0, 1, 0],
        // Objects are solid by default: beginners expect the things they place to
        // be walkable-around, and the inspector can turn this off in one click.
        collider:
          options?.collider === false
            ? undefined
            : { size: geometry === 'plane' ? [4, 0.4, 4] : [1, 1, 1] },
      });
      get().addEntity(entity);
    },

    removeEntity: (id) => {
      const project = get().project;
      if (!project.entities[id]) return;

      commit((current) => {
        const entities = { ...current.entities };
        delete entities[id];
        // Children are reparented rather than deleted with their parent.
        for (const key of Object.keys(entities)) {
          if (entities[key].parentId === id) {
            entities[key] = { ...entities[key], parentId: null };
          }
        }
        return { ...current, entities };
      });

      if (get().selectedEntityId === id) get().selectEntity(null);
    },

    addEntities: (incoming, options) => {
      if (incoming.length === 0) return;

      const taken = new Set(Object.keys(get().project.entities));
      const renamed = new Map<string, string>();
      const unique = incoming.map((entity) => {
        let id = entity.id;
        let suffix = 2;
        while (taken.has(id)) {
          id = `${entity.id}-${suffix}`;
          suffix += 1;
        }
        taken.add(id);
        if (id !== entity.id) renamed.set(entity.id, id);
        return id === entity.id ? entity : { ...entity, id };
      });

      // References between the new objects (parent links) follow the new ids.
      const entities = unique.map((entity) =>
        entity.parentId && renamed.has(entity.parentId)
          ? { ...entity, parentId: renamed.get(entity.parentId) as string }
          : entity,
      );

      commit((project) => ({
        ...project,
        entities: {
          ...project.entities,
          ...Object.fromEntries(entities.map((entity) => [entity.id, entity])),
        },
      }));

      const select = options?.select === undefined ? entities[0].id : options.select;
      if (select) get().selectEntity(select);
    },

    duplicateEntity: (id) => {
      const project = get().project;
      const entity = project.entities[id];
      if (!entity) return;

      const copy = createEntity({
        name: `${entity.name} copy`,
        geometry: entity.components.render?.geometry,
        color: entity.components.render?.color,
        visible: entity.components.render?.visible,
        position: [entity.transform.position[0] + 1, entity.transform.position[1], entity.transform.position[2]],
        rotation: entity.transform.rotation,
        scale: entity.transform.scale,
        collider: entity.components.collider
          ? {
              shape: entity.components.collider.shape,
              size: entity.components.collider.size,
              isTrigger: entity.components.collider.isTrigger,
            }
          : undefined,
        enabled: entity.enabled,
        tags: entity.tags,
      });
      copy.behaviours = entity.behaviours?.map((behaviour) => ({
        ...behaviour,
        id: `${behaviour.type}-copy-${Math.random().toString(36).slice(2, 8)}`,
      }));
      copy.rules = entity.rules;
      get().addEntity(copy);
    },

    updateEntityTransform: (id, transform) => commit((project) => patchEntity(project, id, { transform })),

    updateEntityName: (id, name) => commit((project) => patchEntity(project, id, { name })),

    updateEntityComponent: (id, component) =>
      commit((project) => {
        const entity = project.entities[id];
        if (!entity) return project;
        return withEntity(project, id, {
          ...entity,
          components: { ...entity.components, [component.type]: component },
        });
      }),

    removeEntityComponent: (id, type) =>
      commit((project) => {
        const entity = project.entities[id];
        if (!entity) return project;
        const components = { ...entity.components };
        delete components[type];
        return withEntity(project, id, { ...entity, components });
      }),

    setEntityEnabled: (id, enabled) => commit((project) => patchEntity(project, id, { enabled })),

    setParent: (id, parentId) => {
      const project = get().project;
      const entity = project.entities[id];
      if (!entity) return false;
      if (parentId === id) return false;
      if (parentId && !project.entities[parentId]) return false;

      // Walking up from the new parent must never reach the object itself.
      let cursor = parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === id || seen.has(cursor)) return false;
        seen.add(cursor);
        cursor = project.entities[cursor]?.parentId ?? null;
      }

      commit((current) => patchEntity(current, id, { parentId }));
      return true;
    },

    addBehaviour: (entityId, behaviour) =>
      commit((project) => {
        const entity = project.entities[entityId];
        if (!entity) return project;
        return withEntity(project, entityId, {
          ...entity,
          behaviours: [...(entity.behaviours ?? []), behaviour],
        });
      }),

    updateBehaviour: (entityId, behaviourId, patch) =>
      commit((project) => {
        const entity = project.entities[entityId];
        if (!entity) return project;
        return withEntity(project, entityId, {
          ...entity,
          behaviours: (entity.behaviours ?? []).map((behaviour) =>
            behaviour.id === behaviourId ? { ...behaviour, ...patch } : behaviour,
          ),
        });
      }),

    removeBehaviour: (entityId, behaviourId) =>
      commit((project) => {
        const entity = project.entities[entityId];
        if (!entity) return project;
        return withEntity(project, entityId, {
          ...entity,
          behaviours: (entity.behaviours ?? []).filter((behaviour) => behaviour.id !== behaviourId),
        });
      }),

    addRule: (entityId, rule) =>
      commit((project) => {
        if (!entityId) return { ...project, rules: [...(project.rules ?? []), rule] };
        const entity = project.entities[entityId];
        if (!entity) return project;
        return withEntity(project, entityId, { ...entity, rules: [...(entity.rules ?? []), rule] });
      }),

    updateRule: (entityId, ruleId, patch) =>
      commit((project) => {
        const apply = (rules: Rule[] | undefined) =>
          (rules ?? []).map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule));

        if (!entityId) return { ...project, rules: apply(project.rules) };
        const entity = project.entities[entityId];
        if (!entity) return project;
        return withEntity(project, entityId, { ...entity, rules: apply(entity.rules) });
      }),

    removeRule: (entityId, ruleId) =>
      commit((project) => {
        const remove = (rules: Rule[] | undefined) => (rules ?? []).filter((rule) => rule.id !== ruleId);
        if (!entityId) return { ...project, rules: remove(project.rules) };
        const entity = project.entities[entityId];
        if (!entity) return project;
        return withEntity(project, entityId, { ...entity, rules: remove(entity.rules) });
      }),

    addVariable: (variable) =>
      commit((project) => ({
        ...project,
        variables: { ...project.variables, [variable.id]: variable },
      })),

    updateVariable: (id, patch) =>
      commit((project) => {
        const variable = project.variables?.[id];
        if (!variable) return project;
        return { ...project, variables: { ...project.variables, [id]: { ...variable, ...patch } } };
      }),

    removeVariable: (id) =>
      commit((project) => {
        if (!project.variables?.[id]) return project;
        const variables = { ...project.variables };
        delete variables[id];
        return { ...project, variables };
      }),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        return {
          project: previous,
          past: state.past.slice(0, -1),
          future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
          dirty: true,
          selectedEntityId:
            state.selectedEntityId && previous.entities[state.selectedEntityId]
              ? state.selectedEntityId
              : null,
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) return state;
        const [next, ...rest] = state.future;
        return {
          project: next,
          past: [...state.past, state.project].slice(-HISTORY_LIMIT),
          future: rest,
          dirty: true,
        };
      }),

    save: async () => {
      const { project } = get();
      await saveProject(project);
      set({ dirty: false, lastSavedAt: Date.now() });
      await get().refreshLibrary();
    },

    load: async (id) => {
      const project = await loadProject(id);
      if (!project) return;
      set({
        project,
        past: [],
        future: [],
        selectedEntityId: null,
        dirty: false,
        lastSavedAt: Date.now(),
      });
      await get().refreshLibrary();
    },

    refreshLibrary: async () => {
      try {
        set({ library: await listProjects() });
      } catch (error) {
        // Private-mode browsers can refuse IndexedDB; the editor keeps working,
        // it just cannot list what was saved.
        console.warn('Could not read the project library', error);
        set({ library: [] });
      }
    },

    saveAs: async (name) => {
      const current = get().project;
      const project: Project = {
        ...current,
        id: createProjectId(),
        name: name.trim() || current.name || 'Untitled project',
      };
      await saveProject(project);
      set({
        project,
        dirty: false,
        lastSavedAt: Date.now(),
        // A new document is a new branch of history, not a redo of the old one.
        past: [],
        future: [],
      });
      await get().refreshLibrary();
    },

    openDocument: async (id) => {
      await get().load(id);
    },

    removeDocument: async (id) => {
      await deleteProject(id);
      await get().refreshLibrary();
    },

    setAutosave: (enabled) => set({ autosave: enabled }),

    autosaveNow: async () => {
      const { dirty, autosave, project } = get();
      if (!dirty || !autosave) return;
      await saveProject(project);
      set({ dirty: false, lastSavedAt: Date.now(), lastAutosaveAt: Date.now() });
      await get().refreshLibrary();
    },
  };
});

/** Id for a newly forked document. */
function createProjectId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `project-${uuid.slice(0, 8)}`;
}

export function selectSelectedEntity(state: EditorState): Entity | null {
  return state.selectedEntityId ? state.project.entities[state.selectedEntityId] ?? null : null;
}

export function selectCanUndo(state: EditorState): boolean {
  return state.past.length > 0;
}

export function selectCanRedo(state: EditorState): boolean {
  return state.future.length > 0;
}
