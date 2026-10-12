#!/usr/bin/env -S npx tsx
/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Headless playtest runner.
 *
 * Runs a scene through the real runtime — the same `createWorld` the editor
 * plays — steers the player with a scripted pilot, prints a timeline of what
 * changed and reports whether the scene behaved.
 *
 * Usage:
 *   npm run playtest                       # the acceptance scene
 *   npm run playtest -- playground         # another built-in scene
 *   npm run playtest -- --list             # available scenes
 *   npm run playtest -- --document scene.json --seconds 12
 *   npm run playtest -- --json             # machine-readable report
 *
 * Exits non-zero when a check fails or the runtime reports an error, so it can
 * be wired into CI exactly like a test suite.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseProject } from '../src/persistence/io';
import { createPlaygroundScene, createPressurePlateDoorScene } from '../src/simulation/scenarios';
import type { Project, Vec3 } from '../src/simulation/schema';
import { createHarness, type Harness } from '../src/runtime/testHarness';

export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

interface Snapshot {
  variables: Record<string, string>;
  entities: Record<string, { position: string; visible: boolean; collider: boolean; overlaps: string }>;
}

export interface Report {
  scenario: string;
  seed: number;
  steps: number;
  simulatedSeconds: number;
  passed: boolean;
  timeline: string[];
  checks: Check[];
  diagnostics: { level: string; message: string }[];
  variables: Record<string, string>;
}

/** A scripted pilot: where to walk, what to click, and what should happen. */
export interface Playtest {
  id: string;
  title: string;
  description: string;
  create(): Project;
  play(harness: Harness, recorder: Recorder): void;
}

// ---------------------------------------------------------------------------
// Recorder: turns raw state changes into a readable timeline.
//
// Consecutive changes to the same thing are coalesced into a single "hovering
// drone bobbed 2.3 → 1.9" span instead of one line per fixed step.
// ---------------------------------------------------------------------------

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

interface TimelineEvent {
  key: string;
  time: number;
  head: string;
  from: string;
  to: string;
}

interface TimelineSpan {
  key: string;
  start: number;
  end: number;
  head: string;
  /** Distinct values the recorded property took, in order. */
  values: string[];
}

/**
 * Two events about the same thing closer together than this are merged into a
 * single "hovering drone bobbed 2.30 → 1.90" span in the timeline.
 */
const MERGE_GAP_SECONDS = 0.5;

class Recorder {
  readonly checks: Check[] = [];

  private events: TimelineEvent[] = [];
  private previous: Snapshot;
  private time = 0;
  private step = 0;
  private notes = 0;

  constructor(
    readonly harness: Harness,
    readonly fixedStep: number,
  ) {
    this.previous = this.snapshot();
  }

  private snapshot(): Snapshot {
    const world = this.harness.world;
    const variables: Record<string, string> = {};
    for (const entry of world.getVariableEntries()) variables[entry.name] = String(entry.value);

    const entities: Snapshot['entities'] = {};
    for (const entity of world.getEntities()) {
      entities[entity.id] = {
        position: entity.position.map(round).join(', '),
        visible: entity.visible,
        collider: entity.colliderEnabled,
        overlaps: [...entity.overlaps].sort().join(' + '),
      };
    }
    return { variables, entities };
  }

  private change(key: string, head: string, from: string, to: string): void {
    this.events.push({ key, time: this.time, head, from, to });
  }

  /** A one-off line, such as what the pilot is trying to do next. */
  note(text: string): void {
    this.notes += 1;
    this.change(`note:${this.notes}`, text, '', '');
  }

  /** Records one fixed step, diffing the world against the previous step. */
  tick(): void {
    this.harness.step();
    this.step += 1;
    this.time += this.fixedStep;

    const current = this.snapshot();
    for (const [name, value] of Object.entries(current.variables)) {
      const before = this.previous.variables[name];
      if (before !== value) this.change(`variable:${name}:${value}`, `variable ${name}`, before, value);
    }
    for (const [id, entity] of Object.entries(current.entities)) {
      const before = this.previous.entities[id];
      if (!before) continue;
      const label = entityLabel(this.harness, id);
      if (before.position !== entity.position) {
        this.change(`position:${id}`, `${label} moved`, before.position, entity.position);
      }
      if (before.visible !== entity.visible) {
        this.change(`visible:${id}`, `${label} visible`, String(before.visible), String(entity.visible));
      }
      if (before.collider !== entity.collider) {
        this.change(`collider:${id}`, `${label} collision`, String(before.collider), String(entity.collider));
      }
      if (before.overlaps !== entity.overlaps) {
        this.change(
          `overlaps:${id}`,
          `${label} overlaps`,
          before.overlaps || 'nothing',
          entity.overlaps || 'nothing',
        );
      }
    }
    this.previous = current;
  }

