/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Project browser: the documents saved in this browser.
 *
 * Local-first by design — there is no account and no server, so this panel is
 * the whole "cloud": open, save a copy, rename and delete. Autosave keeps the
 * open document current, which is why the list can be trusted after a reload.
 */

import { useEffect, useState } from 'react';
import { Copy, FolderOpen, HardDrive, Pencil, Trash2, X } from 'lucide-react';
import { useEditorStore } from './store';
import { cn } from '../lib/utils';
import { IconButton } from './fields';

/** "3 minutes ago" — precise enough for a local library list. */
export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function ProjectBrowser({ onClose }: { onClose: () => void }) {
  const library = useEditorStore((state) => state.library);
  const project = useEditorStore((state) => state.project);
  const dirty = useEditorStore((state) => state.dirty);
  const refreshLibrary = useEditorStore((state) => state.refreshLibrary);
  const saveAs = useEditorStore((state) => state.saveAs);
  const openDocument = useEditorStore((state) => state.openDocument);
  const removeDocument = useEditorStore((state) => state.removeDocument);

  const [copyName, setCopyName] = useState(`${project.name} copy`);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <HardDrive size={15} className="text-zinc-500" />
            Saved projects
          </div>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {library.length === 0 ? (
            <div className="px-4 py-6 text-xs italic text-zinc-500">
              Nothing saved in this browser yet. Press Save, or save a copy below.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {library.map((entry) => {
                const current = entry.id === project.id;
                const confirming = confirmId === entry.id;
                return (
                  <li
                    key={entry.id}
                    className={cn('flex items-center gap-3 px-4 py-2.5', current && 'bg-zinc-900/70')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-zinc-200">{entry.name}</span>
                        {current ? (
                          <span className="rounded bg-blue-900/50 px-1 text-[9px] uppercase text-blue-200">
                            open{dirty ? ' · edited' : ''}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Saved {relativeTime(entry.updatedAt)}
                        {entry.id === project.id ? ` · ${entry.id}` : ''}
                      </div>
                    </div>

                    {confirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            run(async () => {
                              await removeDocument(entry.id);
                              setConfirmId(null);
                            })
                          }
                          className="rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await openDocument(entry.id);
                              onClose();
                            })
                          }
                          className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                          title={dirty && current ? 'Replaces unsaved changes to this document' : 'Open'}
                        >
                          <FolderOpen size={12} /> Open
                        </button>
                        <IconButton
                          title="Delete permanently"
                          tone="danger"
                          disabled={busy}
                          onClick={() => setConfirmId(entry.id)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Pencil size={13} className="text-zinc-500" />
            <span className="text-[11px] text-zinc-400">Save a copy of “{project.name}”</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={copyName}
              onChange={(event) => setCopyName(event.target.value)}
              placeholder="Copy name"
              className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-600"
            />
            <button
              disabled={busy || copyName.trim().length === 0}
              onClick={() => run(() => saveAs(copyName))}
              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy size={12} /> Save as
            </button>
          </div>
          <p className="text-[10px] leading-4 text-zinc-600">
            Documents live in this browser (IndexedDB) and can be exported as JSON at any time. Autosave keeps the
            open document up to date while it is on.
          </p>
        </div>
      </div>
    </div>
  );
}
