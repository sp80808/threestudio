/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Input recording and replay.
 *
 * A recording is one frame per fixed step of the simulation, so replaying it
 * against the same document, seed and step rate reproduces the session exactly.
 * That makes gameplay regressions testable: a play-through recorded in the
 * editor can be re-run headlessly by `tools/playtest.ts` or a unit test.
 *
 * The formats here are pure data (no React, no Three.js) and `GameInput`-shaped
 * on both ends: `createRecordingInput` wraps the live input, `createReplayInput`
 * replaces it.
 */

import type { GameInput, PointerPick } from './types';
import type { Vec3 } from '../simulation/schema';

export const RECORDING_VERSION = 1;

/** One fixed step of recorded input. */
export interface RecordingFrame {
  /** Movement intent, `x` right / `y` forward, as the character behaviour reads it. */
  axis: { x: number; y: number };
  /** Keys that went down during this step (jumps, one-shot actions). */
  pressed: string[];
  /** Keys held at the end of this step (held actions, sprint modifiers, ...). */
  held: string[];
  /** Pointer picks delivered to the game during this step. */
  picks: PointerPick[];
}

export interface Recording {
  version: number;
  /** Fixed step rate the frames were captured at. */
  stepRate: number;
  /** World seed the session ran with. */
  seed: number;
  /** Document the session was recorded against. */
  projectId: string;
  /** Milliseconds since the epoch, or null when not known. */
  createdAt: number | null;
  frames: RecordingFrame[];
}

export interface RecordingInput extends GameInput {
  /** Frames captured so far. */
  readonly frames: RecordingFrame[];
  /** Starts capturing (clears anything captured before). */
  start(): void;
  /** Stops capturing; the input keeps forwarding to the wrapped source. */
  stop(): void;
  readonly isRecording: boolean;
}

/**
 * Wraps a live input and records one frame per fixed step.
 *
 * `limit` caps the recording length so a forgotten session cannot grow without
 * bound; once reached the input keeps playing but stops recording.
 */
export function createRecordingInput(
  source: GameInput,
  options: { limit?: number } = {},
): RecordingInput {
  const limit = options.limit ?? 60 * 60 * 5;
  let frames: RecordingFrame[] = [];
  let recording = false;
  let pressed: string[] = [];
  let picks: PointerPick[] = [];

  return {
    get frames() {
      return frames;
    },
    get isRecording() {
      return recording;
    },
    start: () => {
      frames = [];
      pressed = [];
      picks = [];
      recording = true;
    },
    stop: () => {
      recording = false;
    },
    getMovementAxis: () => source.getMovementAxis(),
    isKeyDown: (code) => source.isKeyDown(code),
    getPressedKeys: () => {
      pressed = source.getPressedKeys();
      return pressed;
    },
    getHeldKeys: () => source.getHeldKeys(),
    takePointerPicks: () => {
      const delivered = source.takePointerPicks();
      picks.push(...delivered);
      return delivered;
    },
    endStep: () => {
      source.endStep();
      if (!recording) {
        pressed = [];
        picks = [];
        return;
      }
      if (frames.length >= limit) {
        recording = false;
        return;
      }
      const axis = source.getMovementAxis();
      frames.push({
        axis: { x: axis.x, y: axis.y },
        pressed: [...pressed],
        held: source.getHeldKeys(),
        picks: picks.map((pick) => ({ entityId: pick.entityId, point: [...pick.point] as PointerPick['point'] })),
      });
      pressed = [];
      picks = [];
    },
  };
}

export interface ReplayInput extends GameInput {
  /** Index of the frame the next step will read. */
  readonly cursor: number;
  readonly totalFrames: number;
  /** True once every recorded frame has been consumed (input is then neutral). */
  readonly isFinished: boolean;
}

/**
 * Replays a recording. Frames are consumed by `endStep()`, matching the world's
 * step order: a step reads the frame at the cursor, then advances.
 */
export function createReplayInput(recording: Recording): ReplayInput {
  const frames = recording.frames;
  let cursor = 0;
  let picksTaken = false;

  const frame = (): RecordingFrame | null => frames[cursor] ?? null;
  const copyPicks = (picks: PointerPick[]): PointerPick[] =>
    picks.map((pick) => ({ entityId: pick.entityId, point: [...pick.point] as Vec3 }));

  return {
    get cursor() {
      return cursor;
    },
    get totalFrames() {
      return frames.length;
    },
    get isFinished() {
      return cursor >= frames.length;
    },
    getMovementAxis: () => {
      const current = frame();
      return current ? { ...current.axis } : { x: 0, y: 0 };
    },
    isKeyDown: (code) => Boolean(frame()?.held.includes(code)),
    getPressedKeys: () => [...(frame()?.pressed ?? [])],
    getHeldKeys: () => [...(frame()?.held ?? [])],
    takePointerPicks: () => {
      // Picks are handed out once per step, like a live input source.
      if (picksTaken) return [];
      picksTaken = true;
      return copyPicks(frame()?.picks ?? []);
    },
    endStep: () => {
      picksTaken = false;
      cursor = Math.min(cursor + 1, frames.length);
    },
  };
}

/** Empty recording, e.g. before a session has captured anything. */
export function createEmptyRecording(
  meta: { stepRate?: number; seed?: number; projectId?: string; createdAt?: number | null } = {},
): Recording {
  return {
    version: RECORDING_VERSION,
    stepRate: meta.stepRate ?? 60,
    seed: meta.seed ?? 1234,
    projectId: meta.projectId ?? '',
    createdAt: meta.createdAt ?? null,
    frames: [],
  };
}
