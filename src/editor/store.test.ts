import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultProject,
  createEntity,
  createRule,
  createRuleAction,
  createVariable,
} from '../simulation/schema';
import { createBehaviourInstance } from '../runtime/behaviours';
import { db, loadProject, saveProject } from '../persistence/db';
import { createPlaygroundScene } from '../simulation/scenarios';
import { useEditorStore } from './store';

const reset = () => {
  useEditorStore.setState({
    project: createDefaultProject(),
    selectedEntityId: null,
    past: [],
    future: [],
    dirty: false,
  });
};

describe('Editor Store', () => {
  beforeEach(reset);

  it('adds entities and selects them', () => {
    useEditorStore.getState().addEntity(
      createEntity({ id: 'e1', name: 'Box', geometry: 'box' }),
    );

    const state = useEditorStore.getState();
    expect(state.project.entities.e1.name).toBe('Box');
    expect(state.selectedEntityId).toBe('e1');
    expect(state.dirty).toBe(true);
  });

  it('supports undo and redo across every kind of edit', () => {
    const store = () => useEditorStore.getState();

    store().addEntity(createEntity({ id: 'e1', name: 'Box', geometry: 'box' }));
    store().updateEntityName('e1', 'Crate');
    store().addBehaviour('e1', createBehaviourInstance('spin'));
    store().addRule('e1', createRule({ id: 'r1', name: 'Click', enabled: true }));
    store().addVariable(createVariable('gems', 'Gems', 'number', 0));

    expect(store().project.entities.e1.name).toBe('Crate');
    expect(store().project.entities.e1.behaviours).toHaveLength(1);
    expect(store().project.entities.e1.rules).toHaveLength(1);
    expect(store().project.variables?.gems.name).toBe('Gems');

    store().undo();
    expect(store().project.variables?.gems).toBeUndefined();
    store().undo();
    expect(store().project.entities.e1.rules).toHaveLength(0);
    store().undo();
    expect(store().project.entities.e1.behaviours).toHaveLength(0);
    store().undo();
    expect(store().project.entities.e1.name).toBe('Box');

    store().redo();
    expect(store().project.entities.e1.name).toBe('Crate');
    store().redo();
    expect(store().project.entities.e1.behaviours).toHaveLength(1);
  });

  it('clears the redo stack once a new edit happens', () => {
    const store = () => useEditorStore.getState();
    store().addEntity(createEntity({ id: 'e1', name: 'Box', geometry: 'box' }));
    store().undo();
    expect(store().future).toHaveLength(1);

    store().addEntity(createEntity({ id: 'e2', name: 'Sphere', geometry: 'sphere' }));
    expect(store().future).toHaveLength(0);
  });

  it('reparents children instead of deleting them with their parent', () => {
    const store = () => useEditorStore.getState();
    store().addEntity(createEntity({ id: 'parent', name: 'Parent', geometry: 'box' }));
    store().addEntity(createEntity({ id: 'child', name: 'Child', geometry: 'box', parentId: 'parent' }));

    store().removeEntity('parent');

    expect(store().project.entities.parent).toBeUndefined();
    expect(store().project.entities.child.parentId).toBeNull();
  });

  it('duplicates an entity with fresh behaviour ids', () => {
    const store = () => useEditorStore.getState();
    store().addEntity(
      createEntity({
        id: 'e1',
        name: 'Plate',
        geometry: 'box',
        behaviours: [createBehaviourInstance('pressure-plate')],
      }),
    );

    store().duplicateEntity('e1');

    const entities = Object.values(store().project.entities);
    expect(entities).toHaveLength(2);
    const [original, copy] = entities;
    expect(copy.name).toBe('Plate copy');
    expect(copy.behaviours?.[0].type).toBe('pressure-plate');
    expect(copy.behaviours?.[0].id).not.toBe(original.behaviours?.[0].id);
  });

  it('edits scene-level rules and settings', () => {
    const store = () => useEditorStore.getState();
    const rule = createRule({
      id: 'start',
      name: 'Start',
      actions: [createRuleAction('set-variable', { property: 'won', value: true })],
    });

    store().addRule(null, rule);
    expect(store().project.rules?.[0].id).toBe('start');

    store().updateRule(null, 'start', { name: 'On start' });
    expect(store().project.rules?.[0].name).toBe('On start');

    store().removeRule(null, 'start');
    expect(store().project.rules).toHaveLength(0);

    store().updateSettings({ gravity: -20, stepRate: 30 });
    expect(store().project.settings).toMatchObject({ gravity: -20, stepRate: 30 });
  });

  it('adds primitives as solid objects with a collider', () => {
    useEditorStore.getState().addPrimitive('box');

    const [entity] = Object.values(useEditorStore.getState().project.entities);
    expect(entity.components.render?.geometry).toBe('box');
    expect(entity.components.collider?.size).toEqual([1, 1, 1]);
    expect(entity.transform.position).toEqual([0, 1, 0]);
  });

  it('loads templates as fresh documents', () => {
    const store = () => useEditorStore.getState();
    store().loadTemplate('pressure-plate-door');

    expect(Object.keys(store().project.entities).length).toBeGreaterThan(5);
    expect(store().project.variables?.gems).toBeDefined();

    store().loadTemplate('empty');
    expect(Object.keys(store().project.entities)).toHaveLength(0);
  });
});

