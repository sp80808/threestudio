import { create } from 'zustand';
import { Project, Entity, createDefaultProject } from '../simulation/schema';
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

  // Actions
  selectEntity: (id: string | null) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (space: 'local' | 'world') => void;
  
  executeCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;

  save: () => Promise<void>;
  load: (id: string) => Promise<void>;
  newProject: () => void;

  // Helpers that wrap executeCommand
  addEntity: (entity: Entity) => void;
  removeEntity: (id: string) => void;
  updateEntityTransform: (id: string, transform: Entity['transform']) => void;
  updateEntityName: (id: string, name: string) => void;
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
      const newProject = command.reverse(state.project);
      return {
        project: newProject,
        historyIndex: state.historyIndex - 1,
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const command = state.history[state.historyIndex + 1];
      const newProject = command.forward(state.project);
      return {
        project: newProject,
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
      forward: (p) => ({ ...p, entities: { ...p.entities, [entity.id]: entity } }),
      reverse: (p) => {
        const newEntities = { ...p.entities };
        delete newEntities[entity.id];
        return { ...p, entities: newEntities };
      }
    });
    get().selectEntity(entity.id);
  },

  removeEntity: (id) => {
    const entity = get().project.entities[id];
    if (!entity) return;
    get().executeCommand({
      forward: (p) => {
        const newEntities = { ...p.entities };
        delete newEntities[id];
        return { ...p, entities: newEntities };
      },
      reverse: (p) => ({ ...p, entities: { ...p.entities, [id]: entity } })
    });
    if (get().selectedEntityId === id) get().selectEntity(null);
  },

  updateEntityTransform: (id, transform) => {
    const entity = get().project.entities[id];
    if (!entity) return;
    const oldTransform = entity.transform;
    get().executeCommand({
      forward: (p) => ({
        ...p,
        entities: {
          ...p.entities,
          [id]: { ...p.entities[id], transform }
        }
      }),
      reverse: (p) => ({
        ...p,
        entities: {
          ...p.entities,
          [id]: { ...p.entities[id], transform: oldTransform }
        }
      })
    });
  },

  updateEntityName: (id, name) => {
      const entity = get().project.entities[id];
      if (!entity) return;
      const oldName = entity.name;
      get().executeCommand({
          forward: (p) => ({
              ...p,
              entities: { ...p.entities, [id]: { ...p.entities[id], name } }
          }),
          reverse: (p) => ({
              ...p,
              entities: { ...p.entities, [id]: { ...p.entities[id], name: oldName } }
          })
      });
  }
}));
