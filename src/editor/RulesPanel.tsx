/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Rule authoring (WHEN / IF / DO).
 *
 * Rules are stored exactly as the runtime executes them, so this panel is a
 * direct view of `RuleSchema`. Each rule reads top-to-bottom in one sentence:
 * *when* something happens, *if* these checks pass, *do* these actions.
 */

import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  ENTITY_REF_BROADCAST,
  createRule,
  createRuleAction,
  createRuleCondition,
  type BehaviourValue,
  type Project,
  type Rule,
  type RuleAction,
  type RuleActionType,
  type RuleCondition,
  type RuleConditionType,
  type RuleEventType,
} from '../simulation/schema';
import { useEditorStore } from './store';
import {
  CheckField,
  EmptyHint,
  IconButton,
  NumberField,
  SectionTitle,
  TextField,
  inputClass,
} from './fields';
import { cn } from '../lib/utils';

const EVENT_OPTIONS: { value: RuleEventType; label: string }[] = [
  { value: 'scene-start', label: 'When the scene starts' },
  { value: 'pointer-click', label: 'When an object is clicked' },
  { value: 'trigger-enter', label: 'When something enters' },
  { value: 'trigger-exit', label: 'When something leaves' },
  { value: 'variable-changed', label: 'When a variable changes' },
  { value: 'interval', label: 'Every few seconds' },
  { value: 'custom', label: 'When a message arrives' },
];

const CONDITION_OPTIONS: { value: RuleConditionType; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'variable-equals', label: 'Variable equals' },
  { value: 'variable-greater-than', label: 'Variable is greater than' },
  { value: 'distance-less-than', label: 'Objects are closer than' },
  { value: 'entity-enabled', label: 'Object is switched on' },
  { value: 'entity-visible', label: 'Object is visible' },
  { value: 'is-overlapping', label: 'Objects are touching' },
];

const ACTION_OPTIONS: { value: RuleActionType; label: string }[] = [
  { value: 'set-variable', label: 'Set a variable' },
  { value: 'change-variable', label: 'Add to a variable' },
  { value: 'set-visible', label: 'Show / hide an object' },
  { value: 'set-enabled', label: 'Switch an object on / off' },
  { value: 'set-behaviour-enabled', label: 'Switch a behaviour on / off' },
  { value: 'move-entity', label: 'Nudge an object' },
  { value: 'reset-entity', label: 'Put an object back where it started' },
  { value: 'emit-event', label: 'Send a message' },
];

