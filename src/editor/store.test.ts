import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './store';

describe('Editor Store', () => {
  beforeEach(() => {
    useEditorStore.setState({
      project: { id: 'default', version: 1, name: 'New Project', entities: {} },
      history: [],
      historyIndex: -1,
      selectedEntityId: null,
    });
  });

  it('mutates project state by adding an entity', () => {
    const store = useEditorStore.getState();
    store.addEntity({
      id: 'e1',
      name: 'Box',
      parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: {}
    });

    const updatedState = useEditorStore.getState();
    expect(updatedState.project.entities['e1']).toBeDefined();
    expect(updatedState.project.entities['e1'].name).toBe('Box');
    expect(updatedState.selectedEntityId).toBe('e1');
  });

  it('supports undo and redo', () => {
    const store = useEditorStore.getState();
    
    store.addEntity({
      id: 'e1',
      name: 'Box',
      parentId: null,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: {}
    });

    let state = useEditorStore.getState();
    expect(state.project.entities['e1']).toBeDefined();

    state.undo();
    state = useEditorStore.getState();
    expect(state.project.entities['e1']).toBeUndefined();

    state.redo();
    state = useEditorStore.getState();
    expect(state.project.entities['e1']).toBeDefined();
  });
});
