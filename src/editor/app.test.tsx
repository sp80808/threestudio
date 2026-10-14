// @vitest-environment jsdom
import 'fake-indexeddb/auto';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createDefaultProject, createEntity, createVariable, type Project } from '../simulation/schema';
import { db, saveProject } from '../persistence/db';
import { createPlaygroundScene, createPressurePlateDoorScene } from '../simulation/scenarios';
import { createBehaviourInstance } from '../runtime/behaviours';
import PlayHud from '../render/PlayHud';
import { PLAY_EVENTS, usePlayStore } from './playStore';
import Hierarchy from './Hierarchy';
import ProjectBrowser from './ProjectBrowser';
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

/** The clickable row in the hierarchy panel for an object name. */
function rowFor(name: string) {
  return [...container.querySelectorAll('div')].find(
    (element) =>
      element.className.includes('cursor-pointer') && (element.textContent ?? '').includes(name),
  );
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
  usePlayStore.setState({ status: 'stopped', stats: null, variables: [], diagnostics: [], recording: false, recordedFrames: 0 });
  useEditorStore.setState({ library: [], autosave: true, lastAutosaveAt: null });
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

  it('shows a parented object in the hierarchy and lets it be re-attached', () => {
    loadProject(createPressurePlateDoorScene(), 'plate-main');
    mount(panels);

    // The door sign is attached to the door, so the panel shows the attachment.
    expect(text()).toContain('Door sign');
    const attached = [...container.querySelectorAll('select')].find((select) =>
      [...select.options].some((option) => option.value === 'door-main'),
    ) as HTMLSelectElement | undefined;
    expect(attached?.value).toBe(''); // the plate is a root object

    click(rowFor('Door sign') ?? null);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('door-main');
  });

  it('opens the saved-project browser from the toolbar', () => {
    mount(panels);

    const listener = vi.fn();
    window.addEventListener('open-project-browser', listener);
    const projectsButton = [...container.querySelectorAll('button')].find((button) =>
      button.getAttribute('title')?.startsWith('Saved projects'),
    );
    click(projectsButton ?? null);
    window.removeEventListener('open-project-browser', listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('lists saved projects, opens one and saves a copy', async () => {
    await db.documents.clear();
    await db.projects.clear();
    const saved = createPlaygroundScene();
    await saveProject({ ...saved, id: 'library-playground', name: 'Library playground' });
    loadProject(createPressurePlateDoorScene());

    const closed = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
      root.render(<ProjectBrowser onClose={closed} />);
    });

    await act(async () => {
      // Let the panel finish reading the library.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(text()).toContain('Library playground');
    expect(text()).toContain('Saved projects');
    // The open document is marked, and the panel starts on a copy name.
    expect(text()).toContain('open');
    expect(inputValues()).toContain('Pressure Plate Door copy');

    const openButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Open'),
    );
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useEditorStore.getState().project.id).toBe('library-playground');
    expect(closed).toHaveBeenCalled();

    // Saving a copy adds a second document without changing the original.
    const copyInput = findInput('Pressure Plate Door copy');
    setInputValue(copyInput, 'Training level');
    const saveAsButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Save as'),
    );
    await act(async () => {
      saveAsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // IndexedDB round trips are real tasks, not just microtasks.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(useEditorStore.getState().project.name).toBe('Training level');
    expect(useEditorStore.getState().library.map((entry) => entry.name).sort()).toEqual([
      'Library playground',
      'Training level',
    ]);
  });

  it('imports a GLB through the toolbar and reports what it added', async () => {
    // Export a small scene to a real GLB, then feed it to the toolbar as if the
    // author had picked the file themselves.
    const source = new THREE.Scene();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 3),
      new THREE.MeshStandardMaterial({ color: 0x44aa88 }),
    );
    crate.name = 'Crate';
    source.add(crate);
    const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(source, (result) => resolve(result as ArrayBuffer), reject, { binary: true });
    });

    loadProject(createDefaultProject());
    mount(<TopBar />);

    const input = container.querySelector('input[accept*="glb"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File([glb], 'crate.glb', { type: 'model/gltf-binary' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Importing loads the loader module and parses the file, so wait for it.
    await vi.waitFor(() => {
      const names = Object.values(useEditorStore.getState().project.entities).map((entity) => entity.name);
      expect(names).toContain('Crate');
    });
    expect(text()).toContain('Imported 1 mesh as 1 object');
  });

  it('offers record and download controls in play mode', () => {
    const dispatched: string[] = [];
    const listener = (event: Event) => dispatched.push(event.type);
    window.addEventListener(PLAY_EVENTS.record, listener);
    window.addEventListener(PLAY_EVENTS.stopRecording, listener);
    window.addEventListener(PLAY_EVENTS.downloadRecording, listener);

    usePlayStore.setState({ status: 'playing', stats: null, variables: [], diagnostics: [] });
    mount(<PlayHud />);

    const findButton = (label: string) =>
      [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(label));

    click(findButton('Record') ?? null);
    expect(dispatched).toEqual([PLAY_EVENTS.record]);
    expect(text()).not.toContain('120');

    // While recording, the button shows the captured frame count and stops it.
    act(() => {
      usePlayStore.setState({ recording: true, recordedFrames: 42 });
    });
    click(findButton('42') ?? null);
    expect(dispatched).toEqual([PLAY_EVENTS.record, PLAY_EVENTS.stopRecording]);

    // Once a recording exists, it can be downloaded.
    act(() => {
      usePlayStore.setState({ recording: false, recordedFrames: 120 });
    });
    click(findButton('120') ?? null);
    window.removeEventListener(PLAY_EVENTS.record, listener);
    window.removeEventListener(PLAY_EVENTS.stopRecording, listener);
    window.removeEventListener(PLAY_EVENTS.downloadRecording, listener);

    expect(dispatched).toEqual([PLAY_EVENTS.record, PLAY_EVENTS.stopRecording, PLAY_EVENTS.downloadRecording]);
  });

  it('asks the viewport to export a GLB and reports the result', () => {
    mount(panels);

    const listener = vi.fn();
    window.addEventListener('export-glb', listener);
    const button = [...container.querySelectorAll('button')].find((candidate) =>
      candidate.getAttribute('title')?.startsWith('Export the scene as GLB'),
    );
    click(button ?? null);
    window.removeEventListener('export-glb', listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Preparing the GLB export');

    act(() => {
      window.dispatchEvent(new CustomEvent('glb-exported', { detail: { ok: true, name: 'Vault.glb' } }));
    });
    expect(text()).toContain('Exported Vault.glb as GLB');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('glb-exported', { detail: { ok: false, error: 'no WebGL context' } }),
      );
    });
    expect(text()).toContain('GLB export failed: no WebGL context');
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
