import { Plus, Trash2 } from 'lucide-react';
import { Behaviour, BehaviourValue } from '../simulation/schema';
import { useEditorStore } from './store';

const definitions: Array<{
  type: Behaviour['type'];
  label: string;
  description: string;
}> = [
  { type: 'spin', label: 'Spin', description: 'Continuously rotate this object.' },
  { type: 'bob', label: 'Float / Bob', description: 'Move gently up and down.' },
  { type: 'door', label: 'Door', description: 'Open and optionally close after a delay.' },
  { type: 'pressure-plate', label: 'Pressure Plate', description: 'Trigger another object when stepped on.' },
];

function createBehaviour(type: Behaviour['type']): Behaviour {
  const id = crypto.randomUUID();

  switch (type) {
    case 'spin':
      return {
        id,
        type,
        label: 'Spin',
        enabled: true,
        parameters: { axis: 'y', speed: 45 },
      };
    case 'bob':
      return {
        id,
        type,
        label: 'Float / Bob',
        enabled: true,
        parameters: { axis: 'y', amplitude: 0.25, frequency: 1 },
      };
    case 'door':
      return {
        id,
        type,
        label: 'Door',
        enabled: true,
        parameters: { direction: 'y', distance: 2, duration: 0.8, autoClose: true, closeDelay: 2 },
      };
    case 'pressure-plate':
      return {
        id,
        type,
        label: 'Pressure Plate',
        enabled: true,
        parameters: { targetEntityId: '', releaseDelay: 0.2 },
      };
  }
}

function asNumber(value: BehaviourValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function asString(value: BehaviourValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: BehaviourValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export default function BehaviourPanel({ entityId }: { entityId: string }) {
  const project = useEditorStore((state) => state.project);
  const addBehaviour = useEditorStore((state) => state.addBehaviour);
  const updateBehaviour = useEditorStore((state) => state.updateBehaviour);
  const removeBehaviour = useEditorStore((state) => state.removeBehaviour);
  const entity = project.entities[entityId];

  if (!entity) return null;

  const behaviours = entity.behaviours ?? [];

  const setParameter = (behaviour: Behaviour, key: string, value: BehaviourValue) => {
    updateBehaviour(entityId, behaviour.id, {
      parameters: {
        ...behaviour.parameters,
        [key]: value,
      },
    });
  };

  const renderFields = (behaviour: Behaviour) => {
    if (behaviour.type === 'spin') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-zinc-500">
            Axis
            <select
              value={asString(behaviour.parameters.axis, 'y')}
              onChange={(event) => setParameter(behaviour, 'axis', event.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </label>
          <NumberField
            label="Speed °/s"
            value={asNumber(behaviour.parameters.speed, 45)}
            onChange={(value) => setParameter(behaviour, 'speed', value)}
          />
        </div>
      );
    }

    if (behaviour.type === 'bob') {
      return (
        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1 text-[11px] text-zinc-500">
            Axis
            <select
              value={asString(behaviour.parameters.axis, 'y')}
              onChange={(event) => setParameter(behaviour, 'axis', event.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </label>
          <NumberField
            label="Distance"
            value={asNumber(behaviour.parameters.amplitude, 0.25)}
            step={0.05}
            onChange={(value) => setParameter(behaviour, 'amplitude', value)}
          />
          <NumberField
            label="Speed"
            value={asNumber(behaviour.parameters.frequency, 1)}
            step={0.1}
            onChange={(value) => setParameter(behaviour, 'frequency', value)}
          />
        </div>
      );
    }

    if (behaviour.type === 'door') {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-[11px] text-zinc-500">
              Direction
              <select
                value={asString(behaviour.parameters.direction, 'y')}
                onChange={(event) => setParameter(behaviour, 'direction', event.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
              </select>
            </label>
            <NumberField
              label="Distance"
              value={asNumber(behaviour.parameters.distance, 2)}
              step={0.1}
              onChange={(value) => setParameter(behaviour, 'distance', value)}
            />
            <NumberField
              label="Duration"
              value={asNumber(behaviour.parameters.duration, 0.8)}
              step={0.1}
              onChange={(value) => setParameter(behaviour, 'duration', value)}
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex flex-1 items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={asBoolean(behaviour.parameters.autoClose, true)}
                onChange={(event) => setParameter(behaviour, 'autoClose', event.target.checked)}
              />
              Close automatically
            </label>
            <NumberField
              label="Delay"
              value={asNumber(behaviour.parameters.closeDelay, 2)}
              step={0.1}
              onChange={(value) => setParameter(behaviour, 'closeDelay', value)}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <label className="space-y-1 text-[11px] text-zinc-500">
          Target object
          <select
            value={asString(behaviour.parameters.targetEntityId)}
            onChange={(event) => setParameter(behaviour, 'targetEntityId', event.target.value)}
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="">Choose an object…</option>
            {Object.values(project.entities)
              .filter((candidate) => candidate.id !== entityId)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
          </select>
        </label>
        <NumberField
          label="Release delay"
          value={asNumber(behaviour.parameters.releaseDelay, 0.2)}
          step={0.1}
          onChange={(value) => setParameter(behaviour, 'releaseDelay', value)}
        />
      </div>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Behaviours</div>
          <p className="mt-1 text-[11px] leading-4 text-zinc-600">Add ready-made capabilities, then tune them in plain language.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {definitions.map((definition) => (
          <button
            key={definition.type}
            onClick={() => addBehaviour(entityId, createBehaviour(definition.type))}
            className="group rounded border border-zinc-800 bg-zinc-950 p-2 text-left hover:border-blue-500/60 hover:bg-zinc-900"
            title={definition.description}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 group-hover:text-white">
              <Plus size={12} /> {definition.label}
            </span>
            <span className="mt-1 block text-[10px] leading-3 text-zinc-600">{definition.description}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {behaviours.map((behaviour) => (
          <div key={behaviour.id} className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3">
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={behaviour.enabled}
                onChange={(event) => updateBehaviour(entityId, behaviour.id, { enabled: event.target.checked })}
                aria-label={`Enable ${behaviour.label}`}
              />
              <input
                value={behaviour.label}
                onChange={(event) => updateBehaviour(entityId, behaviour.id, { label: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-zinc-200 outline-none"
              />
              <button
                onClick={() => removeBehaviour(entityId, behaviour.id)}
                className="rounded p-1 text-zinc-600 hover:bg-red-950 hover:text-red-400"
                title="Remove behaviour"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {renderFields(behaviour)}
          </div>
        ))}

        {behaviours.length === 0 && (
          <div className="rounded border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] text-zinc-600">
            This object has no behaviours yet.
          </div>
        )}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="space-y-1 text-[11px] text-zinc-500">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
      />
    </label>
  );
}
