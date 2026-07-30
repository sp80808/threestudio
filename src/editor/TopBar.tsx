import { useEditorStore } from './store';
import { 
  Box, Circle, Cylinder, Square, 
  Undo, Redo, Save, FolderOpen, 
  Move, RotateCcw, Scaling, Globe, BoxSelect, Trash, Download,
  ZoomIn, ZoomOut, Focus
} from 'lucide-react';

export default function TopBar() {
  const { 
    undo, redo, save, load, addEntity, 
    transformMode, setTransformMode, 
    transformSpace, setTransformSpace,
    selectedEntityId, removeEntity
  } = useEditorStore();

  const handleExport = () => {
    window.dispatchEvent(new CustomEvent('export-glb'));
  };

  const handleAdd = (geometry: 'box' | 'sphere' | 'cylinder' | 'plane') => {
    const id = Math.random().toString(36).substring(2, 9);
    addEntity({
      id,
      name: `New ${geometry}`,
      parentId: null,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      },
      components: {
        render: {
          type: 'render',
          geometry,
          color: '#888888'
        }
      }
    });
  };

  return (
    <div className="h-12 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 text-zinc-300">
      
      {/* File & Edit */}
      <div className="flex items-center gap-2">
        <button onClick={() => save()} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Save Project">
          <Save size={16} />
        </button>
        <button onClick={() => load('default')} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Load Project">
          <FolderOpen size={16} />
        </button>
        <button onClick={handleExport} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Export GLB">
          <Download size={16} />
        </button>
        <div className="w-px h-4 bg-zinc-800 mx-2" />
        <button onClick={undo} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Undo">
          <Undo size={16} />
        </button>
        <button onClick={redo} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Redo">
          <Redo size={16} />
        </button>
      </div>

      {/* Transform Tools */}
      <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-md border border-zinc-800">
        <button 
          onClick={() => setTransformMode('translate')} 
          className={`p-1.5 rounded ${transformMode === 'translate' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          title="Translate"
        >
          <Move size={16} />
        </button>
        <button 
          onClick={() => setTransformMode('rotate')} 
          className={`p-1.5 rounded ${transformMode === 'rotate' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          title="Rotate"
        >
          <RotateCcw size={16} />
        </button>
        <button 
          onClick={() => setTransformMode('scale')} 
          className={`p-1.5 rounded ${transformMode === 'scale' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          title="Scale"
        >
          <Scaling size={16} />
        </button>
        
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        
        <button 
          onClick={() => setTransformSpace(transformSpace === 'local' ? 'world' : 'local')} 
          className="px-2 py-1 flex items-center gap-1 rounded text-xs font-medium text-zinc-400 hover:text-zinc-200"
        >
          {transformSpace === 'local' ? <BoxSelect size={14} /> : <Globe size={14} />}
          {transformSpace === 'local' ? 'Local' : 'World'}
        </button>
      </div>

      {/* View Tools */}
      <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-md border border-zinc-800">
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('zoom-in'))} 
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('zoom-out'))} 
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('focus-selected'))} 
          className={`p-1.5 rounded ${selectedEntityId ? 'text-zinc-300 hover:bg-zinc-800' : 'text-zinc-600 cursor-not-allowed'}`}
          title="Focus Selected"
        >
          <Focus size={16} />
        </button>
      </div>

      {/* Add Primitives */}
      <div className="flex items-center gap-2">
        <button onClick={() => handleAdd('box')} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Add Box">
          <Box size={16} />
        </button>
        <button onClick={() => handleAdd('sphere')} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Add Sphere">
          <Circle size={16} />
        </button>
        <button onClick={() => handleAdd('cylinder')} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Add Cylinder">
          <Cylinder size={16} />
        </button>
        <button onClick={() => handleAdd('plane')} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white" title="Add Plane">
          <Square size={16} />
        </button>
        <div className="w-px h-4 bg-zinc-800 mx-2" />
        <button 
          onClick={() => selectedEntityId && removeEntity(selectedEntityId)} 
          className={`p-1.5 rounded ${selectedEntityId ? 'text-red-400 hover:bg-red-900/30' : 'text-zinc-600 cursor-not-allowed'}`}
          title="Delete Selected"
        >
          <Trash size={16} />
        </button>
      </div>

    </div>
  );
}
