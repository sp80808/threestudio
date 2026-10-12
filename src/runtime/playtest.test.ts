/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the headless playtest runner in `tools/playtest.ts`.
 *
 * The runner is a workspace tool rather than runtime code, but its report is what
 * `npm run playtest` and CI act on, so its checks are asserted here too: every
 * shipped scene must play through cleanly, runs must be reproducible, and the
 * document mode must work on an exported file.
 */

import { describe, expect, it } from 'vitest';
import {
  createDocumentPlaytest,
  createReplayPlaytest,
  PLAYTEST_REGISTRY,
  runPlaytest,
} from '../../tools/playtest';
import { parseProject, serializeProject } from '../persistence/io';
import { createEmptyRecording } from './replay';
import { createDefaultProject, type Project } from '../simulation/schema';
import { createPlaygroundScene, createPressurePlateDoorScene } from '../simulation/scenarios';

function failedChecks(project: Project, seconds?: number) {
  const report = runPlaytest(createDocumentPlaytest(project, seconds), 1234);
  return { report, failed: report.checks.filter((check) => !check.ok) };
}

describe('playtest runner', () => {
  for (const playtest of PLAYTEST_REGISTRY) {
    it(`${playtest.id}: every check passes`, () => {
      const report = runPlaytest(playtest);

      const failures = report.checks
        .filter((check) => !check.ok)
        .map((check) => `${check.label} (${check.detail ?? 'no detail'})`);
      expect(failures.join('\n')).toBe('');
      expect(report.passed).toBe(true);
      expect(report.checks.length).toBeGreaterThan(4);
      expect(report.timeline.length).toBeGreaterThan(3);
      expect(report.steps).toBeGreaterThan(60);
    });
  }

  it('plays the same scene the same way twice with the same seed', () => {
    const first = runPlaytest(PLAYTEST_REGISTRY[0], 99);
    const second = runPlaytest(PLAYTEST_REGISTRY[0], 99);

    expect(second.variables).toEqual(first.variables);
    expect(second.timeline).toEqual(first.timeline);
    expect(second.steps).toBe(first.steps);
  });

  it('plays an exported document through import/export round-tripping', () => {
    const text = serializeProject(createPressurePlateDoorScene(), { pretty: true });
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);

    const report = runPlaytest(createDocumentPlaytest(parsed.project, 4), 1234);

    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => check.label)).toContain('the document loaded at least one behaviour');
  });

  it('records a pilot run and replays it back to the same result', () => {
    const recorded = runPlaytest(PLAYTEST_REGISTRY[0], 1234, { record: true });
    const recording = recorded.recording;
    if (!recording) throw new Error('the run did not produce a recording');

    expect(recording.frames.length).toBe(recorded.steps);
    expect(recording.projectId).toBe('scene-pressure-plate-door');
    expect(recording.stepRate).toBe(60);

    const replayed = runPlaytest(createReplayPlaytest(createPressurePlateDoorScene(), recording), 1234);

    // The replayed run ends in the same state: same length, same variables, no
    // warnings. (The timelines differ by their own narration, so the world
    // state is what is compared — `replay.test.ts` does the frame-by-frame
    // equality check.)
    expect(replayed.passed).toBe(true);
    expect(replayed.variables).toEqual(recorded.variables);
    expect(replayed.steps).toBe(recorded.steps);
    expect(replayed.replay).toMatchObject({ matchedDocument: true, frames: recorded.steps });
  });

  it('flags a recording that belongs to a different document', () => {
    const foreign = { ...createEmptyRecording({ projectId: 'some-other-scene' }), frames: [] };
    const report = runPlaytest(createReplayPlaytest(createPlaygroundScene(), foreign));

    const mismatch = report.checks.find((check) => check.label === 'the recording was made against this document');
    expect(mismatch?.ok).toBe(false);
    expect(mismatch?.detail).toContain('some-other-scene');
    expect(report.passed).toBe(false);
  });

  it('fails the report — with a readable reason — for a scene that has nothing to play', () => {
    const { report, failed } = failedChecks(createDefaultProject());

    expect(report.passed).toBe(false);
    expect(failed.map((check) => check.label)).toContain('the document loaded at least one object');
    expect(failed.every((check) => typeof check.detail === 'string' || check.detail === undefined)).toBe(true);
  });
});
