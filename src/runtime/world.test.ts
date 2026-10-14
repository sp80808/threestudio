import { describe, expect, it, vi } from 'vitest';
import {
  createEntity,
  createRule,
  createRuleAction,
  createRuleCondition,
  createVariable,
  type Entity,
  type Project,
} from '../simulation/schema';
import { createBehaviourInstance } from './behaviours';
import { createHarness } from './testHarness';
import { createWorld, MAX_EVENTS_PER_STEP } from './world';

function project(entities: Entity[], extra: Partial<Project> = {}): Project {
  return {
    id: 'p',
    version: 2,
    name: 'P',
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    variables: {},
    rules: [],
    settings: { stepRate: 60, gravity: -9.81, cameraFollow: false, maxStepsPerFrame: 5 },
    ...extra,
  };
}

describe('world lifecycle', () => {
  it('does nothing until the session starts', () => {
    const spin = createEntity({
      id: 'spin',
      name: 'spin',
      geometry: 'box',
      behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 90 })],
    });
    const world = createWorld({ project: project([spin]) });

    world.step(1);
    expect(world.getEntity('spin')?.rotation[1]).toBe(0);
    expect(world.isRunning()).toBe(false);

    world.start();
    for (let index = 0; index < 30; index += 1) world.step(1 / 60);
    // Half a second at 90°/s.
    expect(world.getEntity('spin')?.rotation[1]).toBeCloseTo(Math.PI / 4, 3);
  });

  it('fires scene-start rules immediately on start', () => {
    const lamp = createEntity({ id: 'lamp', name: 'lamp', geometry: 'sphere', visible: false });
    const scene = project([lamp], {
      variables: { on: createVariable('on', 'On', 'boolean', false) },
      rules: [
        createRule({
          id: 'start',
          name: 'Start',
          event: { type: 'scene-start', sourceEntityId: null, name: null, interval: null },
          actions: [
            createRuleAction('set-visible', { targetEntityId: 'lamp', value: true }),
            createRuleAction('set-variable', { property: 'on', value: true }),
          ],
        }),
      ],
    });
    const world = createWorld({ project: scene });

    world.start();

    expect(world.getEntity('lamp')?.visible).toBe(true);
    expect(world.getVariable('on')).toBe(true);
  });

  it('pauses, resumes and steps one frame at a time', () => {
    const spin = createEntity({
      id: 'spin',
      name: 'spin',
      geometry: 'box',
      behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 360 })],
    });
    const world = createWorld({ project: project([spin]) });
    world.start();
    world.step(1);
    const before = world.getEntity('spin')!.rotation[1];

    world.pause();
    world.step(1);
    expect(world.getEntity('spin')!.rotation[1]).toBe(before);

    world.resume();
    world.stepOnce();
    expect(world.getEntity('spin')!.rotation[1]).toBeGreaterThan(before);
  });

  it('restores the authored scene on stop and never mutates the document', () => {
    const gem = createEntity({
      id: 'gem',
      name: 'gem',
      geometry: 'sphere',
      position: [0, 0.5, 0],
      collider: { size: [1, 1, 1], isTrigger: true },
      behaviours: [createBehaviourInstance('collectible', { variableId: 'gems', hideWhenCollected: true })],
    });
    const player = createEntity({
      id: 'player',
      name: 'player',
      geometry: 'capsule',
      position: [0, 0.85, 4],
      collider: { size: [1, 1.7, 1] },
      behaviours: [createBehaviourInstance('character', { speed: 6, useGravity: false })],
    });
    const scene = project([gem, player], {
      variables: { gems: createVariable('gems', 'Gems', 'number', 0) },
    });
    const harness = createHarness(scene);
    harness.input.setAxis(0, 1);
    harness.run(1);

    expect(harness.world.getVariable('gems')).toBe(1);
    expect(harness.entity('gem').visible).toBe(false);
    expect(harness.entity('player').position[2]).toBeLessThan(4);

    harness.world.stop();

    expect(harness.world.getVariable('gems')).toBe(0);
    expect(harness.entity('gem').visible).toBe(true);
    expect(harness.entity('player').position).toEqual([0, 0.85, 4]);
    // The document itself was never touched.
    expect(scene.entities.player.transform.position).toEqual([0, 0.85, 4]);
    expect(scene.entities.gem.components.render?.visible).toBeUndefined();
  });

  it('caps how much simulated time a single frame may consume', () => {
    const spin = createEntity({
      id: 'spin',
      name: 'spin',
      geometry: 'box',
      behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 360 })],
    });
    const world = createWorld({ project: project([spin]) });
    world.start();

    // A five second hitch must not run 300 steps: play mode stays responsive and
    // reports the dropped time instead.
    world.step(5);

    expect(world.getStats().steps).toBeLessThanOrEqual(5);
    expect(world.getDiagnostics().some((diagnostic) => diagnostic.code === 'step-overflow')).toBe(true);
  });
});