  /** Records `seconds` of play, one fixed step at a time. */
  run(seconds: number): void {
    const steps = Math.max(1, Math.round(seconds / this.fixedStep));
    for (let index = 0; index < steps; index += 1) this.tick();
  }

  check(label: string, ok: boolean, detail?: string): boolean {
    this.checks.push({ label, ok, detail });
    return ok;
  }

  /** Simulation time in seconds. */
  get elapsed(): number {
    return this.time;
  }

  get steps(): number {
    return this.step;
  }

  /**
   * Collapses the raw per-step events into readable spans: events about the
   * same object that follow each other within `MERGE_GAP_SECONDS` become one
   * line covering the whole change, and everything is ordered by start time.
   */
  buildTimeline(): string[] {
    const byKey = new Map<string, TimelineEvent[]>();
    for (const event of this.events) {
      const list = byKey.get(event.key);
      if (list) list.push(event);
      else byKey.set(event.key, [event]);
    }

    const spans: TimelineSpan[] = [];
    for (const list of byKey.values()) {
      const first = list[0];
      let span: TimelineSpan = {
        key: first.key,
        start: first.time,
        end: first.time,
        head: first.head,
        values: first.from === first.to ? [first.to] : [first.from, first.to],
      };
      for (let index = 1; index < list.length; index += 1) {
        const event = list[index];
        if (event.time - span.end <= MERGE_GAP_SECONDS) {
          span.end = event.time;
          if (event.to !== span.values[span.values.length - 1]) span.values.push(event.to);
        } else {
          spans.push(span);
          span = {
            key: event.key,
            start: event.time,
            end: event.time,
            head: event.head,
            values: event.from === event.to ? [event.to] : [event.from, event.to],
          };
        }
      }
      spans.push(span);
    }

    return spans
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .map((span) => {
        const stamp =
          span.end - span.start > 0.05
            ? `t=${span.start.toFixed(2)}–${span.end.toFixed(2)}s`
            : `t=${span.start.toFixed(2)}s`;
        // Long runs of small changes (a walking player, a bobbing drone) are
        // collapsed to "start → … → end" so one line stays readable.
        const values =
          span.values.length > 3
            ? [span.values[0], span.values[span.values.length - 1]]
            : span.values;
        const value = values.length <= 1 ? '' : ` ${values.join(' → ')}`;
        return `  ${stamp.padEnd(18)} ${span.head}${value}`;
      });
  }
}

function entityLabel(harness: Harness, id: string): string {
  const name = harness.world.getEntity(id)?.name ?? id;
  return `${name} (${id})`;
}

// ---------------------------------------------------------------------------
// Pilot: drives the character around the world the way a player would.
// ---------------------------------------------------------------------------

interface Pilot {
  /** Walks towards a world-space point. Returns false if it could not get there. */
  walkTo(point: [number, number], options?: { tolerance?: number; maxSeconds?: number }): boolean;
  /** Clicks an entity, as the viewport does when the player clicks it. */
  click(entityId: string): void;
  still(): void;
}

function createPilot(recorder: Recorder, playerId = 'player'): Pilot {
  const harness = recorder.harness;
  const world = harness.world;

  const walkTo = (
    point: [number, number],
    { tolerance = 0.4, maxSeconds = 8 } = {},
  ): boolean => {
    const steps = Math.round(maxSeconds / recorder.fixedStep);
    let best = Number.POSITIVE_INFINITY;
    let stalled = 0;

    for (let index = 0; index < steps; index += 1) {
      const player = harness.entity(playerId);
      const dx = point[0] - player.position[0];
      const dz = point[1] - player.position[2];
      const distance = Math.hypot(dx, dz);
      if (distance <= tolerance) {
        harness.input.setAxis(0, 0);
        return true;
      }

      // Movement is camera-relative, so convert "walk towards the target" into a
      // key axis using the world's current yaw.
      const yaw = world.cameraYaw;
      const desired: Vec3 = [dx / distance, 0, dz / distance];
      const axisX = desired[0] * Math.cos(yaw) - desired[2] * Math.sin(yaw);
      const axisY = -desired[0] * Math.sin(yaw) - desired[2] * Math.cos(yaw);
      harness.input.setAxis(
        axisX >= 0.05 ? 1 : axisX <= -0.05 ? -1 : 0,
        axisY >= 0.05 ? 1 : axisY <= -0.05 ? -1 : 0,
      );

      recorder.tick();

      if (distance > best - 0.005) {
        stalled += 1;
        if (stalled > 120) {
          harness.input.setAxis(0, 0);
          recorder.note(`pilot gave up walking to (${point[0]}, ${point[1]}) — stuck ${distance.toFixed(2)}m away`);
          return false;
        }
      } else {
        stalled = 0;
        best = distance;
      }
    }

    harness.input.setAxis(0, 0);
    recorder.note(`pilot ran out of time walking to (${point[0]}, ${point[1]})`);
    return false;
  };

  return {
    walkTo,
    click: (entityId) => {
      harness.input.pick(entityId);
      recorder.tick();
    },
    still: () => harness.input.setAxis(0, 0),
  };
}

