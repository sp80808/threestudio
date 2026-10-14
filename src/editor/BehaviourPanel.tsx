/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Behaviour authoring.
 *
 * The panel is generated from the runtime registry, so a behaviour added in
 * `src/runtime/behaviours.ts` is immediately authorable, previewed with its real
 * defaults and documented with its own labels. There is no second switch
 * statement to keep in sync.
 */

import { Plus, Trash2 } from 'lucide-react';
import type { Behaviour, BehaviourValue } from '../simulation/schema';
import {
  createBehaviourInstance,
  getBehaviourDefinition,
  listBehavioursByCategory,
} from '../runtime/behaviours';
import type { BehaviourParameterSpec } from '../runtime/types';
import { useEditorStore } from './store';
import {
  CheckField,
  EmptyHint,
  IconButton,
  NumberField,
  SelectField,
  SectionTitle,
  TextField,
  inputClass,
} from './fields';

const CATEGORY_LABELS: Record<string, string> = {
  motion: 'Movement',
  interaction: 'Interaction',
  gameplay: 'Gameplay',
};

export default function BehaviourPanel({ entityId }: { entityId: string }) {
  const project = useEditorStore((state) => state.project);
  const addBehaviour = useEditorStore((state) => state.addBehaviour);
  const updateBehaviour = useEditorStore((state) => state.updateBehaviour);
  const removeBehaviour = useEditorStore((state) => state.removeBehaviour);

  const entity = project.entities[entityId];
  if (!entity) return null;

  const behaviours = entity.behaviours ?? [];
  const grouped = listBehavioursByCategory();

  const setParameter = (behaviour: Behaviour, key: string, value: BehaviourValue) => {
    updateBehaviour(entityId, behaviour.id, {
      parameters: { ...behaviour.parameters, [key]: value },
    });
  };

  const valueFor = (behaviour: Behaviour, parameter: BehaviourParameterSpec): BehaviourValue =>
    behaviour.parameters[parameter.key] ?? parameter.default;

  const renderParameter = (behaviour: Behaviour, parameter: BehaviourParameterSpec) => {
    const value = valueFor(behaviour, parameter);
    const set = (next: BehaviourValue) => setParameter(behaviour, parameter.key, next);

    switch (parameter.kind) {
      case 'number':
        return (
          <NumberField
            label={parameter.label}
            value={typeof value === 'number' ? value : Number(parameter.default ?? 0)}
            step={parameter.step ?? 0.1}
            min={parameter.min}
            max={parameter.max}
            hint={parameter.help}
            onChange={set}
          />
        );

      case 'boolean':
        return (
          <CheckField
            label={parameter.label}
            checked={value === true}
            hint={parameter.help}
            onChange={set}
          />
        );

      case 'axis':
        return (
          <SelectField
            label={parameter.label}
            value={String(value ?? 'y')}
            options={parameter.options ?? []}
            hint={parameter.help}
            onChange={(next) => set(next)}
          />
        );

      case 'entity':
        return (
          <label key={parameter.key} className="block space-y-1">
            <span className="block text-[11px] text-zinc-500">{parameter.label}</span>
            <select
              value={String(value ?? '')}
              onChange={(event) => set(event.target.value)}
              className={inputClass}
            >
              <option value="">No object</option>
              <option value="$self">This object</option>
              {Object.values(project.entities)
                .filter((candidate) => candidate.id !== entityId)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
            </select>
            {parameter.help ? (
              <span className="block text-[10px] leading-3 text-zinc-600">{parameter.help}</span>
            ) : null}
          </label>
        );

      case 'variable':
        return (
          <label key={parameter.key} className="block space-y-1">
            <span className="block text-[11px] text-zinc-500">{parameter.label}</span>
            <select
              value={String(value ?? '')}
              onChange={(event) => set(event.target.value)}
              className={inputClass}
            >
              <option value="">No variable</option>
              {Object.values(project.variables ?? {}).map((variable) => (
                <option key={variable.id} value={variable.id}>
                  {variable.name}
                </option>
              ))}
            </select>
            {parameter.help ? (
              <span className="block text-[10px] leading-3 text-zinc-600">{parameter.help}</span>
            ) : null}
          </label>
        );

      default:
        return (
          <TextField
            label={parameter.label}
            value={String(value ?? '')}
            hint={parameter.help}
            onChange={set}
          />
        );
    }
  };

  return (
    <section className="space-y-3">
      <SectionTitle
        title="Behaviours"
        hint="Ready-made capabilities. Add one, then tune it in plain language."
      />

      <div className="space-y-1">
        {Object.entries(grouped).map(([category, definitions]) => (
          <div key={category} className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">
              {CATEGORY_LABELS[category] ?? category}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {definitions.map((definition) => (
                <button
                  key={definition.type}
                  onClick={() => addBehaviour(entityId, createBehaviourInstance(definition.type))}
                  className="group rounded border border-zinc-800 bg-zinc-950 p-2 text-left transition-colors hover:border-blue-500/60 hover:bg-zinc-900"
                  title={definition.description}
                >
                  <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-300 group-hover:text-white">
                    <Plus size={11} /> {definition.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-3 text-zinc-600">
                    {definition.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {behaviours.map((behaviour) => (
          <div key={behaviour.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={behaviour.enabled}
                aria-label={`Enable ${behaviour.label}`}
                onChange={(event) =>
                  updateBehaviour(entityId, behaviour.id, { enabled: event.target.checked })
                }
              />
              <input
                value={behaviour.label}
                onChange={(event) =>
                  updateBehaviour(entityId, behaviour.id, { label: event.target.value })
                }
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-zinc-200 outline-none"
              />
              <span className="font-mono text-[10px] text-zinc-600">{behaviour.type}</span>
              <IconButton
                title="Remove behaviour"
                tone="danger"
                onClick={() => removeBehaviour(entityId, behaviour.id)}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(getBehaviourDefinition(behaviour.type)?.parameters ?? []).map((parameter) => (
                <div
                  key={parameter.key}
                  className={parameter.kind === 'number' ? 'contents' : 'col-span-2'}
                >
                  {renderParameter(behaviour, parameter)}
                </div>
              ))}
            </div>
          </div>
        ))}

        {behaviours.length === 0 && (
          <EmptyHint>No behaviours yet. Pick one above to bring this object to life.</EmptyHint>
        )}
      </div>
    </section>
  );
}
