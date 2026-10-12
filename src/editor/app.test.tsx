// @vitest-environment jsdom
/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Mount tests for the editor panels.
 *
 * The viewport is deliberately not mounted (it needs a WebGL context); these
 * tests exercise the authoring UI against the real store: hierarchy selection,
 * the inspector, behaviour/rule/variable panels and the toolbar. They catch the
 * class of bug where a document shape the panels do not expect crashes the editor
 * on open, and they check that editing through the UI reaches the store.
 */

import { act } from 'react';
import { type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProject, createEntity, createVariable, type Project } from '../simulation/schema';
import { createPlaygroundScene, createPressurePlateDoorScene } from '../simulation/scenarios';
import { createBehaviourInstance } from '../runtime/behaviours';
import Hierarchy from './Hierarchy';
import Inspector from './Inspector';
import StatusBar from './StatusBar';
import TopBar from './TopBar';
import { useEditorStore } from './store';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;

function loadProject(project: Project, selectedEntityId: string | null = null) {
  useEditorStore.setState({
    project,
    selectedEntityId,
    past: [],
    future: [],
    dirty: false,
    lastSavedAt: null,
    transformMode: 'translate',
    transformSpace: 'local',
  });
}

function mount(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<>{node}</>);
  });
}

const panels = (
  <>
    <TopBar />
    <Hierarchy />
    <Inspector />
    <StatusBar />
  </>
);

const text = () => container.textContent ?? '';

function click(element: Element | null) {
  if (!element) throw new Error('Nothing to click');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Text inputs hold their value in the DOM property, not in `textContent`. */
const inputValues = () =>
  [...container.querySelectorAll('input')].map((input) => (input as HTMLInputElement).value);

const findInput = (value: string) =>
  [...container.querySelectorAll('input')].find(
    (input) => (input as HTMLInputElement).value === value,
  ) as HTMLInputElement | undefined;

function setInputValue(input: HTMLInputElement | undefined, value: string) {
  if (!input) throw new Error(`No input with value "${value}"`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  loadProject(createPressurePlateDoorScene());
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('editor panels', () => {
  it('lists the scene and shows scene settings when nothing is selected', () => {
    mount(panels);

    expect(text()).toContain('Hierarchy');
    expect(text()).toContain('Player');
    expect(text()).toContain('Pressure plate');
    expect(text()).toContain('Scene settings');
    expect(text()).toContain('Scene rules');
    // Variable cards show the name and starting value in inputs.
    expect(inputValues()).toEqual(expect.arrayContaining(['Gems', 'All gems found']));
  });

  it('shows the inspector for the clicked object', () => {
    mount(panels);

    const row = [...container.querySelectorAll('div')].find(
      (element) => element.textContent?.startsWith('Pressure plate') && element.children.length > 0,
    );
    click(row ?? null);

    expect(useEditorStore.getState().selectedEntityId).toBe('plate-main');
    expect(text()).toContain('Transform');
    expect(text()).toContain('Collision');
    expect(text()).toContain('Pressure Plate');
    expect(text()).toContain('Rules for this object');
  });

  it('adds a behaviour through the inspector and registers it in the store', () => {
    loadProject(createPressurePlateDoorScene(), 'gem-1');
    mount(panels);

    const spinButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Spin'),
    );
    const before = useEditorStore.getState().project.entities['gem-1'].behaviours?.length ?? 0;
    click(spinButton ?? null);

    const after = useEditorStore.getState().project.entities['gem-1'].behaviours?.length ?? 0;
    expect(after).toBe(before + 1);
    expect(text()).toContain('Spin');
  });

  it('renames an object from the inspector', () => {
    loadProject(createPressurePlateDoorScene(), 'door-main');
    mount(panels);

    setInputValue(findInput('Door'), 'Vault door');

    expect(useEditorStore.getState().project.entities['door-main'].name).toBe('Vault door');
  });

  it('renders the playground scene and its variables', () => {
    // Variables live in the scene panel, which is what shows with nothing selected.
    loadProject(createPlaygroundScene());
    mount(panels);

    expect(text()).toContain('Click me');
    expect(inputValues()).toEqual(expect.arrayContaining(['Clicks', 'Last clicked']));
  });

  it('handles an empty project', () => {
    loadProject(createDefaultProject());
    mount(panels);

    expect(text()).toContain('This scene is empty.');
    expect(text()).toContain('No variables yet.');
    expect(text()).toContain('Not saved yet');
  });

  it('survives behaviours it does not know about (project from a newer build)', () => {
    const futureProject = createDefaultProject();
    const entity = createEntity({ id: 'future', name: 'Future object', geometry: 'box' });
    entity.behaviours = [
      { id: 'x', type: 'quantum-teleport', label: 'Quantum teleport', enabled: true, parameters: { range: 3 } },
      createBehaviourInstance('spin'),
    ];
    futureProject.entities[entity.id] = entity;
    futureProject.variables = { score: createVariable('score', 'Score', 'number', 0) };
    loadProject(futureProject, 'future');

    mount(panels);

    expect(text()).toContain('Future object');
    // The registry-driven panel shows the unknown behaviour but offers no fields.
    expect(text()).toContain('quantum-teleport');
    expect(text()).toContain('Spin');
  });

  it('reflects the dirty flag in the toolbar and status bar', () => {
    mount(panels);
    expect(text()).toContain('Not saved yet');
    expect(text()).toContain('● Saved');

    act(() => {
      useEditorStore.getState().updateEntityName('drone', 'Orb');
    });

    expect(text()).toContain('Unsaved changes');
    expect(text()).toContain('● Unsaved');
  });
});