// ---------------------------------------------------------------------------
// Scenes under test.
// ---------------------------------------------------------------------------

const DOOR_UPRIGHT = 1.5;
const DOOR_OPEN = 4.5;
const PLATE: [number, number] = [1.6, 4.6];
const GEMS: [number, number][] = [
  [0, -3],
  [1.6, -4.8],
  [-1.6, -4.8],
];

const PRESSURE_PLATE_DOOR_PLAYTEST: Playtest = {
  id: 'pressure-plate-door',
  title: 'Pressure Plate Door',
  description: 'The project acceptance scenario: press the plate, open the door, collect the gems.',
  create: createPressurePlateDoorScene,
  play: (harness, recorder) => {
    const pilot = createPilot(recorder);
    const door = () => harness.entity('door-main');

    recorder.note('pilot walks towards the pressure plate');
    pilot.walkTo(PLATE);
    recorder.run(0.5);

    recorder.check(
      'the plate reports the player standing on it',
      harness.world.getOverlaps('plate-main').includes('player'),
      `overlaps = [${harness.world.getOverlaps('plate-main').join(', ')}]`,
    );
    recorder.check(
      'the door slid open',
      door().position[1] > DOOR_UPRIGHT + 1,
      `door y = ${door().position[1].toFixed(2)}m`,
    );
    recorder.check(
      'the open door no longer blocks movement',
      door().colliderEnabled === false,
      `colliderEnabled = ${door().colliderEnabled}`,
    );
    recorder.run(1);
    recorder.check(
      'the door reaches its open position',
      Math.abs(door().position[1] - DOOR_OPEN) < 0.2,
      `door y = ${door().position[1].toFixed(2)}m`,
    );

    recorder.note('pilot walks through the doorway');
    const through = pilot.walkTo([0, -0.5]);
    recorder.run(0.3);
    recorder.check('the pilot walked through the doorway', through);

    for (const [index, point] of GEMS.entries()) {
      recorder.note(`pilot goes for gem ${index + 1}`);
      const reached = pilot.walkTo(point, { tolerance: 0.6, maxSeconds: 6 });
      recorder.run(0.3);
      recorder.check(
        `gem ${index + 1} was reached`,
        reached,
        `player at [${harness.entity('player').position.map(round).join(', ')}]`,
      );
      recorder.check(`gem ${index + 1} was collected`, !harness.entity(`gem-${index + 1}`).visible);
    }

    const variables = harness.world.getVariables();
    recorder.check('every gem is counted', variables.Gems === 3, `Gems = ${String(variables.Gems)}`);
    recorder.check(
      'the "all gems found" flag turned on',
      variables['All gems found'] === true,
      `All gems found = ${String(variables['All gems found'])}`,
    );
    recorder.check(
      'the portal is revealed',
      harness.entity('portal').visible,
      `portal visible = ${harness.entity('portal').visible}`,
    );

    recorder.note('pilot waits for the door to close itself');
    pilot.still();
    recorder.run(6);
    recorder.check(
      'the door closed again',
      Math.abs(door().position[1] - DOOR_UPRIGHT) < 0.2,
      `door y = ${door().position[1].toFixed(2)}m`,
    );
    recorder.check(
      'the closed door blocks movement again',
      door().colliderEnabled === true,
      `colliderEnabled = ${door().colliderEnabled}`,
    );

    recorder.note('pilot tries to walk back through the shut door');
    pilot.walkTo([0, 0.5], { maxSeconds: 4 });
    pilot.still();
    recorder.run(0.5);
    const playerZ = harness.entity('player').position[2];
    recorder.check(
      'the shut door keeps the player out',
      playerZ < -0.4,
      `player z = ${playerZ.toFixed(2)}m (the doorway is at z = 0)`,
    );
  },
};

