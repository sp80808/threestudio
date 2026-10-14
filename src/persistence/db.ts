/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Local-first persistence (IndexedDB via Dexie).
 *
 * Documents are stored as records with metadata so the editor can offer "open
 * recent" and show when a project was last saved, without polluting the project
 * document itself.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Project } from '../simulation/schema';
import { normaliseProject } from './io';

interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  project: Project;
}

const db = new Dexie('AIEngineDB') as Dexie & {
  projects: EntityTable<Project, 'id'>;
  documents: EntityTable<ProjectRecord, 'id'>;
};

// v1 stored raw projects; v2 adds record metadata. Dexie upgrades run on open,
// which is why old projects keep loading after this change.
db.version(1).stores({
  projects: 'id, name',
});

db.version(2)
  .stores({
    projects: 'id, name',
    documents: 'id, updatedAt, name',
  })
  .upgrade(async (transaction) => {
    const legacy = await transaction.table('projects').toArray();
    for (const project of legacy as Project[]) {
      await transaction.table('documents').put({
        id: project.id,
        name: project.name,
        updatedAt: Date.now(),
        project,
      });
    }
  });

export async function saveProject(project: Project): Promise<ProjectRecord> {
  const record: ProjectRecord = {
    id: project.id,
    name: project.name,
    updatedAt: Date.now(),
    project,
  };
  await db.documents.put(record);
  return record;
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const record = await db.documents.get(id);
  if (record) return normaliseProject(record.project);
  const legacy = await db.projects.get(id);
  return legacy ? normaliseProject(legacy) : undefined;
}

export async function listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  const records = await db.documents.orderBy('updatedAt').reverse().toArray();
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
  }));
}

export async function deleteProject(id: string): Promise<void> {
  await db.documents.delete(id);
  await db.projects.delete(id);
}

export { db };
