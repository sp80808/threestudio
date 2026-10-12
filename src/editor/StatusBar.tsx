/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Bottom status bar: scene summary and contextual shortcuts.
 */

import { useEditorStore } from './store';
import { usePlayStore } from './playStore';
import { summariseProject } from '../persistence/io';
import { cn } from '../lib/utils';

export default function StatusBar() {
  const project = useEditorStore((state) => state.project);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const dirty = useEditorStore((state) => state.dirty);
  const transformMode = useEditorStore((state) => state.transformMode);
  const autosave = useEditorStore((state) => state.autosave);
  const lastAutosaveAt = useEditorStore((state) => state.lastAutosaveAt);
  const status = usePlayStore((state) => state.status);
  const stats = usePlayStore((state) => state.stats);

  const selected = selectedEntityId ? project.entities[selectedEntityId] : null;

  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-3 text-[10px] text-zinc-500">
      <div className="flex items-center gap-3">
        <span className={cn(dirty ? 'text-amber-400' : 'text-zinc-500')}>
          {dirty ? '● Unsaved' : '● Saved'}
        </span>
        <span>{summariseProject(project)}</span>
        <span className={cn(lastAutosaveAt && autosave ? 'text-zinc-500' : 'text-zinc-600')}>
          {autosave
            ? lastAutosaveAt
              ? `Autosaved ${new Date(lastAutosaveAt).toLocaleTimeString()}`
              : 'Autosave on'
            : 'Autosave off'}
        </span>
        {selected ? (
          <span className="text-zinc-400">
            Selected: <span className="text-zinc-200">{selected.name}</span>
          </span>
        ) : (
          <span>Nothing selected — showing scene settings</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {status !== 'stopped' ? (
          <span className="text-emerald-400">
            {status === 'playing' ? 'Playing' : 'Paused'} · {stats?.steps ?? 0} steps ·{' '}
            {stats?.time.toFixed(1) ?? '0.0'}s simulated
          </span>
        ) : (
          <span className="font-mono">gizmo: {transformMode}</span>
        )}
        <span>Play with Space · Stop with Esc</span>
      </div>
    </div>
  );
}
