/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Project library tests.
 *
 * IndexedDB does not exist in Node, so the suite installs `fake-indexeddb`
 * before Dexie is imported — which is exactly how the browser behaves.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, deleteProject, listProjects, loadProject, saveProject } from './db';
import { createPressurePlateDoorScene } from '../simulation/scenarios';
import { createDefaultProject } from '../simulation/schema';

async function clearDatabase() {
  await db.documents.clear();
  await db.projects.clear();
}

beforeEach(async () => {
  await clearDatabase();
});

describe('project store', () => {
  it('round-trips a document through the database', async () => {
    const project = createPressurePlateDoorScene();
    await saveProject(project);

    const loaded = await loadProject(project.id);
    expect(loaded?.name).toBe('Pressure Plate Door');
    expect(Object.keys(loaded?.entities ?? {})).toEqual(Object.keys(project.entities));
    expect(loaded?.entities['door-main'].transform.position).toEqual([0, 1.5, 0]);
  });

  it('lists projects newest first with their metadata', async () => {
    const first = createDefaultProject();
    await saveProject(first);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = { ...createPressurePlateDoorScene(), id: 'second', name: 'Second' };
    await saveProject(second);

    const library = await listProjects();
    expect(library.map((entry) => entry.id)).toEqual(['second', first.id]);
    expect(library[1].name).toBe('New Project');
    expect(typeof library[0].updatedAt).toBe('number');
  });

  it('overwrites a project with the same id instead of duplicating it', async () => {
    const project = createPressurePlateDoorScene();
    await saveProject(project);
    await saveProject({ ...project, name: 'Renamed scene' });

    const library = await listProjects();
    expect(library).toHaveLength(1);
    expect((await loadProject(project.id))?.name).toBe('Renamed scene');
  });

  it('deletes a project', async () => {
    const project = createPressurePlateDoorScene();
    await saveProject(project);
    await deleteProject(project.id);

    expect(await loadProject(project.id)).toBeUndefined();
    expect(await listProjects()).toEqual([]);
  });

  it('still loads documents written by the v1 schema', async () => {
    // v1 wrote raw projects into `projects`; those records must keep working.
    const legacy = { ...createDefaultProject(), id: 'legacy-project', name: 'From v1' };
    await db.projects.put(legacy);

    const loaded = await loadProject('legacy-project');
    expect(loaded?.name).toBe('From v1');
    expect(loaded?.version).toBe(legacy.version);
  });

  it('normalises a document that is missing newer fields', async () => {
    const { settings: _settings, variables: _variables, rules: _rules, ...partial } = createDefaultProject();
    await db.documents.put({
      id: partial.id,
      name: partial.name,
      updatedAt: Date.now(),
      // A record from before variables and settings existed.
      project: partial as never,
    });

    const loaded = await loadProject(partial.id);
    if (!loaded) throw new Error('the record did not load');
    expect(loaded.settings?.stepRate).toBe(60);
    expect(loaded.variables).toEqual({});
    expect(loaded.rules).toEqual([]);
  });
});