function EntityPicker({
  project,
  value,
  onChange,
  allowBroadcast,
  allowSelf,
  label,
}: {
  project: Project;
  value: string | null;
  onChange: (value: string) => void;
  allowBroadcast?: boolean;
  allowSelf?: boolean;
  label: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] text-zinc-500">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {allowBroadcast ? <option value={ENTITY_REF_BROADCAST}>Everyone</option> : null}
        {allowBroadcast ? null : <option value="">This object</option>}
        {!allowBroadcast ? <option value="$source">Whoever triggered it</option> : null}
        {!allowBroadcast ? <option value="$other">The other object</option> : null}
        {allowSelf ? <option value="$self">This object</option> : null}
        {Object.values(project.entities).map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RulesPanel({
  entityId,
  title = 'Rules (WHEN / IF / DO)',
  hint = 'Automate the game: when something happens, if a check passes, do these things.',
}: {
  /** `null` authors scene-wide rules. */
  entityId: string | null;
  title?: string;
  hint?: string;
}) {
  const project = useEditorStore((state) => state.project);
  const addRule = useEditorStore((state) => state.addRule);
  const updateRule = useEditorStore((state) => state.updateRule);
  const removeRule = useEditorStore((state) => state.removeRule);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rules: Rule[] = entityId ? project.entities[entityId]?.rules ?? [] : project.rules ?? [];

  const patch = (ruleId: string, next: Partial<Rule>) => updateRule(entityId, ruleId, next);

  const setEventType = (rule: Rule, type: RuleEventType) => {
    patch(rule.id, {
      event: {
        type,
        sourceEntityId: rule.event.sourceEntityId,
        name: type === 'custom' ? rule.event.name ?? 'message' : null,
        interval: type === 'interval' ? rule.event.interval ?? 1 : null,
      },
    });
  };

  const updateCondition = (rule: Rule, id: string, next: Partial<RuleCondition>) =>
    patch(rule.id, {
      conditions: rule.conditions.map((condition) =>
        condition.id === id ? { ...condition, ...next } : condition,
      ),
    });

  const updateAction = (rule: Rule, id: string, next: Partial<RuleAction>) =>
    patch(rule.id, {
      actions: rule.actions.map((action) => (action.id === id ? { ...action, ...next } : action)),
    });

  const variableOptions = Object.values(project.variables ?? {});
  const variableOf = (id: string | null) => (id ? project.variables?.[id] : undefined);

  /** The value editor adapts to what the field actually means. */
  const renderValue = (
    value: BehaviourValue,
    onChange: (value: BehaviourValue) => void,
    shape: 'number' | 'boolean' | 'string',
    label = 'Value',
    hint?: string,
  ) => {
    if (shape === 'number') {
      return (
        <NumberField
          label={label}
          hint={hint}
          value={typeof value === 'number' ? value : Number(value ?? 0) || 0}
          step={0.1}
          onChange={onChange}
        />
      );
    }
    if (shape === 'boolean') {
      return (
        <CheckField
          label={label}
          hint={hint}
          checked={value === true}
          onChange={(checked) => onChange(checked)}
        />
      );
    }
    return (
      <TextField
        label={label}
        hint={hint}
        value={typeof value === 'string' ? value : value === null ? '' : String(value)}
        onChange={(next) => onChange(next)}
      />
    );
  };

  const shapeForVariable = (variableId: string | null): 'number' | 'boolean' | 'string' => {
    const variable = variableOf(variableId);
    if (!variable) return 'string';
    return variable.type;
  };

  return (
    <section className="space-y-3">
      <SectionTitle
        title={title}
        hint={hint}
        action={
          <IconButton
            title="Add a rule"
            tone="accent"
            onClick={() => addRule(entityId, createRule({ event: { type: 'scene-start', sourceEntityId: null, name: null, interval: null } }))}
          >
            <Plus size={14} />
          </IconButton>
        }
      />

      {rules.length === 0 && <EmptyHint>No rules yet. Add one to make things happen.</EmptyHint>}

      <div className="space-y-2">
        {rules.map((rule) => {
          const open = expanded === rule.id;
          return (
            <div key={rule.id} className="rounded-md border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center gap-1.5 p-2">
                <button
                  onClick={() => setExpanded(open ? null : rule.id)}
                  className="text-zinc-500 hover:text-zinc-200"
                  title={open ? 'Collapse' : 'Edit rule'}
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  title="Enable this rule"
                  onChange={(event) => patch(rule.id, { enabled: event.target.checked })}
                />
                <input
                  value={rule.name}
                  onChange={(event) => patch(rule.id, { name: event.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-zinc-200 outline-none"
                />
                <span className="font-mono text-[10px] text-zinc-600">
                  when→{rule.conditions.length ? `if ${rule.conditions.length}→` : ''}do {rule.actions.length}
                </span>
                <IconButton title="Delete rule" tone="danger" onClick={() => removeRule(entityId, rule.id)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>

              {open && (
                <div className="space-y-3 border-t border-zinc-800 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block space-y-1">
                      <span className="block text-[11px] text-zinc-500">When</span>
                      <select
                        value={rule.event.type}
                        onChange={(event) => setEventType(rule, event.target.value as RuleEventType)}
                        className={inputClass}
                      >
                        {EVENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {rule.event.type === 'variable-changed' ? (
                      <label className="block space-y-1">
                        <span className="block text-[11px] text-zinc-500">Variable</span>
                        <select
                          value={rule.event.name ?? ''}
                          onChange={(event) =>
                            patch(rule.id, { event: { ...rule.event, name: event.target.value } })
                          }
                          className={inputClass}
                        >
                          <option value="">Any variable</option>
                          {variableOptions.map((variable) => (
                            <option key={variable.id} value={variable.name}>
                              {variable.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {rule.event.type === 'interval' ? (
                      <NumberField
                        label="Seconds between"
                        value={rule.event.interval ?? 1}
                        step={0.25}
                        min={0.05}
                        onChange={(value) => patch(rule.id, { event: { ...rule.event, interval: value } })}
                      />
                    ) : null}

                    {rule.event.type === 'custom' ? (
                      <TextField
                        label="Message name"
                        value={rule.event.name ?? ''}
                        placeholder="open"
                        onChange={(value) => patch(rule.id, { event: { ...rule.event, name: value } })}
                      />
                    ) : null}

                    {(rule.event.type === 'pointer-click' ||
                      rule.event.type === 'trigger-enter' ||
                      rule.event.type === 'trigger-exit' ||
                      rule.event.type === 'custom') && (
                      <EntityPicker
                        project={project}
                        label="From which object"
                        value={rule.event.sourceEntityId}
                        onChange={(value) =>
                          patch(rule.id, { event: { ...rule.event, sourceEntityId: value || null } })
                        }
                      />
                    )}
                  </div>

                  <CheckField
                    label="Only ever once per play session"
                    checked={rule.once ?? false}
                    onChange={(checked) => patch(rule.id, { once: checked })}
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        If (all must be true)
                      </span>
                      <IconButton
                        title="Add a condition"
                        onClick={() =>
                          patch(rule.id, {
                            conditions: [...rule.conditions, createRuleCondition('always')],
                          })
                        }
                      >
                        <Plus size={13} />
                      </IconButton>
                    </div>

                    {rule.conditions.map((condition) => (
                      <div
                        key={condition.id}
                        className="grid grid-cols-2 gap-2 rounded border border-zinc-800 bg-zinc-950/60 p-2"
                      >
                        <label className="col-span-2 block space-y-1">
                          <span className="block text-[11px] text-zinc-500">Check</span>
                          <select
                            value={condition.type}
                            onChange={(event) =>
                              updateCondition(rule, condition.id, {
                                type: event.target.value as RuleConditionType,
                              })
                            }
                            className={inputClass}
                          >
                            {CONDITION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {condition.type === 'variable-equals' ||
                        condition.type === 'variable-greater-than' ? (
                          <>
                            <label className="block space-y-1">
                              <span className="block text-[11px] text-zinc-500">Variable</span>
                              <select
                                value={condition.property ?? ''}
                                onChange={(event) =>
                                  updateCondition(rule, condition.id, { property: event.target.value })
                                }
                                className={inputClass}
                              >
                                <option value="">Pick a variable</option>
                                {variableOptions.map((variable) => (
                                  <option key={variable.id} value={variable.id}>
                                    {variable.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {renderValue(
                              condition.value,
                              (value) => updateCondition(rule, condition.id, { value }),
                              shapeForVariable(condition.property),
                              'Value',
                            )}
                          </>
                        ) : null}

                        {condition.type === 'distance-less-than' ? (
                          <>
                            <EntityPicker
                              project={project}
                              label="Object A"
                              value={condition.subjectEntityId}
                              allowSelf
                              onChange={(value) =>
                                updateCondition(rule, condition.id, { subjectEntityId: value || null })
                              }
                            />
                            <EntityPicker
                              project={project}
                              label="Object B"
                              value={condition.property}
                              onChange={(value) =>
                                updateCondition(rule, condition.id, { property: value || null })
                              }
                            />
                            <NumberField
                              label="Closer than (metres)"
                              value={typeof condition.value === 'number' ? condition.value : 1}
                              step={0.25}
                              onChange={(value) => updateCondition(rule, condition.id, { value })}
                            />
                          </>
                        ) : null}

                        {condition.type === 'is-overlapping' ? (
                          <>
                            <EntityPicker
                              project={project}
                              label="Object A"
                              value={condition.subjectEntityId}
                              allowSelf
                              onChange={(value) =>
                                updateCondition(rule, condition.id, { subjectEntityId: value || null })
                              }
                            />
                            <EntityPicker
                              project={project}
                              label="Object B"
                              value={condition.property}
                              onChange={(value) =>
                                updateCondition(rule, condition.id, { property: value || null })
                              }
                            />
                          </>
                        ) : null}

                        {condition.type === 'entity-enabled' || condition.type === 'entity-visible' ? (
                          <>
                            <EntityPicker
                              project={project}
                              label="Object"
                              value={condition.subjectEntityId}
                              allowSelf
                              onChange={(value) =>
                                updateCondition(rule, condition.id, { subjectEntityId: value || null })
                              }
                            />
                            <label className="block space-y-1">
                              <span className="block text-[11px] text-zinc-500">Should be</span>
                              <select
                                value={condition.value === true ? 'true' : 'false'}
                                onChange={(event) =>
                                  updateCondition(rule, condition.id, {
                                    value: event.target.value === 'true',
                                  })
                                }
                                className={inputClass}
                              >
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            </label>
                          </>
                        ) : null}

                        <div className="col-span-2 flex justify-end">
                          <IconButton
                            title="Remove condition"
                            tone="danger"
                            onClick={() =>
                              patch(rule.id, {
                                conditions: rule.conditions.filter((entry) => entry.id !== condition.id),
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Do (in order)
                      </span>
                      <IconButton
                        title="Add an action"
                        onClick={() =>
                          patch(rule.id, { actions: [...rule.actions, createRuleAction('set-visible')] })
                        }
                      >
                        <Plus size={13} />
                      </IconButton>
                    </div>

                    {rule.actions.map((action) => (
                      <div
                        key={action.id}
                        className="grid grid-cols-2 gap-2 rounded border border-zinc-800 bg-zinc-950/60 p-2"
                      >
                        <label className="col-span-2 block space-y-1">
                          <span className="block text-[11px] text-zinc-500">Do</span>
                          <select
                            value={action.type}
                            onChange={(event) =>
                              updateAction(rule, action.id, {
                                type: event.target.value as RuleActionType,
                              })
                            }
                            className={inputClass}
                          >
                            {ACTION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {action.type !== 'emit-event' ? (
                          <EntityPicker
                            project={project}
                            label="Object"
                            value={action.targetEntityId}
                            allowSelf
                            onChange={(value) =>
                              updateAction(rule, action.id, { targetEntityId: value || null })
                            }
                          />
                        ) : (
                          <EntityPicker
                            project={project}
                            label="Send to"
                            value={action.targetEntityId}
                            allowBroadcast
                            onChange={(value) =>
                              updateAction(rule, action.id, { targetEntityId: value || null })
                            }
                          />
                        )}

                        {action.type === 'set-variable' || action.type === 'change-variable' ? (
                          <>
                            <label className="block space-y-1">
                              <span className="block text-[11px] text-zinc-500">Variable</span>
                              <select
                                value={action.property ?? ''}
                                onChange={(event) =>
                                  updateAction(rule, action.id, { property: event.target.value })
                                }
                                className={inputClass}
                              >
                                <option value="">Pick a variable</option>
                                {variableOptions.map((variable) => (
                                  <option key={variable.id} value={variable.id}>
                                    {variable.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {action.type === 'change-variable'
                              ? renderValue(action.value, (value) => updateAction(rule, action.id, { value }), 'number', 'Add')
                              : renderValue(
                                  action.value,
                                  (value) => updateAction(rule, action.id, { value }),
                                  shapeForVariable(action.property),
                                  'Value',
                                )}
                          </>
                        ) : null}

                        {action.type === 'set-visible' || action.type === 'set-enabled' ? (
                          <label className="block space-y-1">
                            <span className="block text-[11px] text-zinc-500">Should be</span>
                            <select
                              value={action.value === true ? 'true' : 'false'}
                              onChange={(event) =>
                                updateAction(rule, action.id, { value: event.target.value === 'true' })
                              }
                              className={inputClass}
                            >
                              <option value="true">Yes / visible</option>
                              <option value="false">No / hidden</option>
                            </select>
                          </label>
                        ) : null}

                        {action.type === 'set-behaviour-enabled' ? (
                          <>
                            <label className="block space-y-1">
                              <span className="block text-[11px] text-zinc-500">Behaviour</span>
                              <select
                                value={action.property ?? ''}
                                onChange={(event) =>
                                  updateAction(rule, action.id, { property: event.target.value })
                                }
                                className={inputClass}
                              >
                                <option value="">Pick a behaviour</option>
                                {Object.values(project.entities).flatMap((entity) =>
                                  (entity.behaviours ?? []).map((behaviour) => (
                                    <option key={behaviour.id} value={behaviour.id}>
                                      {entity.name} · {behaviour.label}
                                    </option>
                                  )),
                                )}
                              </select>
                            </label>
                            <label className="block space-y-1">
                              <span className="block text-[11px] text-zinc-500">Should be</span>
                              <select
                                value={action.value === false ? 'off' : 'on'}
                                onChange={(event) =>
                                  updateAction(rule, action.id, { value: event.target.value === 'on' })
                                }
                                className={inputClass}
                              >
                                <option value="on">Switched on</option>
                                <option value="off">Switched off</option>
                              </select>
                            </label>
                          </>
                        ) : null}

                        {action.type === 'move-entity' ? (
                          <>
                            <label className="block space-y-1">
                              <span className="block text-[11px] text-zinc-500">Direction</span>
                              <select
                                value={action.property ?? 'y'}
                                onChange={(event) =>
                                  updateAction(rule, action.id, { property: event.target.value })
                                }
                                className={inputClass}
                              >
                                <option value="x">Along X</option>
                                <option value="y">Along Y (up / down)</option>
                                <option value="z">Along Z</option>
                              </select>
                            </label>
                            {renderValue(action.value, (value) => updateAction(rule, action.id, { value }), 'number', 'Distance')}
                          </>
                        ) : null}

                        {action.type === 'emit-event' ? (
                          <TextField
                            label="Message"
                            value={typeof action.property === 'string' ? action.property : ''}
                            placeholder="open"
                            onChange={(value) => updateAction(rule, action.id, { property: value })}
                          />
                        ) : null}

                        <div className="col-span-2 flex justify-end">
                          <IconButton
                            title="Remove action"
                            tone="danger"
                            onClick={() =>
                              patch(rule.id, {
                                actions: rule.actions.filter((entry) => entry.id !== action.id),
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      </div>
                    ))}

                    {rule.actions.length === 0 && (
                      <div className={cn('text-[11px] text-zinc-600')}>
                        This rule only checks something. Add an action to make it do something.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
