/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Record & replay tests.
 *
 * The property that matters for a game engine is that a recorded session
 * reproduces itself: same document, same seed, same frames — same world state
 * and the same events, frame by frame.
 */

import { describe, expect, it } from 'vitest';
import { createReplayInput, createRecordingInput, createEmptyRecording } from './replay';
import { createScriptedInput, type ScriptedInput } from './input';
import { parseRecording, serializeRecording } from '../persistence/recording';
import { createPressurePlateDoorScene, createPlaygroundScene } from '../simulation/scenarios';
import { createHarness } from './testHarness';
import { createWorld } from './world';

/** Plays the door scene the way a player would: walk to the plate, then wait. */
function pilotScript(input: ScriptedInput, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    if (step === 0) input.setAxis(1, 1);
    if (step === 20) input.pick('plate-main');
    if (step === 60) input.setAxis(0, 0);
    if (step === 90) input.pressKey('Space');
  }
}

function snapshot(world: ReturnType<typeof createHarness>['world']) {
  return {
    variables: world.getVariables(),
    time: Number(world.time.toFixed(6)),
    entities: world.getEntities().map((entity) => ({
      id: entity.id,
      position: entity.position.map((value) => Number(value.toFixed(6))),
      rotation: entity.rotation.map((value) => Number(value.toFixed(6))),
      visible: entity.visible,
      colliderEnabled: entity.colliderEnabled,
      overlaps: [...entity.overlaps].sort(),
    })),
    stats: world.getStats(),
  };
}

describe('input recording', () => {
  it('captures one frame per fixed step', () => {
    const source = createScriptedInput();
    const recording = createRecordingInput(source);
    recording.start();

    for (let step = 0; step < 10; step += 1) {
      if (step === 3) source.pick('somewhere');
      if (step === 5) source.pressKey('Space');
      source.setAxis(step < 5 ? 1 : 0, 1);
      recording.getPressedKeys();
      recording.getHeldKeys();
      recording.takePointerPicks();
      recording.endStep();
    }

    expect(recording.frames).toHaveLength(10);
    expect(recording.frames[0].axis).toEqual({ x: 1, y: 1 });
    expect(recording.frames[3].picks).toEqual([{ entityId: 'somewhere', point: [0, 0, 0] }]);
    expect(recording.frames[5].pressed).toEqual(['Space']);
    expect(recording.frames[5].held).toEqual(['Space']);
    expect(recording.frames[9].axis).toEqual({ x: 0, y: 1 });
  });

  it('records nothing until it is started and stops when told to', () => {
    const source = createScriptedInput();
    const recording = createRecordingInput(source);

    source.setAxis(1, 0);
    recording.takePointerPicks();
    recording.endStep();
    expect(recording.frames).toHaveLength(0);

    recording.start();
    recording.takePointerPicks();
    recording.endStep();
    expect(recording.frames).toHaveLength(1);
    expect(recording.isRecording).toBe(true);

    recording.stop();
    recording.endStep();
    expect(recording.frames).toHaveLength(1);
    expect(recording.isRecording).toBe(false);
  });

  it('stops recording at the frame limit without breaking the session', () => {
    const source = createScriptedInput();
    const recording = createRecordingInput(source, { limit: 3 });
    recording.start();

    for (let step = 0; step < 6; step += 1) {
      recording.takePointerPicks();
      recording.endStep();
    }

    expect(recording.frames).toHaveLength(3);
    expect(recording.isRecording).toBe(false);
  });

  it('hands each recorded pick out once per step', () => {
    const source = createScriptedInput();
    const recording = createRecordingInput(source);
    recording.start();
    source.pick('a');
    recording.takePointerPicks();
    recording.endStep();

    const replay = createReplayInput({ ...createEmptyRecording(), frames: recording.frames });
    expect(replay.takePointerPicks()).toEqual([{ entityId: 'a', point: [0, 0, 0] }]);
    expect(replay.takePointerPicks()).toEqual([]);
    replay.endStep();
    expect(replay.isFinished).toBe(true);
    expect(replay.takePointerPicks()).toEqual([]);
  });
});

