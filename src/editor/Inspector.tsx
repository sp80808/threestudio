import { useEditorStore } from './store';

export default function Inspector() {
  const project = useEditorStore((s) => s.project);
  const selectedEntityId = useEditorStore((s) => s.selectedEntityId);
  const updateEntityTransform = useEditorStore((s) => s.updateEntityTransform);
  const updateEntityName = useEditorStore((s) => s.updateEntityName);

  if (!selectedEntityId) {
    return (
      <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full text-zinc-500 items-center justify-center text-sm">
        No selection
      </div>
    );
  }

  const entity = project.entities[selectedEntityId];
  if (!entity) return null;

  const handleTransformChange = (
    prop: 'position' | 'rotation' | 'scale',
    axis: 0 | 1 | 2,
    val: string
  ) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    const newTransform = { ...entity.transform };
    newTransform[prop][axis] = num;
    updateEntityTransform(entity.id, newTransform);
  };

  return (
    <div className="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full text-zinc-300">
      <div className="px-4 py-2 border-b border-zinc-800 font-semibold text-xs tracking-wider uppercase">
        Inspector
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Name */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Name</label>
          <input
            type="text"
            value={entity.name}
            onChange={(e) => updateEntityName(entity.id, e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
          />
        </div>

        {/* Transform */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Transform</div>
          
          {(['position', 'rotation', 'scale'] as const).map((prop) => (
            <div key={prop} className="space-y-1">
              <label className="text-xs text-zinc-400 capitalize">{prop}</label>
              <div className="grid grid-cols-3 gap-2">
                {['X', 'Y', 'Z'].map((axis, i) => (
                  <div key={axis} className="flex items-center bg-zinc-950 border border-zinc-800 rounded px-2 overflow-hidden">
                    <span className="text-[10px] text-zinc-500 font-mono mr-1">{axis}</span>
                    <input
                      type="number"
                      step={prop === 'rotation' ? "0.1" : "0.01"}
                      value={entity.transform[prop][i as 0|1|2]}
                      onChange={(e) => handleTransformChange(prop, i as 0|1|2, e.target.value)}
                      className="w-full bg-transparent text-sm py-1 outline-none appearance-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
