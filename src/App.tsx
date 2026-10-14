/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Editor shell: toolbar, hierarchy, viewport, inspector and status bar.
 *
 * Also owns the two document-level housekeeping jobs: refreshing the saved
 * project list once on start, and autosaving a moment after editing stops.
 */

import { useEffect, useRef, useState } from 'react';
import TopBar from './editor/TopBar';
import Hierarchy from './editor/Hierarchy';
import Inspector from './editor/Inspector';
import ProjectBrowser from './editor/ProjectBrowser';
import StatusBar from './editor/StatusBar';
import Viewport from './render/Viewport';
import { useEditorStore } from './editor/store';

/** How long the editor stays quiet before writing the document to IndexedDB. */
export const AUTOSAVE_DELAY_MS = 2500;

export default function App() {
  const [browserOpen, setBrowserOpen] = useState(false);
  const dirty = useEditorStore((state) => state.dirty);
  const autosave = useEditorStore((state) => state.autosave);
  const autosaveNow = useEditorStore((state) => state.autosaveNow);
  const refreshLibrary = useEditorStore((state) => state.refreshLibrary);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // The list is needed the moment the browser is opened, but reading it at
    // start also means a reload lands on a library that already knows what is
    // saved.
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (!dirty || !autosave) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void autosaveNow();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [dirty, autosave, autosaveNow]);

  useEffect(() => {
    if (!dirty) return;
    // An export is one click away, but a reload is one slip away.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onOpenBrowser = () => setBrowserOpen(true);
    window.addEventListener('open-project-browser', onOpenBrowser);
    return () => window.removeEventListener('open-project-browser', onOpenBrowser);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-300">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Hierarchy />
        <div className="relative min-w-0 flex-1 bg-black">
          <Viewport />
        </div>
        <Inspector />
      </div>
      <StatusBar />
      {browserOpen ? <ProjectBrowser onClose={() => setBrowserOpen(false)} /> : null}
    </div>
  );
}
