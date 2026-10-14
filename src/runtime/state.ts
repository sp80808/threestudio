/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Typed accessors for `BehaviourRuntimeState`.
 *
 * Behaviour state is an open bag of key/value pairs so behaviours can be added
 * without touching the schema. These helpers keep reads honest when a document
 * was authored against an older version of a behaviour.
 */

import type { BehaviourRuntimeState } from './types';

export function readState<T>(state: BehaviourRuntimeState, key: string, fallback: T): T {
  const value = state[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== typeof fallback && fallback !== null) {
    // Values restored from a saved session keep their JSON type; anything else
    // falls back rather than producing `NaN` deep inside the loop.
    if (typeof fallback === 'number' && typeof value === 'string') {
      const parsed = Number(value);
      return (Number.isFinite(parsed) ? parsed : fallback) as T;
    }
    return fallback;
  }
  return value as T;
}

export function writeState(state: BehaviourRuntimeState, key: string, value: unknown): void {
  state[key] = value;
}
