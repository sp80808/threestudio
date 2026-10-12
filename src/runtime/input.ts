/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Input sources for play mode.
 *
 * `createDomInput` wires real keyboard/pointer events from the viewport, while
 * `createScriptedInput` drives the same interface from tests (and from the
 * future "record & replay" tooling).
 */

import type { Vec3 } from '../simulation/schema';
import type { GameInput, PointerPick } from './types';

const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACKWARD_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export interface DomInput extends GameInput {
  /** Queues a pointer pick, usually produced by raycasting in the viewport. */
  pushPick(entityId: string | null, point?: Vec3): void;
  dispose(): void;
}

/** Keyboard + pointer input bound to a DOM element (the WebGL canvas). */
export function createDomInput(element: HTMLElement): DomInput {
  const keys = new Set<string>();
  const pressed = new Set<string>();
  const picks: PointerPick[] = [];

  const clearKeys = () => {
    keys.clear();
    pressed.clear();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (PREVENT_DEFAULT_KEYS.has(event.code)) event.preventDefault();
    keys.add(event.code);
    pressed.add(event.code);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);

  // Clicks inside the viewport are translated into `pointer-click` events by
  // the viewport itself, which owns the camera and the raycaster.
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    element.focus?.();
  };
  element.addEventListener('pointerdown', onPointerDown);

  return {
    getMovementAxis: () => {
      const horizontal =
        (RIGHT_KEYS.some((code) => keys.has(code)) ? 1 : 0) -
        (LEFT_KEYS.some((code) => keys.has(code)) ? 1 : 0);
      const vertical =
        (FORWARD_KEYS.some((code) => keys.has(code)) ? 1 : 0) -
        (BACKWARD_KEYS.some((code) => keys.has(code)) ? 1 : 0);
      return { x: horizontal, y: vertical };
    },
    isKeyDown: (code) => keys.has(code),
    getPressedKeys: () => [...pressed],
    takePointerPicks: () => picks.splice(0, picks.length),
    pushPick: (entityId, point = [0, 0, 0]) => {
      picks.push({ entityId, point });
    },
    endStep: () => {
      pressed.clear();
      picks.length = 0;
    },
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      element.removeEventListener('pointerdown', onPointerDown);
      clearKeys();
      picks.length = 0;
    },
  };
}

export interface ScriptedInput extends GameInput {
  setKey(code: string, down: boolean): void;
  pressKey(code: string): void;
  setAxis(x: number, y: number): void;
  pick(entityId: string | null, point?: Vec3): void;
}

/** Deterministic input double used by unit tests and scenario checks. */
export function createScriptedInput(): ScriptedInput {
  const keys = new Set<string>();
  const pressed = new Set<string>();
  const picks: PointerPick[] = [];
  let axis = { x: 0, y: 0 };

  return {
    getMovementAxis: () => ({ ...axis }),
    isKeyDown: (code) => keys.has(code),
    getPressedKeys: () => [...pressed],
    takePointerPicks: () => picks.splice(0, picks.length),
    setKey: (code, down) => {
      if (down) {
        keys.add(code);
        pressed.add(code);
      } else {
        keys.delete(code);
      }
    },
    pressKey: (code) => {
      keys.add(code);
      pressed.add(code);
    },
    setAxis: (x, y) => {
      axis = { x, y };
    },
    pick: (entityId, point = [0, 0, 0]) => {
      picks.push({ entityId, point });
    },
    endStep: () => {
      pressed.clear();
      picks.length = 0;
    },
  };
}