describe('parenting', () => {
  it('attaches an object to another and detaches it again', () => {
    const store = useEditorStore.getState();
    store.loadTemplate('pressure-plate-door');

    expect(useEditorStore.getState().setParent('gem-1', 'door-main')).toBe(true);
    expect(useEditorStore.getState().project.entities['gem-1'].parentId).toBe('door-main');

    expect(useEditorStore.getState().setParent('gem-1', null)).toBe(true);
    expect(useEditorStore.getState().project.entities['gem-1'].parentId).toBeNull();
  });

  it('refuses to create a cycle or attach to itself', () => {
    useEditorStore.getState().loadTemplate('pressure-plate-door');

    // door-sign is already attached to door-main.
    expect(useEditorStore.getState().setParent('door-main', 'door-sign')).toBe(false);
    expect(useEditorStore.getState().setParent('door-main', 'door-main')).toBe(false);
    expect(useEditorStore.getState().setParent('door-main', 'nope')).toBe(false);
    expect(useEditorStore.getState().project.entities['door-main'].parentId).toBeNull();
  });

  it('makes attaching an object undoable', () => {
    useEditorStore.getState().loadTemplate('pressure-plate-door');
    useEditorStore.getState().setParent('gem-1', 'door-main');

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().project.entities['gem-1'].parentId).toBeNull();
  });
});

