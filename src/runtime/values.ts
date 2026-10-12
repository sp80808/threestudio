/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Coercion helpers for weakly typed authoring values.
 *
 * No-code documents mix numbers, strings, booleans and `null`. Every runtime
 * read goes through these helpers so a malformed document degrades to a sane
 * fallback instead of producing `NaN` inside the simulation.
 */

import type { Axis, BehaviourValue } from '../simulation/schema';

export function asNumber(value: BehaviourValue | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return fallback;
}

export function asString(value: BehaviourValue | undefined, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function asBoolean(value: BehaviourValue | undefined, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return fallback;
}

export function asAxis(value: BehaviourValue | undefined, fallback: Axis = 'y'): Axis {
  return value === 'x' || value === 'y' || value === 'z' ? value : fallback;
}

export function asNullableString(value: BehaviourValue | undefined): string | null {
  if (typeof value === 'string' && value !== '') return value;
  return null;
}

/**
 * Coerces a value to the declared type of a variable so authored values and
 * runtime writes stay consistent.
 */
export function coerceToType(
  value: BehaviourValue,
  type: 'number' | 'boolean' | 'string',
): BehaviourValue {
  if (type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  if (type === 'boolean') return asBoolean(value, false);
  return asString(value, '');
}

export function equalsLoose(a: BehaviourValue, b: BehaviourValue): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    return asNumber(a, Number.NaN) === asNumber(b, Number.NaN);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return asBoolean(a, false) === asBoolean(b, false);
  }
  return asString(a, '') === asString(b, '');
}
