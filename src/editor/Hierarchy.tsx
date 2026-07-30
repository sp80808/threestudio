import { useEditorStore } from './store';
import { cn } from '../lib/utils';
import { BoxSelect } from 'lucide-react';

export default function Hierarchy() {
  const project = useEditorStore((s) => s.project);
  const selectedEntityId = useEditorStore((s) => s.selectedEntityId);
  const selectEntity = useEditorStore((s) => s.selectEntity);

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full text-zinc-300">
      <div className="px-4 py-2 border-b border-zinc-800 font-semibold text-xs tracking-wider uppercase">
        Hierarchy
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {Object.values(project.entities).length === 0 ? (
          <div className="px-4 text-xs text-zinc-500 italic">No entities</div>
        ) : (
          Object.values(project.entities).map((entity) => (
            <div
              key={entity.id}
              onClick={() => selectEntity(entity.id)}
              className={cn(
                "px-4 py-1.5 flex items-center gap-2 cursor-pointer text-sm select-none",
                selectedEntityId === entity.id ? "bg-blue-600 text-white" : "hover:bg-zinc-800"
              )}
            >
              <BoxSelect size={14} />
              {entity.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
