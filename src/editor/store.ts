import { create } from 'zustand';
import { Behaviour, Project, Entity, createDefaultProject } from '../simulation/schema';
import { saveProject, loadProject } from '../persistence/db';

type Command = {
  forward: (state: Project) => Project;
  reverse: (state: Project) => Project;
};

interface EditorState {
  project: Project;
  selectedEntityId: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  transformSpace: 'local' | 'world';
  history: Command[];
  historyIndex: number;

  selectEntity: (id: string | null) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (space: 'local' | 'world') => void;

  executeCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;

  save: () => Promise<void>;
  load: (id: string) => Promise<void>;
  newProject: () => void;

  addEntity: (entity: Entity) => void;
  removeEntity: (id: string) => void;
  updateEntityTransform: (id: string, transform: Entity['transform']) => void;
  updateEntityName: (id: string, name: string) => void;
  addBehaviour: (entityId: string, behaviour: Behaviour) => void;
  updateBehaviour: (entityId: string, behaviourId: string, patch: Partial<Behaviour>) => void;
  removeBehaviour: (entityId: string, behaviourId: string) => void;
}

function setEntity(project: Project, id: string, entity: Entity): Project {
  return {
    ...project,
    entities: {
      ...project.entities,
      [id]: entity,
    },
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: createDefaultProject(),
  selectedEntityId: null,
  transformMode: 'translate',
  transformSpace: 'local',
  history: [],
  historyIndex: -1,

  selectEntity: (id) => set({ selectedEntityId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setTransformSpace: (space) => set({ transformSpace: space }),

  executeCommand: (command) => {
    set((state) => {
      const newProject = command.forward(state.project);
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(command);
      return {
        project: newProject,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex < 0) return state;
      const command = state.history[state.historyIndex];
      return {
        project: command.reverse(state.project),
        historyIndex: state.historyIndex - 1,
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const command = state.history[state.historyIndex + 1];
      return {
        project: command.forward(state.project),
        historyIndex: state.historyIndex + 1,
      };
    });
  },

  save: async () => {
    const { project } = get();
    await saveProject(project);
    console.log('Project saved', project.id);
  },

  load: async (id) => {
    const project = await loadProject(id);
    if (project) {
      set({ project, history: [], historyIndex: -1, selectedEntityId: null });
    }
  },

  newProject: () => {
    set({ project: createDefaultProject(), history: [], historyIndex: -1, selectedEntityId: null });
  },

  addEntity: (entity) => {
    get().executeCommand({
      forward: (project) => setEntity(project, entity.id, entity),
      reverse: (project) => {
        const entities = { ...project.entities };
        delete entities[entity.id];
        return { ...project, entities };
      },
    });
    get().selectEntity(entity.id);
  },

  removeEntity: (id) => {
    const entity = get().project.entities[id];
    if (!entity) return;

    get().executeCommand({
      forward: (project) => {
        const entities = { ...project.entities };
        delete entities[id];
        return { ...project, entities };
      },
      reverse: (project) => setEntity(project, id, entity),
    });

    if (get().selectedEntityId === id) get().selectEntity(null);
  },

  updateEntityTransform: (id, transform) => {
    const entity = get().project.entities[id];
    if (!entity) return;
    const previousTransform = entity.transform;

    get().executeCommand({
      forward: (project) => setEntity(project, id, { ...project.entities[id], transform }),
      reverse: (project) => setEntity(project, id, { ...project.entities[id], transform: previousTransform }),
    });
  },

  updateEntityName: (id, name) => {
    const entity = get().project.entities[id];
    if (!entity) return;
    const previousName = entity.name;

    get().executeCommand({
      forward: (project) => setEntity(project, id, { ...project.entities[id], name }),
      reverse: (project) => setEntity(project, id, { ...project.entities[id], name: previousName }),
    });
  },

  addBehaviour: (entityId, behaviour) => {
    const entity = get().project.entities[entityId];
    if (!entity) return;
    const previous = entity.behaviours ?? [];
    const next = [...previous, behaviour];

    get().executeCommand({
      forward: (project) => setEntity(project, entityId, { ...project.entities[entityId], behaviours: next }),
      reverse: (project) => setEntity(project, entityId, { ...project.entities[entityId], behaviours: previous }),
    });
  },

  updateBehaviour: (entityId, behaviourId, patch) => {
    const entity = get().project.entities[entityId];
    const previousList = entity?.behaviours ?? [];
    const previousBehaviour = previousList.find((behaviour) => behaviour.id === behaviourId);
    if (!entity || !previousBehaviour) return;

    const nextList = previousList.map((behaviour) =>
      behaviour.id === behaviourId ? { ...behaviour, ...patch } : behaviour,
    );

    get().executeCommand({
      forward: (project) => setEntity(project, entityId, { ...project.entities[entityId], behaviours: nextList }),
      reverse: (project) => setEntity(project, entityId, { ...project.entities[entityId], behaviours: previousList }),
    });
  },

  removeBehaviour: (entityId, behaviourId) => {
    const entity = get().project.entities[entityId];
    if (!entity) return;
    const previous = entity.behaviours ?? [];
    const next = previous.filter((behaviour) => behaviour.id !== behaviourId);

    get().executeCommand({
      forward: (project) => setEntity(project, entityId, { ...project.entities[entityId], behaviours: next }),
      reverse: (project) => setEntity(project, entityId, { ...project.entities[entityId], behaviours: previous }),
    });
  },
}));