describe('triggers', () => {
  it('emits enter and exit events and keeps overlaps queryable', () => {
    const pad = createEntity({
      id: 'pad',
      name: 'pad',
      geometry: 'box',
      collider: { size: [2, 2, 2], isTrigger: true },
    });
    const walker = createEntity({
      id: 'walker',
      name: 'walker',
      geometry: 'capsule',
      position: [0, 0, 4],
      collider: { size: [1, 1, 1] },
      behaviours: [
        createBehaviourInstance('character', { speed: 4, useGravity: false, turnToFaceMotion: false }),
      ],
    });
    const harness = createHarness(project([pad, walker]));
    const seen: string[] = [];
    harness.world.onEvent((event) => {
      if (event.type === 'trigger-enter' || event.type === 'trigger-exit') {
        seen.push(`${event.type}:${event.sourceEntityId}:${event.otherEntityId}`);
      }
    });

    // Walking 4 units/s from z = +4 reaches the pad at z ∈ [-1, 1] after ~0.8s.
    harness.input.setAxis(0, 1);
    harness.run(0.8);
    expect(seen).toContain('trigger-enter:pad:walker');
    expect(harness.world.getOverlaps('pad')).toEqual(['walker']);
    expect(harness.world.getOverlaps('walker')).toEqual(['pad']);

    harness.run(0.9);
    expect(seen).toContain('trigger-exit:pad:walker');
    expect(harness.world.getOverlaps('pad')).toEqual([]);
  });
});

describe('rules integration', () => {
  it('chains messages between objects within one step', () => {
    const switchBox = createEntity({
      id: 'switch',
      name: 'switch',
      geometry: 'box',
      collider: { size: [1, 1, 1], isTrigger: true },
      behaviours: [createBehaviourInstance('pressure-plate', { targetEntityId: '', message: 'open' })],
      rules: [
        createRule({
          id: 'switch-to-door',
          name: 'Switch to door',
          event: { type: 'custom', sourceEntityId: null, name: 'open', interval: null },
          actions: [createRuleAction('emit-event', { targetEntityId: 'door', property: 'open' })],
        }),
      ],
    });
    const door = createEntity({
      id: 'door',
      name: 'door',
      geometry: 'box',
      position: [0, 0, 0],
      collider: { size: [1, 2, 1] },
      behaviours: [createBehaviourInstance('door', { axis: 'y', distance: 2, duration: 0.5, autoClose: false })],
    });
    const walker = createEntity({
      id: 'walker',
      name: 'walker',
      geometry: 'capsule',
      position: [0, 0, 3],
      collider: { size: [1, 1, 1] },
      behaviours: [
        createBehaviourInstance('character', { speed: 4, useGravity: false, turnToFaceMotion: false }),
      ],
    });
    const harness = createHarness(project([switchBox, door, walker]));
    harness.input.setAxis(0, 1);

    harness.run(1.2);

    // Rule fired, message delivered, door started moving in the same session.
    expect(harness.world.getStats().ruleFirings).toBeGreaterThan(0);
    expect(harness.entity('door').position[1]).toBeGreaterThan(0);
  });

  it('reacts to variable changes', () => {
    const scene = project([createEntity({ id: 'a', name: 'a', geometry: 'box' })], {
      variables: {
        gems: createVariable('gems', 'Gems', 'number', 0),
        won: createVariable('won', 'Won', 'boolean', false),
      },
      rules: [
        createRule({
          id: 'win',
          name: 'Three gems',
          event: { type: 'variable-changed', sourceEntityId: null, name: 'Gems', interval: null },
          conditions: [createRuleCondition('variable-greater-than', { property: 'gems', value: 2 })],
          actions: [createRuleAction('set-variable', { property: 'won', value: true })],
        }),
      ],
    });
    const harness = createHarness(scene);

    harness.world.setVariable('gems', 2);
    harness.step();
    expect(harness.world.getVariable('won')).toBe(false);

    harness.world.setVariable('gems', 3);
    harness.step();
    expect(harness.world.getVariable('won')).toBe(true);
  });

  it('runs interval rules on schedule', () => {
    const lamp = createEntity({ id: 'lamp', name: 'lamp', geometry: 'sphere', visible: false });
    const scene = project([lamp], {
      rules: [
        createRule({
          id: 'blink',
          name: 'Every half second',
          event: { type: 'interval', sourceEntityId: null, name: null, interval: 0.5 },
          actions: [createRuleAction('set-visible', { targetEntityId: 'lamp', value: true })],
        }),
      ],
    });
    const harness = createHarness(scene);

    harness.run(0.4);
    expect(harness.entity('lamp').visible).toBe(false);

    harness.run(0.2);
    expect(harness.entity('lamp').visible).toBe(true);

    // Fires repeatedly, not just once.
    harness.entity('lamp').visible = false;
    harness.run(0.6);
    expect(harness.entity('lamp').visible).toBe(true);
  });

  it('fires once-only rules a single time', () => {
    const scene = project([createEntity({ id: 'a', name: 'a', geometry: 'box' })], {
      variables: { count: createVariable('count', 'Count', 'number', 0) },
      rules: [
        createRule({
          id: 'once',
          name: 'Once',
          once: true,
          event: { type: 'variable-changed', sourceEntityId: null, name: 'Count', interval: null },
          actions: [createRuleAction('change-variable', { property: 'count', value: 100 })],
        }),
      ],
    });
    const harness = createHarness(scene);

    harness.world.setVariable('count', 1);
    harness.run(0.1);
    expect(harness.world.getVariable('count')).toBe(101);

    harness.world.setVariable('count', 2);
    harness.run(0.1);
    expect(harness.world.getVariable('count')).toBe(2);
  });

  it('drops runaway event chains and reports them', () => {
    const pingPong = (id: string, other: string) =>
      createEntity({
        id,
        name: id,
        geometry: 'box',
        rules: [
          createRule({
            id: `${id}-relay`,
            name: 'Relay',
            event: { type: 'custom', sourceEntityId: null, name: 'ping', interval: null },
            actions: [createRuleAction('emit-event', { targetEntityId: other, property: 'ping' })],
          }),
        ],
      });
    const harness = createHarness(project([pingPong('a', 'b'), pingPong('b', 'a')]));

    harness.world.sendMessage('a', 'ping');
    harness.run(0.1);

    expect(harness.world.getStats().eventsProcessed).toBeLessThanOrEqual(MAX_EVENTS_PER_STEP * 2 + 4);
    expect(harness.world.getDiagnostics().some((diagnostic) => diagnostic.code === 'event-storm')).toBe(true);
  });
});

