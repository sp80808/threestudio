import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultProject,
  createEntity,
  createRule,
  createRuleAction,
  createVariable,
} from '../simulation/schema';
import { createBehaviourInstance } from '../runtime/behaviours';
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
