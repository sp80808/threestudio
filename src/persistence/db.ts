import Dexie, { type EntityTable } from 'dexie';
import type { Project } from '../simulation/schema';

const db = new Dexie('AIEngineDB') as Dexie & {
  projects: EntityTable<Project, 'id'>;
};

db.version(1).stores({
  projects: 'id, name' // Primary key and indexed props
});

export async function saveProject(project: Project) {
  await db.projects.put(project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return await db.projects.get(id);
}

export { db };
