/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Play-mode state shared between the viewport (which owns the simulation) and
 * the UI (which displays it).
 *
 * Commands travel through window events so the viewport stays the single owner
 * of the `World` instance, while this store carries the read-only snapshot the
 * editor renders.
 */

import { create } from 'zustand';
import type { BehaviourValue } from '../simulation/schema';
import type { Diagnostic } from '../runtime/diagnostics';
import type { WorldStats } from '../runtime/world';

export type PlayStatus = 'stopped' | 'playing' | 'paused';

export interface PlaySnapshot {
  status: PlayStatus;
  stats: WorldStats | null;
  variables: { id: string; name: string; value: BehaviourValue }[];
  diagnostics: Diagnostic[];
}

interface PlayStore extends PlaySnapshot {
  setSnapshot: (snapshot: Partial<PlaySnapshot>) => void;
  requestStart: () => void;
  requestPause: () => void;
  requestStep: () => void;
  requestStop: () => void;
}

export const PLAY_EVENTS = {
  start: 'start-play-mode',
  pause: 'pause-play-mode',
  step: 'step-play-mode',
  stop: 'stop-play-mode',
} as const;

export const usePlayStore = create<PlayStore>((set) => ({
  status: 'stopped',
  stats: null,
  variables: [],
  diagnostics: [],

  setSnapshot: (snapshot) => set(snapshot),

  // Requests are broadcast; the viewport listens and performs them.
  requestStart: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.start)),
  requestPause: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.pause)),
  requestStep: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.step)),
  requestStop: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.stop)),
}));
