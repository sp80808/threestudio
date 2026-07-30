import BehaviourPanel from './BehaviourPanel';
import { useEditorStore } from './store';

export default function Inspector() {
  const project = useEditorStore((state) => state.project);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const updateEntityTransform = useEditorStore((state) => state.updateEntityTransform);
  const updateEntityName = useEditorStore((state) => state.updateEntityName);

  if (!selectedEntityId) {
    return (
      <div className="flex h-full w-80 flex-col items-center justify-center border-l border-zinc-800 bg-zinc-900 text-sm text-zinc-500">
        Select an object to edit it
      </div>
    );
  }

  const entity = project.entities[selectedEntityId];
  if (!entity) return null;

  const handleTransformChange = (
    property: 'position' | 'rotation' | 'scale',
    axis: 0 | 1 | 2,
    value: string,
  ) => {
    const numberValue = Number.parseFloat(value);
    if (!Number.isFinite(numberValue)) return;

    const vector = [...entity.transform[property]] as [number, number, number];
    vector[axis] = numberValue;
    updateEntityTransform(entity.id, {
      ...entity.transform,
      [property]: vector,
    });
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-zinc-800 bg-zinc-900 text-zinc-300">
      <div className="border-b border-zinc-800 px-4 py-2 text-xs font-semibold uppercase tracking-wider">
        Inspector
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <div className="space-y-1">
          <label className="text-xs text-zinc-400">Name</label>
          <input
            type="text"
            value={entity.name}
            onChange={(event) => updateEntityName(entity.id, event.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Transform</div>
          {(['position', 'rotation', 'scale'] as const).map((property) => (
            <div key={property} className="space-y-1">
              <label className="text-xs capitalize text-zinc-400">{property}</label>
              <div className="grid grid-cols-3 gap-2">
                {['X', 'Y', 'Z'].map((axis, index) => (
                  <div key={axis} className="flex items-center overflow-hidden rounded border border-zinc-800 bg-zinc-950 px-2">
                    <span className="mr-1 font-mono text-[10px] text-zinc-500">{axis}</span>
                    <input
                      type="number"
                      step={property === 'rotation' ? 0.1 : 0.01}
                      value={entity.transform[property][index as 0 | 1 | 2]}
                      onChange={(event) => handleTransformChange(property, index as 0 | 1 | 2, event.target.value)}
                      className="w-full appearance-none bg-transparent py-1 text-sm outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="h-px bg-zinc-800" />
        <BehaviourPanel entityId={entity.id} />
      </div>
    </div>
  );
}
