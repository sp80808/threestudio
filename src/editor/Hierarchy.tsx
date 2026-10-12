/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Scene hierarchy: search, select, hide, duplicate and delete objects.
 */

import { Copy, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore } from './store';
import { cn } from '../lib/utils';
import { IconButton } from './fields';

export default function Hierarchy() {
  const project = useEditorStore((state) => state.project);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const duplicateEntity = useEditorStore((state) => state.duplicateEntity);
  const setEntityEnabled = useEditorStore((state) => state.setEntityEnabled);
  const [query, setQuery] = useState('');

  const entities = Object.values(project.entities);
  const filtered = query
    ? entities.filter((entity) => entity.name.toLowerCase().includes(query.toLowerCase()))
    : entities;

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

            return (
              <div
                key={entity.id}
                onClick={() => selectEntity(entity.id)}
                onDoubleClick={() => window.dispatchEvent(new CustomEvent('focus-selected'))}
                className={cn(
                  'group flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs select-none',
                  selected ? 'bg-blue-600 text-white' : 'hover:bg-zinc-800',
                  disabled && !selected && 'opacity-45',
                )}
              >
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
        <div>Double-click an object to focus the camera.</div>
      </div>
    </div>
  );
}
