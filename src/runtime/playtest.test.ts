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
import { createDocumentPlaytest, PLAYTEST_REGISTRY, runPlaytest } from '../../tools/playtest';
import { parseProject, serializeProject } from '../persistence/io';
import { createDefaultProject, type Project } from '../simulation/schema';
import { createPressurePlateDoorScene } from '../simulation/scenarios';

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

  it('fails the report — with a readable reason — for a scene that has nothing to play', () => {
    const { report, failed } = failedChecks(createDefaultProject());

    expect(report.passed).toBe(false);
    expect(failed.map((check) => check.label)).toContain('the document loaded at least one object');
    expect(failed.every((check) => typeof check.detail === 'string' || check.detail === undefined)).toBe(true);
  });
});
