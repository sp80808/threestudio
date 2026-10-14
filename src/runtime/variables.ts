/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Game variables (the "state" half of a no-code game).
 *
 * Variables are declared in the document with a name, type and initial value.
 * The store owns the live values and reports every change so rules can react to
 * `variable-changed` without polling.
 */

import type { BehaviourValue, Variable } from '../simulation/schema';
import { asBoolean, asNumber, asString, coerceToType } from './values';

export interface VariableChange {
  id: string;
  name: string;
  value: BehaviourValue;
  previousValue: BehaviourValue;
}

export interface VariableStore {
  /** Live value of a variable, or `null` when the id is unknown. */
  get(id: string): BehaviourValue;
  getByName(name: string): BehaviourValue;
  has(id: string): boolean;
  /** Writes a value, returning false when the variable does not exist. */
  set(id: string, value: BehaviourValue): boolean;
  /** Adds a numeric delta, returning false for unknown/non-numeric variables. */
  change(id: string, delta: number): boolean;
  /** Flips a boolean variable, returning the new value (or null if unknown). */
  toggle(id: string): boolean | null;
  entries(): { variable: Variable; value: BehaviourValue }[];
  /** Plain object snapshot, handy for HUDs and diagnostics overlays. */
  snapshot(): Record<string, BehaviourValue>;
  /** Restores authored initial values (used when a session starts). */
  reset(): void;
}

export function createVariableStore(
  definitions: Variable[],
  onChanged?: (change: VariableChange) => void,
): VariableStore {
  const byId = new Map<string, Variable>();
  const values = new Map<string, BehaviourValue>();

  for (const definition of definitions) {
    byId.set(definition.id, definition);
    values.set(definition.id, coerceToType(definition.initialValue, definition.type));
  }

  const byName = new Map<string, Variable>();
  for (const definition of definitions) {
    if (!byName.has(definition.name)) byName.set(definition.name, definition);
  }

  const resolve = (id: string): Variable | undefined => byId.get(id);

  const write = (variable: Variable, next: BehaviourValue): void => {
    const coerced = coerceToType(next, variable.type);
    const previous = values.get(variable.id) ?? null;
    if (coerced === previous) return;
    values.set(variable.id, coerced);
    onChanged?.({
      id: variable.id,
      name: variable.name,
      value: coerced,
      previousValue: previous,
    });
  };

  return {
    get: (id) => values.get(id) ?? null,
    getByName: (name) => {
      const variable = byName.get(name);
      return variable ? values.get(variable.id) ?? null : null;
    },
    has: (id) => byId.has(id),
    set: (id, value) => {
      const variable = resolve(id);
      if (!variable) return false;
      write(variable, value);
      return true;
    },
    change: (id, delta) => {
      const variable = resolve(id);
      if (!variable) return false;
      if (variable.type !== 'number') {
        // Booleans and strings can still take numeric deltas meaningfully.
        if (variable.type === 'boolean') {
          const current = asBoolean(values.get(id), false);
          write(variable, asNumber(delta, 0) % 2 !== 0 ? !current : current);
          return true;
        }
        return false;
      }
      write(variable, asNumber(values.get(id), 0) + delta);
      return true;
    },
    toggle: (id) => {
      const variable = resolve(id);
      if (!variable) return null;
      if (variable.type === 'boolean') {
        const next = !asBoolean(values.get(id), false);
        write(variable, next);
        return next;
      }
      if (variable.type === 'number') {
        const next = asNumber(values.get(id), 0) === 0 ? 1 : 0;
        write(variable, next);
        return next === 1;
      }
      return null;
    },
    entries: () =>
      definitions.map((variable) => ({
        variable,
        value: values.get(variable.id) ?? coerceToType(variable.initialValue, variable.type),
      })),
    snapshot: () => {
      const result: Record<string, BehaviourValue> = {};
      for (const variable of definitions) {
        result[variable.name] = values.get(variable.id) ?? null;
      }
      return result;
    },
    reset: () => {
      values.clear();
      for (const definition of definitions) {
        values.set(definition.id, coerceToType(definition.initialValue, definition.type));
      }
    },
  };
}

export { asBoolean, asNumber, asString };
