import { useEffect, useState } from 'react';
import { Activity, CircleAlert } from 'lucide-react';
import { RuntimeTraceEntry } from '../runtime/physics';

type RuntimeStatus = 'edit' | 'initializing' | 'playing' | 'error';

const statusLabels: Record<RuntimeStatus, string> = {
  edit: 'Edit mode',
  initializing: 'Starting runtime…',
  playing: 'Play mode',
  error: 'Runtime error',
};

export default function RuntimeTrace() {
  const [status, setStatus] = useState<RuntimeStatus>('edit');
  const [entries, setEntries] = useState<RuntimeTraceEntry[]>([]);

  useEffect(() => {
    const handleState = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: RuntimeStatus }>).detail;
      setStatus(detail?.status ?? 'edit');
      if (detail?.status === 'initializing') setEntries([]);
    };

    const handleTrace = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeTraceEntry>).detail;
      if (!detail?.message) return;
      setEntries((current) => [...current, detail].slice(-5));
    };

    window.addEventListener('play-mode-state', handleState);
    window.addEventListener('runtime-trace', handleTrace);
    return () => {
      window.removeEventListener('play-mode-state', handleState);
      window.removeEventListener('runtime-trace', handleTrace);
    };
  }, []);

  return (
    <aside className="pointer-events-none absolute bottom-3 left-3 z-10 w-80 overflow-hidden rounded-md border border-zinc-700/80 bg-zinc-950/90 text-zinc-300 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <Activity size={13} /> Runtime trace
        </span>
        <span className={`text-[10px] font-medium ${status === 'playing' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-zinc-500'}`}>
          {statusLabels[status]}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2 font-mono text-[10px] leading-4">
        {entries.length === 0 ? (
          <p className="text-zinc-600">Add a recipe or behaviours, then press Play.</p>
        ) : entries.map((entry, index) => (
          <p key={`${entry.message}-${index}`} className={entry.kind === 'warning' ? 'flex gap-1.5 text-amber-300' : entry.kind === 'event' ? 'text-cyan-300' : 'text-zinc-500'}>
            {entry.kind === 'warning' && <CircleAlert className="mt-0.5 shrink-0" size={11} />}
            <span>{entry.message}</span>
          </p>
        ))}
      </div>
    </aside>
  );
}
