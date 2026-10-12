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
  /** True while the current session is capturing input. */
  recording: boolean;
  /** Frames available to download: the running capture, or the last one. */
  recordedFrames: number;
}

interface PlayStore extends PlaySnapshot {
  setSnapshot: (snapshot: Partial<PlaySnapshot>) => void;
  requestStart: () => void;
  requestPause: () => void;
  requestStep: () => void;
  requestStop: () => void;
  /** Starts recording the session's input (the runtime keeps playing). */
  requestRecord: () => void;
  requestStopRecording: () => void;
  /** Downloads the last recording as a JSON file. */
  requestDownloadRecording: () => void;
}

export const PLAY_EVENTS = {
  start: 'start-play-mode',
  pause: 'pause-play-mode',
  step: 'step-play-mode',
  stop: 'stop-play-mode',
  record: 'record-play-mode',
  stopRecording: 'stop-recording',
  downloadRecording: 'download-recording',
} as const;

export const usePlayStore = create<PlayStore>((set) => ({
  status: 'stopped',
  stats: null,
  variables: [],
  diagnostics: [],
  recording: false,
  recordedFrames: 0,

  setSnapshot: (snapshot) => set(snapshot),

  // Requests are broadcast; the viewport listens and performs them.
  requestStart: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.start)),
  requestPause: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.pause)),
  requestStep: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.step)),
  requestStop: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.stop)),
  requestRecord: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.record)),
  requestStopRecording: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.stopRecording)),
  requestDownloadRecording: () => window.dispatchEvent(new CustomEvent(PLAY_EVENTS.downloadRecording)),
}));