const PLAYGROUND_PLAYTEST: Playtest = {
  id: 'playground',
  title: 'Playground',
  description: 'Sandbox for clicks, chasing enemies, orbiting props and variables.',
  create: createPlaygroundScene,
  play: (harness, recorder) => {
    const pilot = createPilot(recorder);

    recorder.note('pilot clicks the clickable object three times');
    for (let click = 0; click < 3; click += 1) pilot.click('clickable');

    const variables = harness.world.getVariables();
    recorder.check('three clicks are counted', variables.Clicks === 3, `Clicks = ${String(variables.Clicks)}`);
    recorder.check(
      'the lamp switches on after three clicks',
      harness.entity('lamp').visible,
      `lamp visible = ${harness.entity('lamp').visible}`,
    );

    recorder.note('pilot walks to the far corner of the playground');
    const start = [...harness.entity('player').position] as Vec3;
    const arrived = pilot.walkTo([6, 6], { maxSeconds: 6 });
    const travelled = Math.hypot(
      harness.entity('player').position[0] - start[0],
      harness.entity('player').position[2] - start[2],
    );
    recorder.check('the player walks where the keys point', arrived || travelled > 4, `travelled ${travelled.toFixed(2)}m`);

    recorder.note('pilot stands still and lets the chaser come closer');
    pilot.still();
    recorder.run(3);

    const chaser = harness.entity('chaser');
    const player = harness.entity('player');
    const distance = Math.hypot(
      chaser.position[0] - player.position[0],
      chaser.position[2] - player.position[2],
    );
    recorder.check('the chaser closes in on the player', distance < 6, `distance = ${distance.toFixed(2)}m`);
    recorder.check(
      'rules fired (clicks and catches)',
      harness.world.getStats().ruleFirings > 0,
      `ruleFirings = ${harness.world.getStats().ruleFirings}`,
    );
  },
};

export const PLAYTEST_REGISTRY: Playtest[] = [PRESSURE_PLATE_DOOR_PLAYTEST, PLAYGROUND_PLAYTEST];

