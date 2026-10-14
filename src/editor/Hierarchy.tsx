/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Scene hierarchy: search, select, hide, duplicate and delete objects.
 */

import { Copy, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Entity } from '../simulation/schema';
import { useEditorStore } from './store';
import { cn } from '../lib/utils';
import { IconButton } from './fields';

const INDENT_PX = 12;

/**
 * Depth of an object in the parent chain.
 *
 * A cycle stops the walk, so a broken document cannot hang the panel — the
 * runtime reports the same problem as a diagnostic.
 */
function depthOf(entity: Entity, entities: Record<string, Entity>): number {
  let depth = 0;
  let cursor = entity.parentId ?? null;
  const seen = new Set<string>([entity.id]);
  while (cursor) {
    if (seen.has(cursor) || !entities[cursor]) break;
    seen.add(cursor);
    depth += 1;
    cursor = entities[cursor].parentId ?? null;
  }
  return depth;
}

/**
 * Parents before children, so the list reads like the scene graph.
 *
 * Objects whose parent is missing become roots, matching the runtime.
 */
function orderByHierarchy(entities: Entity[], all: Record<string, Entity>): Entity[] {
  const childrenOf = new Map<string | null, Entity[]>();
  for (const entity of entities) {
    const parentId = entity.parentId && all[entity.parentId] ? entity.parentId : null;
    const list = childrenOf.get(parentId);
    if (list) list.push(entity);
    else childrenOf.set(parentId, [entity]);
  }

  const ordered: Entity[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null) => {
    for (const entity of childrenOf.get(parentId) ?? []) {
      // A cycle in the document simply stops descending.
      if (visited.has(entity.id)) continue;
      visited.add(entity.id);
      ordered.push(entity);
      visit(entity.id);
    }
  };
  visit(null);
  for (const entity of entities) if (!visited.has(entity.id)) ordered.push(entity);
  return ordered;
}

export default function Hierarchy() {
  const project = useEditorStore((state) => state.project);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const duplicateEntity = useEditorStore((state) => state.duplicateEntity);
  const setEntityEnabled = useEditorStore((state) => state.setEntityEnabled);
  const [query, setQuery] = useState('');

  const entities = Object.values(project.entities);
  const matched = query
    ? entities.filter((entity) => entity.name.toLowerCase().includes(query.toLowerCase()))
    : entities;
  const filtered = orderByHierarchy(matched, project.entities);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-300">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider">Hierarchy</span>
          <span className="text-[10px] text-zinc-600">{entities.length} objects</span>
        </div>
        <div className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2">
          <Search size={12} className="text-zinc-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search objects"
            className="w-full bg-transparent py-1 text-xs outline-none placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[11px] italic text-zinc-600">
            {entities.length === 0 ? 'This scene is empty. Add a primitive to begin.' : 'No matches.'}
          </div>
        ) : (
          filtered.map((entity) => {
            const selected = selectedEntityId === entity.id;
            const hidden = entity.components.render?.visible === false;
            const disabled = entity.enabled === false;
            const behaviourCount = entity.behaviours?.length ?? 0;
            const ruleCount = entity.rules?.length ?? 0;
            // Search results keep their depth so the tree stays readable.
            const depth = depthOf(entity, project.entities);
            const parent = entity.parentId ? project.entities[entity.parentId] : undefined;

            return (
              <div
                key={entity.id}
                onClick={() => selectEntity(entity.id)}
                onDoubleClick={() => window.dispatchEvent(new CustomEvent('focus-selected'))}
                style={{ paddingLeft: 8 + depth * INDENT_PX }}
                title={parent ? `Attached to ${parent.name}` : 'Root object'}
                className={cn(
                  'group flex cursor-pointer items-center gap-1.5 py-1.5 pr-2 text-xs select-none',
                  selected ? 'bg-blue-600 text-white' : 'hover:bg-zinc-800',
                  disabled && !selected && 'opacity-45',
                )}
              >
                {depth > 0 ? (
                  <span
                    className={cn('shrink-0 font-mono text-[10px]', selected ? 'text-blue-200' : 'text-zinc-600')}
                    aria-hidden
                  >
                    ↳
                  </span>
                ) : null}
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-sm',
                    entity.components.collider
                      ? entity.components.collider.isTrigger
                        ? 'bg-amber-400'
                        : 'bg-sky-400'
                      : 'bg-zinc-600',
                  )}
                  title={entity.components.collider ? 'Has collision' : 'No collision'}
                />
                <span className="min-w-0 flex-1 truncate">{entity.name}</span>

                {behaviourCount > 0 ? (
                  <span
                    className={cn(
                      'rounded px-1 font-mono text-[9px]',
                      selected ? 'bg-blue-800/60 text-blue-100' : 'bg-zinc-800 text-zinc-400',
                    )}
                    title={`${behaviourCount} behaviours`}
                  >
                    b{behaviourCount}
                  </span>
                ) : null}
                {ruleCount > 0 ? (
                  <span
                    className={cn(
                      'rounded px-1 font-mono text-[9px]',
                      selected ? 'bg-blue-800/60 text-blue-100' : 'bg-zinc-800 text-zinc-400',
                    )}
                    title={`${ruleCount} rules`}
                  >
                    r{ruleCount}
                  </span>
                ) : null}

                <span className="hidden items-center gap-0.5 group-hover:flex">
                  <IconButton
                    title={disabled ? 'Switch on' : 'Switch off'}
                    onClick={() => setEntityEnabled(entity.id, disabled)}
                  >
                    {disabled ? <EyeOff size={12} /> : <Eye size={12} />}
                  </IconButton>
                  <IconButton title="Duplicate" onClick={() => duplicateEntity(entity.id)}>
                    <Copy size={12} />
                  </IconButton>
                  <IconButton title="Delete" tone="danger" onClick={() => removeEntity(entity.id)}>
                    <Trash2 size={12} />
                  </IconButton>
                </span>

                {hidden && !selected ? (
                  <span className="text-[9px] uppercase text-zinc-500">hidden</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-1 border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-600">
        <div>Blue square = blocks movement · Amber = trigger</div>
        <div>↳ attached to another object · Double-click to focus the camera.</div>
      </div>
    </div>
  );
}