describe('determinism and sync', () => {
  it('produces identical results for identical seeds and input', () => {
    const build = () => {
      const player = createEntity({
        id: 'player',
        name: 'player',
        geometry: 'capsule',
        collider: { size: [1, 1, 1] },
        behaviours: [
          createBehaviourInstance('character', { speed: 5, useGravity: false, turnSpeed: 360 }),
        ],
      });
      const drone = createEntity({
        id: 'drone',
        name: 'drone',
        geometry: 'box',
        position: [0, 1, -4],
        behaviours: [createBehaviourInstance('patrol', { axis: 'x', distance: 4, speed: 3 })],
      });
      return project([player, drone]);
    };

    const runOnce = () => {
      const harness = createHarness(build(), { seed: 42 });
      harness.input.setAxis(1, 1);
      harness.run(1);
      return [
        harness.entity('player').position,
        harness.entity('player').rotation,
        harness.entity('drone').position,
      ];
    };

    expect(runOnce()).toEqual(runOnce());
  });

  it('adopts objects added during play and drops removed ones', () => {
    const existing = createEntity({ id: 'existing', name: 'existing', geometry: 'box' });
    const scene = project([existing]);
    const harness = createHarness(scene);
    harness.step();
    expect(harness.world.getEntity('newcomer')).toBeUndefined();

    const newcomer = createEntity({
      id: 'newcomer',
      name: 'newcomer',
      geometry: 'sphere',
      behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 360 })],
    });
    harness.world.syncFromProject(project([existing, newcomer]));
    harness.run(0.5);

    expect(harness.entity('newcomer').rotation[1]).toBeGreaterThan(0);

    harness.world.syncFromProject(project([newcomer]));
    expect(harness.world.getEntity('existing')).toBeUndefined();
    expect(harness.world.getEntity('newcomer')).toBeDefined();
  });

  it('notifies step listeners with statistics', () => {
    const spin = createEntity({
      id: 'spin',
      name: 'spin',
      geometry: 'box',
      behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 90 })],
    });
    const harness = createHarness(project([spin]));
    const onStep = vi.fn();
    harness.world.onStep(onStep);

    harness.run(0.5);

    expect(onStep).toHaveBeenCalledTimes(30);
    const stats = harness.world.getStats();
    expect(stats.steps).toBe(30);
    expect(stats.time).toBeCloseTo(0.5, 5);
    expect(stats.behaviourUpdates).toBe(30);
    expect(harness.world.getVariables()).toEqual({});
  });
});
