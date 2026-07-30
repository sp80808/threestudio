import { useEffect, useState } from 'react';
import {
  Box,
  BoxSelect,
  Circle,
  Cylinder,
  Download,
  Focus,
  FolderOpen,
  Globe,
  Move,
  Play,
  Redo,
  RotateCcw,
  Save,
  Scaling,
  Square,
  StopCircle,
  Trash,
  Undo,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEditorStore } from './store';

export default function TopBar() {
  const {
    undo,
    redo,
    save,
    load,
    addEntity,
    transformMode,
    setTransformMode,
    transformSpace,
    setTransformSpace,
    selectedEntityId,
    removeEntity,
  } = useEditorStore();
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const handleState = (event: Event) => {
      const detail = (event as CustomEvent<{ playing: boolean }>).detail;
      setIsPlaying(Boolean(detail?.playing));
    };
    window.addEventListener('play-mode-state', handleState);
    return () => window.removeEventListener('play-mode-state', handleState);
  }, []);

  const addPrimitive = (geometry: 'box' | 'sphere' | 'cylinder' | 'plane') => {
    if (isPlaying) return;
    const id = crypto.randomUUID();
    addEntity({
      id,
      name: `New ${geometry}`,
      parentId: null,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: {
        render: {
          type: 'render',
          geometry,
          color: '#888888',
        },
      },
    });
  };

  const editButton = `rounded p-1.5 ${isPlaying ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`;

  return (
    <div className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 text-zinc-300">
      <div className="flex items-center gap-2">
        <button onClick={() => void save()} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Save Project">
          <Save size={16} />
        </button>
        <button onClick={() => void load('default')} disabled={isPlaying} className={editButton} title="Load Project">
          <FolderOpen size={16} />
        </button>
        <button onClick={() => window.dispatchEvent(new CustomEvent('export-glb'))} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Export GLB">
          <Download size={16} />
        </button>
        <div className="mx-2 h-4 w-px bg-zinc-800" />
        <button onClick={undo} disabled={isPlaying} className={editButton} title="Undo">
          <Undo size={16} />
        </button>
        <button onClick={redo} disabled={isPlaying} className={editButton} title="Redo">
          <Redo size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('start-play-mode'))}
            disabled={isPlaying}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${isPlaying ? 'cursor-not-allowed text-zinc-700' : 'bg-emerald-600 text-white hover:bg-emerald-500'}`}
            title="Play"
          >
            <span className="flex items-center gap-1.5"><Play size={14} fill="currentColor" /> Play</span>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('stop-play-mode'))}
            disabled={!isPlaying}
            className={`rounded px-3 py-1.5 text-xs font-semibold ${isPlaying ? 'bg-red-600 text-white hover:bg-red-500' : 'cursor-not-allowed text-zinc-700'}`}
            title="Stop"
          >
            <span className="flex items-center gap-1.5"><StopCircle size={14} /> Stop</span>
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          {([
            ['translate', Move, 'Translate'],
            ['rotate', RotateCcw, 'Rotate'],
            ['scale', Scaling, 'Scale'],
          ] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              onClick={() => setTransformMode(mode)}
              disabled={isPlaying}
              className={`rounded p-1.5 ${transformMode === mode && !isPlaying ? 'bg-zinc-700 text-white' : editButton}`}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-zinc-700" />
          <button
            onClick={() => setTransformSpace(transformSpace === 'local' ? 'world' : 'local')}
            disabled={isPlaying}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${isPlaying ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {transformSpace === 'local' ? <BoxSelect size={14} /> : <Globe size={14} />}
            {transformSpace === 'local' ? 'Local' : 'World'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1">
          <button onClick={() => window.dispatchEvent(new CustomEvent('zoom-in'))} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('zoom-out'))} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('focus-selected'))} disabled={!selectedEntityId} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:text-zinc-700" title="Focus Selected">
            <Focus size={16} />
          </button>
        </div>

        {([
          ['box', Box, 'Add Box'],
          ['sphere', Circle, 'Add Sphere'],
          ['cylinder', Cylinder, 'Add Cylinder'],
          ['plane', Square, 'Add Plane'],
        ] as const).map(([geometry, Icon, label]) => (
          <button key={geometry} onClick={() => addPrimitive(geometry)} disabled={isPlaying} className={editButton} title={label}>
            <Icon size={16} />
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-zinc-800" />
        <button
          onClick={() => selectedEntityId && removeEntity(selectedEntityId)}
          disabled={isPlaying || !selectedEntityId}
          className={`rounded p-1.5 ${!isPlaying && selectedEntityId ? 'text-red-400 hover:bg-red-900/30' : 'cursor-not-allowed text-zinc-700'}`}
          title="Delete Selected"
        >
          <Trash size={16} />
        </button>
      </div>
    </div>
  );
}