/** Wanders around an imported document; only checks that the runtime stays clean. */
export function createDocumentPlaytest(project: Project, seconds = 15): Playtest {
  return {
    id: project.id || 'document',
    title: project.name || 'Imported document',
    description: 'Runs an imported document with no expectations beyond a clean runtime.',
    create: () => project,
    play: (harness, recorder) => {
      const pilot = createPilot(recorder);
      const landmarks = harness.world.getEntities().filter((entity) => entity.id !== 'player');
      const budget = Math.max(1, seconds) / Math.max(1, Math.min(landmarks.length, 6) + 1);

      for (const landmark of landmarks.slice(0, 6)) {
        recorder.note(`pilot walks to ${landmark.name}`);
        pilot.walkTo([landmark.position[0], landmark.position[2]], { maxSeconds: budget });
      }
      recorder.run(Math.max(1, seconds) / 4);

      const runtime = harness.world.getEntities().filter((entity) => entity.behaviours.length > 0);
      recorder.check('the document loaded at least one object', landmarks.length > 0, `${landmarks.length} objects`);
      recorder.check(
        'the document loaded at least one behaviour',
        runtime.length > 0,
        `${runtime.length} objects with behaviours`,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Runner and CLI.
// ---------------------------------------------------------------------------

export function runPlaytest(playtest: Playtest, seed = 1234): Report {
  const project = playtest.create();
  const harness = createHarness(project, { seed });
  const recorder = new Recorder(harness, 1 / (project.settings?.stepRate ?? 60));

  playtest.play(harness, recorder);

  const diagnostics = harness.world
    .getDiagnostics()
    .filter((diagnostic) => diagnostic.level === 'error' || diagnostic.level === 'warning')
    .map((diagnostic) => ({ level: diagnostic.level, message: diagnostic.message }));

  const variables: Record<string, string> = {};
  for (const entry of harness.world.getVariableEntries()) variables[entry.name] = String(entry.value);

  const checks = [...recorder.checks];
  if (checks.length === 0) {
    checks.push({ label: 'the playtest made at least one assertion', ok: false });
  }
  checks.push({
    label: 'the runtime reported no errors or warnings',
    ok: diagnostics.length === 0,
    detail: diagnostics.length ? diagnostics.map((item) => `${item.level}: ${item.message}`).join('; ') : undefined,
  });

  return {
    scenario: playtest.id,
    seed,
    steps: recorder.steps,
    simulatedSeconds: Number(recorder.elapsed.toFixed(2)),
    passed: checks.every((check) => check.ok),
    timeline: recorder.buildTimeline(),
    checks,
    diagnostics,
    variables,
  };
}

function printReport(report: Report, options: { timeline: boolean; maxLines: number }): void {
  console.log(
    `\n${report.passed ? 'PASS' : 'FAIL'}  ${report.scenario}  ` +
      `(${report.steps} steps, ${report.simulatedSeconds}s simulated, seed ${report.seed})`,
  );

  if (options.timeline && report.timeline.length > 0) {
    console.log('\nTimeline');
    const lines = report.timeline;
    if (lines.length <= options.maxLines) {
      for (const line of lines) console.log(line);
    } else {
      const head = Math.floor(options.maxLines / 2);
      const tail = options.maxLines - head;
      for (const line of lines.slice(0, head)) console.log(line);
      console.log(`  … ${lines.length - options.maxLines} more lines (--timeline=<n> to raise the limit) …`);
      for (const line of lines.slice(-tail)) console.log(line);
    }
  }

  console.log('\nChecks');
  for (const item of report.checks) {
    const detail = item.detail ? ` (${item.detail})` : '';
    console.log(`  ${item.ok ? 'ok  ' : 'FAIL'}  ${item.label}${detail}`);
  }

  console.log('\nVariables');
  const entries = Object.entries(report.variables);
  if (entries.length === 0) console.log('  (none)');
  for (const [name, value] of entries) console.log(`  ${name} = ${value}`);

  if (!report.passed) console.log(`\n${report.checks.filter((check) => !check.ok).length} check(s) failed.`);
}

function main(): void {
  const args = process.argv.slice(2);
  const flags = args.filter((argument) => argument.startsWith('--'));
  const positional = args.filter((argument) => !argument.startsWith('--'));
  const valueOf = (name: string): string | null => {
    const inline = flags.find((flag) => flag.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = args.indexOf(`--${name}`);
    if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
    return null;
  };
  const has = (name: string) =>
    flags.some((flag) => flag === `--${name}` || flag.startsWith(`--${name}=`));

  if (flags.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'ThreeStudio playtest runner',
        '',
        'Usage: npm run playtest -- [scenario] [options]',
        '',
        'Scenarios:',
        ...PLAYTEST_REGISTRY.map((playtest) => `  ${playtest.id.padEnd(22)} ${playtest.description}`),
        '',
        'Options:',
        '  --list                 list the scenarios and exit',
        '  --document <path>      play an exported .json document instead',
        '  --seconds <n>          walking budget for --document (default 15)',
        '  --seed <n>             random seed (default 1234)',
        '  --json                 print the report as JSON',
        '  --timeline=<n>         maximum timeline lines to print (default 60)',
        '  --no-timeline          print the checks only',
      ].join('\n'),
    );
    return;
  }

  if (has('list')) {
    for (const playtest of PLAYTEST_REGISTRY) {
      console.log(`${playtest.id.padEnd(22)} ${playtest.title} — ${playtest.description}`);
    }
    return;
  }

  const seed = Number.parseInt(valueOf('seed') ?? '1234', 10);
  const documentPath = valueOf('document');
  let playtest: Playtest;

  if (documentPath) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), documentPath), 'utf8');
    } catch (error) {
      console.error(`Could not read ${documentPath}: ${(error as Error).message}`);
      process.exitCode = 1;
      return;
    }
    const result = parseProject(text);
    if (!result.ok) {
      console.error(`Could not load ${documentPath}: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    if (result.migratedFrom !== null) {
      console.log(`(migrated ${documentPath} from document version ${result.migratedFrom})`);
    }
    const seconds = Number.parseInt(valueOf('seconds') ?? '15', 10) || 15;
    playtest = createDocumentPlaytest(result.project, seconds);
  } else {
    const id = positional[0] ?? PRESSURE_PLATE_DOOR_PLAYTEST.id;
    const found = PLAYTEST_REGISTRY.find((candidate) => candidate.id === id);
    if (!found) {
      console.error(`Unknown scenario "${id}". Try --list.`);
      process.exitCode = 1;
      return;
    }
    playtest = found;
  }

  const report = runPlaytest(playtest, Number.isFinite(seed) ? seed : 1234);
  if (has('json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const timelineFlag = valueOf('timeline');
    console.log(`\nThreeStudio playtest — ${playtest.title}`);
    printReport(report, {
      timeline: !has('no-timeline'),
      maxLines: timelineFlag ? Number.parseInt(timelineFlag, 10) || 60 : 60,
    });
  }
  if (!report.passed) process.exitCode = 1;
}

// Only run when invoked as a script: `src/runtime/playtest.test.ts` imports this
// module to exercise the runner from the test suite.
const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (invokedDirectly) main();
