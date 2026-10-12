/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Toolbar: document actions, play controls, transform tools, object creation and
 * viewport display toggles.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  BoxSelect,
  Circle,
  Cone,
  Cylinder,
  Download,
  FolderOpen,
  Globe,
  Grid3x3,
  Move,
  Package,
  Pause,
  Play,
  Redo,
  RotateCcw,
  Save,
  Scaling,
  SkipForward,
  Square,
  SquareStack,
  StopCircle,
  Trash,
  Undo,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { GeometryKind } from '../simulation/schema';
import { SCENE_TEMPLATES } from '../simulation/scenarios';
import { parseProject, serializeProject, summariseProject } from '../persistence/io';
import { useEditorStore } from './store';
import { usePlayStore } from './playStore';
import { useViewStore } from './viewStore';
import { cn } from '../lib/utils';

function download(filename: string, contents: string, type = 'application/json') {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function TopBar() {
  const project = useEditorStore((state) => state.project);
  const dirty = useEditorStore((state) => state.dirty);
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt);
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const save = useEditorStore((state) => state.save);
  const autosave = useEditorStore((state) => state.autosave);
  const setAutosave = useEditorStore((state) => state.setAutosave);
  const newProject = useEditorStore((state) => state.newProject);
  const loadTemplate = useEditorStore((state) => state.loadTemplate);
  const replaceProject = useEditorStore((state) => state.replaceProject);
  const addPrimitive = useEditorStore((state) => state.addPrimitive);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const transformMode = useEditorStore((state) => state.transformMode);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const transformSpace = useEditorStore((state) => state.transformSpace);
  const setTransformSpace = useEditorStore((state) => state.setTransformSpace);

  const status = usePlayStore((state) => state.status);
  const requestStart = usePlayStore((state) => state.requestStart);
  const requestStop = usePlayStore((state) => state.requestStop);

  const showColliders = useViewStore((state) => state.showColliders);
  const showGrid = useViewStore((state) => state.showGrid);
  const toggleColliders = useViewStore((state) => state.toggleColliders);
  const toggleGrid = useViewStore((state) => state.toggleGrid);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<'none' | 'templates' | 'projects'>('none');
  const [message, setMessage] = useState<string | null>(null);

  const playing = status !== 'stopped';
  const editDisabled = playing;

  const buttonClass = 'rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:text-zinc-700';

  const handleExportJson = () => {
    download(`${project.name || 'project'}.threestudio.json`, serializeProject(project, { pretty: true }));
    setMessage(`Exported ${summariseProject(project)}`);
  };

  const handleExportGlb = () => {
    // The viewport owns the Three.js scene, so ask it to export (see
    // `handleExport` there) and wait for its result event before reporting.
    window.dispatchEvent(new CustomEvent('export-glb'));
    setMessage('Preparing the GLB export…');
  };

  useEffect(() => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; name?: string; error?: string }>).detail;
      setMessage(detail?.ok ? `Exported ${detail.name ?? 'the scene'} as GLB.` : `GLB export failed: ${detail?.error ?? 'unknown error'}`);
    };
    window.addEventListener('glb-exported', onResult);
    return () => window.removeEventListener('glb-exported', onResult);
  }, []);

  const handleImportJson = async (file: File) => {
    const text = await file.text();
    const result = parseProject(text);
    if (result.ok) {
      replaceProject(result.project);
      setMessage(
        result.migratedFrom
          ? `Imported and upgraded a version ${result.migratedFrom} project.`
          : `Imported ${summariseProject(result.project)}`,
      );
      return;
    }
    setMessage(result.error);
  };

  return (
    <div className="relative flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-3 text-zinc-300">
      {/* Document */}
      <div className="flex items-center gap-1">
        <input
          value={project.name}
          onChange={(event) => useEditorStore.setState({ project: { ...project, name: event.target.value }, dirty: true })}
          className="w-40 rounded bg-transparent px-2 py-1 text-xs font-semibold text-zinc-200 outline-none hover:bg-zinc-900 focus:bg-zinc-900"
        />
        <button onClick={() => setMenu(menu === 'templates' ? 'none' : 'templates')} className={buttonClass} title="New from template">
          <SquareStack size={16} />
        </button>
        <button onClick={() => void save()} className={buttonClass} title="Save to this browser">
          <Save size={16} />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-project-browser'))}
          className={buttonClass}
          title="Saved projects (open, save a copy, delete)"
        >
          <FolderOpen size={16} />
        </button>
        <button onClick={handleExportJson} className={buttonClass} title="Export project as JSON">
          <Download size={16} />
        </button>
        <button onClick={() => fileInputRef.current?.click()} className={buttonClass} title="Import project JSON">
          <Upload size={16} />
        </button>
        <button
          onClick={handleExportGlb}
          disabled={editDisabled}
          className={buttonClass}
          title="Export the scene as GLB (for Blender, Godot, three.js viewers…)"
        >
          <Package size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportJson(file);
            event.target.value = '';
          }}
        />

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        <button onClick={undo} disabled={!canUndo || editDisabled} className={buttonClass} title="Undo (Ctrl+Z)">
          <Undo size={16} />
        </button>
        <button onClick={redo} disabled={!canRedo || editDisabled} className={buttonClass} title="Redo (Ctrl+Shift+Z)">
          <Redo size={16} />
        </button>

        <span className="ml-2 text-[10px] text-zinc-600">
          {dirty ? 'Unsaved changes' : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Not saved yet'}
        </span>
        <button
          onClick={() => setAutosave(!autosave)}
          title={autosave ? 'Autosave is on — click to switch it off' : 'Autosave is off — click to switch it on'}
          className={cn(
            'ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
            autosave ? 'bg-emerald-950/70 text-emerald-300' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
          )}
        >
          autosave {autosave ? 'on' : 'off'}
        </button>
      </div>

      {/* Play controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          {status === 'stopped' ? (
            <button
              onClick={requestStart}
              className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              title="Play (Space)"
            >
              <Play size={14} fill="currentColor" /> Play
            </button>
          ) : (
            <button
              onClick={() => usePlayStore.getState().requestPause()}
              className="flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
              title="Pause or resume (P)"
            >
              <Pause size={14} /> {status === 'playing' ? 'Pause' : 'Resume'}
            </button>
          )}
          <button
            onClick={() => usePlayStore.getState().requestStep()}
            disabled={status === 'stopped'}
            className={cn('rounded px-2 py-1.5 text-xs', playing ? 'text-zinc-300 hover:bg-zinc-800' : 'cursor-not-allowed text-zinc-700')}
            title="Advance one simulation step (.)"
          >
            <SkipForward size={14} />
          </button>
          <button
            onClick={requestStop}
            disabled={!playing}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold',
              playing ? 'bg-red-600 text-white hover:bg-red-500' : 'cursor-not-allowed text-zinc-700',
            )}
            title="Stop and restore the authored scene (Esc)"
          >
            <StopCircle size={14} /> Stop
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          {([
            ['translate', Move, 'Move (W)'],
            ['rotate', RotateCcw, 'Rotate (E)'],
            ['scale', Scaling, 'Scale (R)'],
          ] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              onClick={() => setTransformMode(mode)}
              disabled={editDisabled}
              className={cn('rounded p-1.5', transformMode === mode && !editDisabled ? 'bg-zinc-700 text-white' : buttonClass)}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-zinc-700" />
          <button
            onClick={() => setTransformSpace(transformSpace === 'local' ? 'world' : 'local')}
            disabled={editDisabled}
            className={cn('flex items-center gap-1 rounded px-2 py-1 text-[11px]', editDisabled ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-200')}
            title="Switch between local and world space"
          >
            {transformSpace === 'local' ? <BoxSelect size={13} /> : <Globe size={13} />}
            {transformSpace === 'local' ? 'Local' : 'World'}
          </button>
        </div>
      </div>

      {/* Objects, view tools */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          {([
            ['box', Box, 'Add a box'],
            ['sphere', Circle, 'Add a sphere'],
            ['cylinder', Cylinder, 'Add a cylinder'],
            ['cone', Cone, 'Add a cone'],
            ['plane', Square, 'Add a flat plane'],
          ] as const).map(([geometry, Icon, label]) => (
            <button
              key={geometry}
              onClick={() => addPrimitive(geometry as GeometryKind)}
              disabled={editDisabled}
              className={buttonClass}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          <button onClick={toggleColliders} className={cn(buttonClass, showColliders && 'text-sky-400')} title="Show collision shapes">
            <SquareStack size={16} />
          </button>
          <button onClick={toggleGrid} className={cn(buttonClass, showGrid && 'text-zinc-200')} title="Show grid">
            <Grid3x3 size={16} />
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('zoom-in'))} className={buttonClass} title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('zoom-out'))} className={buttonClass} title="Zoom out">
            <ZoomOut size={16} />
          </button>
        </div>

        <button
          onClick={() => selectedEntityId && removeEntity(selectedEntityId)}
          disabled={editDisabled || !selectedEntityId}
          className={cn('rounded p-1.5', !editDisabled && selectedEntityId ? 'text-red-400 hover:bg-red-900/30' : 'cursor-not-allowed text-zinc-700')}
          title="Delete selected (Del)"
        >
          <Trash size={16} />
        </button>
      </div>

      {/* Menus and status messages */}
      {menu === 'templates' && (
        <div className="absolute left-3 top-12 z-20 w-80 rounded-md border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Start from a template
          </div>
          {SCENE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                loadTemplate(template.id);
                setMenu('none');
                setMessage(`Loaded "${template.name}"`);
              }}
              className="block w-full rounded px-2 py-2 text-left hover:bg-zinc-800"
            >
              <div className="text-xs font-medium text-zinc-200">{template.name}</div>
              <div className="text-[10px] leading-3 text-zinc-500">{template.description}</div>
            </button>
          ))}
          <div className="my-1 h-px bg-zinc-800" />
          <button
            onClick={() => {
              newProject();
              setMenu('none');
            }}
            className="block w-full rounded px-2 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Empty scene
          </button>
        </div>
      )}

      {message && (
        <button
          onClick={() => setMessage(null)}
          className="absolute bottom-[-2.25rem] left-1/2 z-20 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-900/95 px-3 py-1.5 text-[11px] text-zinc-300 shadow-lg"
        >
          {message}
        </button>
      )}
    </div>
  );
}