describe('project library', () => {
  beforeEach(async () => {
    await db.documents.clear();
    await db.projects.clear();
    useEditorStore.getState().loadTemplate('pressure-plate-door');
    useEditorStore.setState({ library: [], autosave: true, lastAutosaveAt: null });
    await useEditorStore.getState().refreshLibrary();
  });

  it('saves the open document and lists it', async () => {
    await useEditorStore.getState().save();

    const library = useEditorStore.getState().library;
    expect(library).toHaveLength(1);
    expect(library[0].name).toBe('Pressure Plate Door');
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().lastSavedAt).not.toBeNull();
  });

  it('saves a copy under a new id without touching the original', async () => {
    await useEditorStore.getState().save();
    const originalId = useEditorStore.getState().project.id;

    await useEditorStore.getState().saveAs('Training level');

    const state = useEditorStore.getState();
    expect(state.project.id).not.toBe(originalId);
    expect(state.project.name).toBe('Training level');
    expect(state.past).toEqual([]);
    expect(state.library.map((entry) => entry.name).sort()).toEqual(['Pressure Plate Door', 'Training level']);
    expect(await loadProject(originalId)).toBeDefined();
  });

  it('opens a saved project and clears the dirty flag', async () => {
    const playgroundId = 'saved-playground';
    await saveProject({ ...createPlaygroundScene(), id: playgroundId, name: 'Saved playground' });
    await useEditorStore.getState().refreshLibrary();

    await useEditorStore.getState().openDocument(playgroundId);

    const state = useEditorStore.getState();
    expect(state.project.name).toBe('Saved playground');
    expect(state.selectedEntityId).toBeNull();
    expect(state.dirty).toBe(false);
  });

  it('deletes a saved project', async () => {
    await useEditorStore.getState().save();
    const id = useEditorStore.getState().project.id;

    await useEditorStore.getState().removeDocument(id);

    expect(useEditorStore.getState().library).toEqual([]);
    expect(await loadProject(id)).toBeUndefined();
  });

  it('autosaves only while the document is dirty and autosave is on', async () => {
    useEditorStore.getState().updateEntityName('drone', 'Orb warden');
    expect(useEditorStore.getState().dirty).toBe(true);

    await useEditorStore.getState().autosaveNow();
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().lastAutosaveAt).not.toBeNull();
    expect(await loadProject(useEditorStore.getState().project.id)).toBeDefined();

    // Nothing to write: nothing is written, so the timestamp stays put.
    const stamp = useEditorStore.getState().lastAutosaveAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await useEditorStore.getState().autosaveNow();
    expect(useEditorStore.getState().lastAutosaveAt).toBe(stamp);

    // Switched off, saving is left to the user.
    useEditorStore.getState().updateEntityName('drone', 'Another name');
    useEditorStore.getState().setAutosave(false);
    await useEditorStore.getState().autosaveNow();
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(useEditorStore.getState().lastAutosaveAt).toBe(stamp);
  });
});

describe('project timestamps', () => {
  it('formats recent saves in words and older ones as a date', async () => {
    const { relativeTime } = await import('./ProjectBrowser');
    const now = Date.UTC(2026, 0, 2, 12, 0, 0);
    expect(relativeTime(now - 5_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(now - 5 * 86_400_000, now)).toMatch(/\d/);
  });
});

describe('addEntities', () => {
  beforeEach(() => reset());

  it('adds imported objects as a single undoable edit', () => {
    const imported = [
      createEntity({ id: 'rig', name: 'Rig', position: [1, 0, 0] }),
      createEntity({ id: 'arm', name: 'Arm', parentId: 'rig', geometry: 'box' }),
    ];
    useEditorStore.getState().addEntities(imported);

    expect(Object.keys(useEditorStore.getState().project.entities).sort()).toEqual(['arm', 'rig']);
    expect(useEditorStore.getState().selectedEntityId).toBe('rig');

    useEditorStore.getState().undo();
    expect(Object.keys(useEditorStore.getState().project.entities)).toEqual([]);
  });

  it('renames colliding ids, including the parent links', () => {
    useEditorStore.getState().addEntities([
      createEntity({ id: 'rig', name: 'Rig' }),
      createEntity({ id: 'arm', name: 'Arm', parentId: 'rig' }),
    ]);
    useEditorStore.getState().addEntities([
      createEntity({ id: 'rig', name: 'Rig' }),
      createEntity({ id: 'arm', name: 'Arm', parentId: 'rig' }),
    ]);

    const entities = useEditorStore.getState().project.entities;
    expect(Object.keys(entities).sort()).toEqual(['arm', 'arm-2', 'rig', 'rig-2']);
    // The second rig's child points at the second rig, not the first.
    expect(entities['arm-2'].parentId).toBe('rig-2');
    expect(entities['arm'].parentId).toBe('rig');
  });

  it('does nothing when there is nothing to add', () => {
    const before = useEditorStore.getState().project;
    useEditorStore.getState().addEntities([]);
    expect(useEditorStore.getState().project).toBe(before);
    expect(useEditorStore.getState().past).toEqual([]);
  });
});
