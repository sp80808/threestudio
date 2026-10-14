/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Variable authoring plus a live read-out of the values the simulation is using.
 *
 * The two are deliberately shown together: the row above is the document default
 * (what the scene starts with), the badge below is the running value, which makes
 * the "play mode runs on a copy" rule obvious while testing.
 */

import { Plus, Trash2 } from 'lucide-react';
import { createVariable, type Variable, type VariableType } from '../simulation/schema';
import { usePlayStore } from './playStore';
import { useEditorStore } from './store';
import { EmptyHint, IconButton, SectionTitle, inputClass } from './fields';

const TYPE_OPTIONS: { value: VariableType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes / no' },
  { value: 'string', label: 'Text' },
];

function nextVariableId(existing: Record<string, Variable>): string {
  let index = Object.keys(existing).length + 1;
  let candidate = `variable${index}`;
  while (existing[candidate]) {
    index += 1;
    candidate = `variable${index}`;
  }
  return candidate;
}

export default function VariablesPanel() {
  const project = useEditorStore((state) => state.project);
  const addVariable = useEditorStore((state) => state.addVariable);
  const updateVariable = useEditorStore((state) => state.updateVariable);
  const removeVariable = useEditorStore((state) => state.removeVariable);
  const liveVariables = usePlayStore((state) => state.variables);
  const status = usePlayStore((state) => state.status);

  const variables = Object.values(project.variables ?? {});
  const liveById = new Map(liveVariables.map((variable) => [variable.id, variable.value]));

  return (
    <section className="space-y-3">
      <SectionTitle
        title="Variables"
        hint="The numbers and switches your rules and behaviours share."
        action={
          <IconButton
            title="Add a variable"
            tone="accent"
            onClick={() =>
              addVariable(createVariable(nextVariableId(project.variables ?? {}), 'New variable', 'number', 0))
            }
          >
            <Plus size={14} />
          </IconButton>
        }
      />

      {variables.length === 0 && (
        <EmptyHint>No variables yet. Add one to keep score, track keys or remember switches.</EmptyHint>
      )}

      <div className="space-y-2">
        {variables.map((variable) => {
          const live = liveById.get(variable.id);
          return (
            <div key={variable.id} className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
              <div className="flex items-center gap-2">
                <input
                  value={variable.name}
                  onChange={(event) => updateVariable(variable.id, { name: event.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-zinc-200 outline-none"
                />
                {status !== 'stopped' && live !== undefined ? (
                  <span className="rounded bg-emerald-950/70 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                    {String(live)}
                  </span>
                ) : null}
                <IconButton
                  title="Delete variable"
                  tone="danger"
                  onClick={() => removeVariable(variable.id)}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="block text-[10px] text-zinc-500">Type</span>
                  <select
                    value={variable.type}
                    onChange={(event) =>
                      updateVariable(variable.id, {
                        type: event.target.value as VariableType,
                        // Keep the starting value consistent with the type.
                        initialValue:
                          event.target.value === 'number'
                            ? 0
                            : event.target.value === 'boolean'
                              ? false
                              : '',
                      })
                    }
                    className={inputClass}
                  >
                    {TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="block text-[10px] text-zinc-500">Starts at</span>
                  {variable.type === 'boolean' ? (
                    <select
                      value={variable.initialValue === true ? 'true' : 'false'}
                      onChange={(event) =>
                        updateVariable(variable.id, { initialValue: event.target.value === 'true' })
                      }
                      className={inputClass}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  ) : (
                    <input
                      type={variable.type === 'number' ? 'number' : 'text'}
                      step={0.5}
                      value={
                        variable.type === 'number'
                          ? typeof variable.initialValue === 'number'
                            ? variable.initialValue
                            : 0
                          : typeof variable.initialValue === 'string'
                            ? variable.initialValue
                            : ''
                      }
                      onChange={(event) =>
                        updateVariable(variable.id, {
                          initialValue:
                            variable.type === 'number' ? Number(event.target.value) || 0 : event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  )}
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
