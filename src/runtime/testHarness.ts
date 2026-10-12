/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Test harness for the game runtime.
 *
 * Not a `*.test.ts` file so it can be shared by every suite without being
 * collected as a test itself.
 */

import type { Behaviour, ColliderComponent, Project, Vec3 } from '../simulation/schema';
import { createScriptedInput, type ScriptedInput } from './input';
import {
  createRecordingInput,
  createReplayInput,
  type Recording,
  type RecordingInput,
  type ReplayInput,
} from './replay';
import type { RuntimeEntity } from './types';
import { createWorld, type World } from './world';

/** Anything that can drive a fixed-step world: a harness, or a replay runner. */
export interface StepSource {
  world: World;
  /** Runs `count` fixed steps (defaults to one). */
  step(count?: number): void;
}

export interface Harness extends StepSource {
  world: World;
  input: ScriptedInput;
  /** Runs `count` fixed steps (defaults to one). */
  step(count?: number): void;
  /** Runs `seconds` of simulated time. */
  run(seconds: number): void;
  entity(id: string): RuntimeEntity;
}

export function createHarness(
  project: Project,
  options: { seed?: number; autoStart?: boolean } = {},
): Harness {
  const input = createScriptedInput();
  const world = createWorld({ project, input, seed: options.seed ?? 1234 });
  const fixedStep = 1 / (project.settings?.stepRate ?? 60);

  if (options.autoStart !== false) world.start();

  const step = (count = 1) => {
    if (!world.isRunning()) throw new Error('The session is not running: call world.start() first');
    for (let index = 0; index < count; index += 1) world.step(fixedStep);
  };

  return {
    world,
    input,
    step,
    run: (seconds) => step(Math.max(1, Math.round(seconds / fixedStep))),
    entity: (id) => {
      const entity = world.getEntity(id);
      if (!entity) throw new Error(`No runtime entity "${id}"`);
      return entity;
    },
  };
}

export interface RecordingHarness extends Harness {
  /** The wrapper that captures the scripted input, one frame per fixed step. */
  recording: RecordingInput;
}

/**
 * Like `createHarness`, but records every fixed step so the run can be replayed
 * later (see `createReplayHarness`).
 */
export function createRecordingHarness(
  project: Project,
  options: { seed?: number; autoStart?: boolean } = {},
): RecordingHarness {
  const input = createScriptedInput();
  const recording = createRecordingInput(input);
  const world = createWorld({ project, input: recording, seed: options.seed ?? 1234 });
  const fixedStep = 1 / (project.settings?.stepRate ?? 60);

  if (options.autoStart !== false) world.start();
  recording.start();

  return {
    world,
    input,
    recording,
    step: (count = 1) => {
      if (!world.isRunning()) throw new Error('The session is not running: call world.start() first');
      for (let index = 0; index < count; index += 1) world.step(fixedStep);
    },
    run: (seconds) => {
      const steps = Math.max(1, Math.round(seconds / fixedStep));
      for (let index = 0; index < steps; index += 1) world.step(fixedStep);
    },
    entity: (id) => {
      const entity = world.getEntity(id);
      if (!entity) throw new Error(`No runtime entity "${id}"`);
      return entity;
    },
  };
}

export interface ReplayHarness extends StepSource {
  world: World;
  /** The recording cursor, for progress reporting and end-of-replay checks. */
  replayed: ReplayInput;
}

/**
 * Runs a recorded session against a document.
 *
 * The recording supplies the input frames; everything else (document, seed,
 * step rate) must match the session the recording came from for the run to
 * reproduce it.
 */
export function createReplayHarness(
  project: Project,
  recording: Recording,
  options: { seed?: number; autoStart?: boolean } = {},
): ReplayHarness {
  const replayed = createReplayInput(recording);
  const world = createWorld({ project, input: replayed, seed: options.seed ?? recording.seed });
  const fixedStep = 1 / (project.settings?.stepRate ?? recording.stepRate ?? 60);

  if (options.autoStart !== false) world.start();

  return {
    world,
    replayed,
    step: (count = 1) => {
      if (!world.isRunning()) throw new Error('The session is not running: call world.start() first');
      for (let index = 0; index < count; index += 1) world.step(fixedStep);
    },
  };
}

export interface RuntimeEntityInit {
  id?: string;
  name?: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  collider?: { size: Vec3; isTrigger?: boolean; shape?: 'box' | 'sphere' } | null;
  behaviours?: Behaviour[];
  visible?: boolean;
  enabled?: boolean;
  tags?: string[];
}

export function makeRuntimeEntity(init: RuntimeEntityInit = {}): RuntimeEntity {
  const collider: ColliderComponent | null = init.collider
    ? {
        type: 'collider',
        shape: init.collider.shape ?? 'box',
        size: init.collider.size,
        isTrigger: init.collider.isTrigger ?? false,
      }
    : null;
  const position = init.position ?? [0, 0, 0];

  return {
    id: init.id ?? 'entity-1',
    name: init.name ?? 'Entity',
    parentId: null,
    position: [...position],
    rotation: init.rotation ?? [0, 0, 0],
    scale: init.scale ?? [1, 1, 1],
    render: null,
    collider,
    colliderEnabled: true,
    visible: init.visible ?? true,
    enabled: init.enabled ?? true,
    tags: init.tags ?? [],
    behaviours: init.behaviours ?? [],
    rules: [],
    state: new Map(),
    overlaps: new Set(),
    initialPosition: [...position],
    initialRotation: [0, 0, 0],
    initialScale: [1, 1, 1],
    initialVisible: init.visible ?? true,
    initialEnabled: init.enabled ?? true,
    order: 0,
  };
}
