/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Recording import/export.
 *
 * Kept next to the document I/O in `io.ts` so every file the application reads
 * or writes is validated in one place: a recording that fails validation never
 * reaches the runtime.
 */

import { z } from 'zod';
import { RECORDING_VERSION, type Recording } from '../runtime/replay';

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const RecordingFrameSchema = z.object({
  axis: z.object({ x: z.number(), y: z.number() }),
  pressed: z.array(z.string()),
  held: z.array(z.string()),
  picks: z.array(z.object({ entityId: z.string().nullable(), point: Vec3Schema })),
});

export const RecordingSchema = z.object({
  version: z.number().int(),
  stepRate: z.number().positive(),
  seed: z.number(),
  projectId: z.string(),
  createdAt: z.number().nullable(),
  frames: z.array(RecordingFrameSchema),
});

export type ParseRecordingResult =
  | { ok: true; recording: Recording; migratedFrom: number | null }
  | { ok: false; error: string };

export function serializeRecording(recording: Recording, options: { pretty?: boolean } = {}): string {
  return JSON.stringify(recording, null, options.pretty ? 2 : undefined);
}

/**
 * Validates a recording read from a file or a browser download.
 *
 * Older versions are migrated here; unknown (newer) versions are accepted as
 * long as the shape still validates, so a recording from a newer build that only
 * added optional metadata still replays.
 */
export function parseRecording(text: string): ParseRecordingResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${(error as Error).message}` };
  }

  const version =
    typeof raw === 'object' && raw !== null && 'version' in raw
      ? Number((raw as { version: unknown }).version)
      : null;

  const result = RecordingSchema.safeParse(migrateRecording(raw));
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      error: `Invalid recording${issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message})` : ''}`,
    };
  }

  return {
    ok: true,
    recording: result.data as Recording,
    migratedFrom: version !== null && version < RECORDING_VERSION ? version : null,
  };
}

/** Brings a raw recording document up to the current version. */
function migrateRecording(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const document = { ...(raw as Record<string, unknown>) };

  // v1 is the first version, so the only work here is filling in fields that
  // older builds did not write. `held` came after the first recordings: without
  // it a replay would lose held keys, so it is reconstructed from `pressed`.
  if (Array.isArray(document.frames)) {
    document.frames = document.frames.map((frame) => {
      if (typeof frame !== 'object' || frame === null) return frame;
      const entry = { ...(frame as Record<string, unknown>) };
      if (!Array.isArray(entry.held)) entry.held = Array.isArray(entry.pressed) ? entry.pressed : [];
      if (!Array.isArray(entry.pressed)) entry.pressed = [];
      if (!Array.isArray(entry.picks)) entry.picks = [];
      if (typeof entry.axis !== 'object' || entry.axis === null) entry.axis = { x: 0, y: 0 };
      return entry;
    });
  }

  if (typeof document.stepRate !== 'number') document.stepRate = 60;
  if (typeof document.seed !== 'number') document.seed = 1234;
  if (typeof document.projectId !== 'string') document.projectId = '';
  if (typeof document.createdAt !== 'number') document.createdAt = null;
  if (typeof document.version !== 'number') document.version = RECORDING_VERSION;

  return document;
}