describe('replay', () => {
  it('reproduces a recorded session frame for frame', () => {
    const project = createPressurePlateDoorScene();

    // 1. Record a run driven by the live scripted input.
    const source = createScriptedInput();
    const recordingInput = createRecordingInput(source);
    const recorded = createWorld({ project, input: recordingInput, seed: 7 });
    recordingInput.start();
    recorded.start();
    for (let step = 0; step < 200; step += 1) {
      pilotScript(source, step + 1);
      recorded.step(1 / 60);
    }
    const expected = snapshot(recorded);

    expect(recordingInput.frames.length).toBe(200);

    // 2. Replay those frames into a fresh world.
    const replayInput = createReplayInput({ ...createEmptyRecording(), frames: recordingInput.frames });
    const replayed = createWorld({ project, input: replayInput, seed: 7 });
    replayed.start();
    for (let step = 0; step < 200; step += 1) replayed.step(1 / 60);

    expect(snapshot(replayed)).toEqual(expected);
    expect(replayInput.isFinished).toBe(true);
  });

  it('survives a round trip through JSON', () => {
    const project = createPressurePlateDoorScene();
    const source = createScriptedInput();
    const recordingInput = createRecordingInput(source);
    const world = createWorld({ project, input: recordingInput, seed: 3 });
    recordingInput.start();
    world.start();
    for (let step = 0; step < 120; step += 1) {
      pilotScript(source, step + 1);
      world.step(1 / 60);
    }

    const document = {
      ...createEmptyRecording({ stepRate: 60, seed: 3, projectId: project.id, createdAt: 1234 }),
      frames: recordingInput.frames,
    };
    const text = serializeRecording(document, { pretty: true });
    const parsed = parseRecording(text);
    if (!parsed.ok) throw new Error(parsed.error);

    const replayInput = createReplayInput(parsed.recording);
    const replayed = createWorld({ project, input: replayInput, seed: parsed.recording.seed });
    replayed.start();
    for (let step = 0; step < 120; step += 1) replayed.step(1 / 60);

    expect(snapshot(replayed)).toEqual(snapshot(world));
    expect(parsed.migratedFrom).toBeNull();
  });

  it('replays clicks as gameplay input', () => {
    const project = createPlaygroundScene();
    const source = createScriptedInput();
    const recordingInput = createRecordingInput(source);
    const world = createWorld({ project, input: recordingInput, seed: 1 });
    recordingInput.start();
    world.start();

    for (let step = 0; step < 10; step += 1) {
      if (step === 2) source.pick('clickable');
      world.step(1 / 60);
    }

    const replayInput = createReplayInput({ ...createEmptyRecording(), frames: recordingInput.frames });
    const replayed = createWorld({ project, input: replayInput, seed: 1 });
    replayed.start();
    for (let step = 0; step < 10; step += 1) replayed.step(1 / 60);

    expect(replayed.getVariables()).toEqual(world.getVariables());
    expect(world.getVariables()).toMatchObject({ Clicks: 1, 'Last clicked': 'Click me' });
  });
});

describe('recording documents', () => {
  it('reports a readable error for broken input', () => {
    expect(parseRecording('not json')).toMatchObject({ ok: false });
    const result = parseRecording(JSON.stringify({ version: 1, frames: [{ axis: { x: 'left', y: 0 } }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/axis\.x|Invalid recording/);
  });

  it('fills in fields older recordings did not have', () => {
    const legacy = JSON.stringify({
      version: 1,
      frames: [{ axis: { x: 1, y: 0 }, pressed: ['Space'], picks: [] }],
    });
    const result = parseRecording(legacy);
    if (!result.ok) throw new Error(result.error);

    expect(result.recording.frames[0]).toMatchObject({
      axis: { x: 1, y: 0 },
      pressed: ['Space'],
      held: ['Space'],
      picks: [],
    });
    expect(result.recording.stepRate).toBe(60);
    expect(result.recording.seed).toBe(1234);
  });
});
