import { describe, expect, it } from 'vitest';
import { createEntity, createVariable, type Entity, type Project, type Rule } from '../simulation/schema';
import {
  createBehaviourInstance,
  getBehaviourDefaults,
  getBehaviourDefinition,
  listBehaviourDefinitions,
} from './behaviours';
import { createHarness } from './testHarness';

function project(entities: Entity[], rules: Rule[] = [], variables = {}): Project {
  return {
    id: 'test-project',
    version: 2,
    name: 'Test',
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
    variables,
    rules,
    settings: { stepRate: 60, gravity: -9.81, cameraFollow: false, maxStepsPerFrame: 5 },
  };
}

function box(id: string, overrides: Parameters<typeof createEntity>[0] = {}): Entity {
  return createEntity({ id, name: id, geometry: 'box', collider: { size: [1, 1, 1] }, ...overrides });
}

describe('behaviour registry', () => {
  it('ships a default for every declared parameter', () => {
    const definitions = listBehaviourDefinitions();
    expect(definitions.map((definition) => definition.type)).toEqual(
      expect.arrayContaining([
        'spin',
        'bob',
        'patrol',
        'orbit',
        'look-at',
        'follow',
        'character',
        'door',
        'pressure-plate',
        'collectible',
      ]),
    );

    for (const definition of definitions) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      const defaults = getBehaviourDefaults(definition.type);
      expect(Object.keys(defaults)).toHaveLength(definition.parameters.length);
      for (const parameter of definition.parameters) {
        expect(defaults).toHaveProperty(parameter.key, parameter.default);
      }
    }
  });

  it('creates instances from defaults plus overrides', () => {
    const instance = createBehaviourInstance('spin', { speed: 180 });
    expect(instance.type).toBe('spin');
    expect(instance.label).toBe('Spin');
    expect(instance.enabled).toBe(true);
    expect(instance.parameters).toMatchObject({ axis: 'y', speed: 180 });
  });

  it('returns undefined for unknown behaviour types', () => {
    expect(getBehaviourDefinition('from-the-future')).toBeUndefined();
    expect(getBehaviourDefaults('from-the-future')).toEqual({});
  });
});

describe('motion behaviours', () => {
  it('spins at the configured degrees per second', () => {
    const spinner = box('spinner', { behaviours: [createBehaviourInstance('spin', { axis: 'y', speed: 90 })] });
    const harness = createHarness(project([spinner]));

    harness.run(1);

    expect(harness.entity('spinner').rotation[1]).toBeCloseTo(Math.PI / 2, 2);
  });

  it('bobs around the authored position without drifting', () => {
    const bobber = box('bobber', {
      position: [2, 3, 4],
      behaviours: [createBehaviourInstance('bob', { axis: 'y', amplitude: 0.5, frequency: 1 })],
    });
    const harness = createHarness(project([bobber]));

    let highest = -Infinity;
    let lowest = Infinity;
    for (let step = 0; step < 60; step += 1) {
      harness.step();
      const y = harness.entity('bobber').position[1];
      highest = Math.max(highest, y);
      lowest = Math.min(lowest, y);
    }

    expect(highest).toBeCloseTo(3.5, 1);
    expect(lowest).toBeCloseTo(2.5, 1);
    // X and Z never move, and a full period returns to the start height.
    expect(harness.entity('bobber').position[0]).toBe(2);
    expect(harness.entity('bobber').position[2]).toBe(4);
    expect(harness.entity('bobber').position[1]).toBeCloseTo(3, 2);
  });

  it('patrols back and forth along an axis and stays inside its range', () => {
    const patroller = box('patroller', {
      position: [0, 0, 0],
      behaviours: [createBehaviourInstance('patrol', { axis: 'x', distance: 2, speed: 2, pauseSeconds: 0 })],
    });
    const harness = createHarness(project([patroller]));

    const samples: number[] = [];
    for (let step = 0; step < 240; step += 1) {
      harness.step();
      samples.push(harness.entity('patroller').position[0]);
    }

    expect(Math.max(...samples)).toBeLessThanOrEqual(2 + 1e-6);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(-1e-6);
    // The patrol must turn around instead of running to one end and stopping.
    expect(samples[samples.length - 1]).toBeLessThan(Math.max(...samples));
    expect(harness.entity('patroller').position[1]).toBe(0);
  });

  it('orbits a target at a fixed radius', () => {
    const centre = box('centre', { position: [0, 0, 0] });
    const orbiter = createEntity({
      id: 'orbiter',
      name: 'orbiter',
      geometry: 'sphere',
      position: [2, 1, 0],
      behaviours: [createBehaviourInstance('orbit', { targetEntityId: 'centre', radius: 2, speed: 90, height: 1 })],
    });
    const harness = createHarness(project([centre, orbiter]));

    // Start angle 0 places the orbiter at (0, height, radius).
    harness.step();
    const orbited = harness.entity('orbiter');
    expect(orbited.position[0]).toBeLessThan(0.1);
    expect(orbited.position[2]).toBeCloseTo(2, 2);
    expect(orbited.position[1]).toBeCloseTo(1, 5);

    // A quarter turn takes about a second at 90°/s.
    harness.run(1);
    const quarter = harness.entity('orbiter');
    expect(Math.hypot(quarter.position[0], quarter.position[2])).toBeCloseTo(2, 2);
    expect(quarter.position[0]).toBeCloseTo(2, 1);
    expect(Math.abs(quarter.position[2])).toBeLessThan(0.1);

    harness.run(1);
    const half = harness.entity('orbiter');
    expect(half.position[2]).toBeCloseTo(-2, 1);
  });

  it('turns to look at a target', () => {
    const target = box('target', { position: [5, 0, 0] });
    const watcher = box('watcher', {
      behaviours: [createBehaviourInstance('look-at', { targetEntityId: 'target', turnSpeed: 720 })],
    });
    const harness = createHarness(project([target, watcher]));

    harness.run(1);
    expect(harness.entity('watcher').rotation[1]).toBeCloseTo(Math.PI / 2, 2);
  });

  it('chases a target and stops at the configured distance', () => {
    const runner = box('runner', { position: [0, 0, 0] });
    const chaser = box('chaser', {
      position: [0, 0, 6],
      behaviours: [
        createBehaviourInstance('follow', {
          targetEntityId: 'runner',
          speed: 4,
          stopDistance: 1,
          faceTarget: true,
        }),
      ],
    });
    const harness = createHarness(project([runner, chaser]));

    harness.run(5);

    const chaserEntity = harness.entity('chaser');
    const distance = Math.hypot(chaserEntity.position[0], chaserEntity.position[2] - 6);
    expect(chaserEntity.position[2]).toBeGreaterThan(1);
    expect(chaserEntity.position[2]).toBeLessThanOrEqual(1 + 1e-3);
    expect(distance).toBeGreaterThanOrEqual(1);
  });
});

describe('character behaviour', () => {
  it('moves relative to the camera yaw at the configured speed', () => {
    const player = createEntity({
      id: 'player',
      name: 'player',
      geometry: 'capsule',
      collider: { size: [0.8, 1.6, 0.8] },
      behaviours: [
        createBehaviourInstance('character', {
          speed: 4,
          useGravity: false,
          turnToFaceMotion: false,
          relativeToCamera: true,
        }),
      ],
    });
    const harness = createHarness(project([player]));
    // `cameraYaw` matches three.js `camera.rotation.y`: a camera yawed +90° looks
    // down -X, so "forward" is -X in world space.
    harness.world.setCameraYaw(Math.PI / 2);
    harness.input.setAxis(0, 1);

    harness.run(1);

    const moved = harness.entity('player');
    expect(moved.position[0]).toBeCloseTo(-4, 1);
    expect(Math.abs(moved.position[2])).toBeLessThan(0.1);

    // At yaw 0 the same input walks down -Z, and the player's own yaw is ignored.
    const straight = createHarness(project([player]));
    straight.input.setAxis(0, 1);
    straight.run(1);
    expect(straight.entity('player').position[2]).toBeCloseTo(-4, 1);
  });

  it('falls under gravity, lands on the ground and can jump', () => {
    const ground = createEntity({
      id: 'ground',
      name: 'ground',
      geometry: 'plane',
      position: [0, -0.5, 0],
      scale: [20, 1, 20],
      collider: { size: [1, 1, 1] },
    });
    const player = createEntity({
      id: 'player',
      name: 'player',
      geometry: 'capsule',
      position: [0, 3, 0],
      collider: { size: [0.8, 1.6, 0.8] },
      behaviours: [
        createBehaviourInstance('character', { speed: 0, useGravity: true, jumpSpeed: 5, turnToFaceMotion: false }),
      ],
    });
    const harness = createHarness(project([ground, player]));

    harness.run(2);
    // 1.6-tall body resting on a floor whose top face is at y = 0.
    expect(harness.entity('player').position[1]).toBeCloseTo(0.8, 2);

    harness.input.pressKey('Space');
    harness.step();
    harness.run(0.2);
    expect(harness.entity('player').position[1]).toBeGreaterThan(1.2);

    harness.run(2);
    expect(harness.entity('player').position[1]).toBeCloseTo(0.8, 2);
  });

  it('turns to face the movement direction', () => {
    const player = createEntity({
      id: 'player',
      name: 'player',
      geometry: 'capsule',
      collider: { size: [0.8, 1.6, 0.8] },
      behaviours: [
        createBehaviourInstance('character', {
          speed: 4,
          useGravity: false,
          turnToFaceMotion: true,
          turnSpeed: 720,
        }),
      ],
    });
    const harness = createHarness(project([player]));
    harness.input.setAxis(1, 0);

    harness.run(0.5);

    const entity = harness.entity('player');
    expect(entity.position[0]).toBeGreaterThan(1);
    expect(entity.rotation[1]).toBeCloseTo(Math.PI / 2, 1);
  });

  it('is blocked by solid obstacles', () => {
    const player = createEntity({
      id: 'player',
      name: 'player',
      geometry: 'capsule',
      collider: { size: [1, 1, 1] },
      behaviours: [createBehaviourInstance('character', { speed: 6, useGravity: false })],
    });
    const wall = box('wall', { position: [4, 0, 0], collider: { size: [1, 4, 4] } });
    const harness = createHarness(project([player, wall]));
    harness.input.setAxis(1, 0);

    harness.run(2);

    expect(harness.entity('player').position[0]).toBeLessThanOrEqual(3.5);
    expect(harness.entity('player').position[0]).toBeGreaterThan(2.5);
  });
});

describe('door behaviour', () => {
  it('slides open on a message and closes again after the delay', () => {
    const door = box('door', {
      position: [0, 1.5, 0],
      collider: { size: [3, 3, 0.4] },
      behaviours: [
        createBehaviourInstance('door', { axis: 'y', distance: 3, duration: 0.5, autoClose: true, closeDelay: 1 }),
      ],
    });
    const harness = createHarness(project([door]));

    harness.world.sendMessage('door', 'open');
    harness.step();
    expect(harness.entity('door').position[1]).toBeGreaterThan(1.5);

    harness.run(0.6);
    expect(harness.entity('door').position[1]).toBeCloseTo(4.5, 2);
    // An open door stops blocking movement.
    expect(harness.entity('door').colliderEnabled).toBe(false);

    harness.run(1.8);
    expect(harness.entity('door').position[1]).toBeCloseTo(1.5, 2);
    expect(harness.entity('door').colliderEnabled).toBe(true);
  });

  it('ignores unrelated messages', () => {
    const door = box('door', {
      position: [0, 0, 0],
      behaviours: [createBehaviourInstance('door', { axis: 'y', distance: 2, duration: 0.5 })],
    });
    const harness = createHarness(project([door]));

    harness.world.sendMessage('door', 'chicken');
    harness.run(0.5);

    expect(harness.entity('door').position[1]).toBe(0);
  });
});

describe('pressure plate behaviour', () => {
  it('sends press and release messages for anything solid on top of it', () => {
    const received: string[] = [];
    const plate = createEntity({
      id: 'plate',
      name: 'plate',
      geometry: 'box',
      position: [0, 0.1, 0],
      collider: { size: [2, 0.4, 2], isTrigger: true },
      behaviours: [createBehaviourInstance('pressure-plate', { targetEntityId: '', sinkDepth: 0.1 })],
    });
    const walker = createEntity({
      id: 'walker',
      name: 'walker',
      geometry: 'capsule',
      position: [0, 1, 6],
      collider: { size: [0.9, 1.7, 0.9] },
      behaviours: [
        createBehaviourInstance('character', { speed: 6, useGravity: false, turnToFaceMotion: false }),
      ],
    });
    const harness = createHarness(project([plate, walker]));
    harness.world.onEvent((event) => {
      if (event.type === 'custom') received.push(`${event.name}`);
    });
    harness.input.setAxis(0, 1);

    harness.run(1.2);
    expect(received).toContain('open');
    // Visual feedback: the plate sinks while held down.
    expect(harness.entity('plate').position[1]).toBeLessThan(0.1);

    harness.input.setAxis(0, -1);
    harness.run(1.5);
    expect(received).toContain('close');
    expect(harness.entity('plate').position[1]).toBeCloseTo(0.1, 2);
  });

  it('can be configured to trigger only once', () => {
    const plate = createEntity({
      id: 'plate',
      name: 'plate',
      geometry: 'box',
      position: [0, 0.1, 0],
      collider: { size: [2, 0.4, 2], isTrigger: true },
      behaviours: [
        createBehaviourInstance('pressure-plate', { targetEntityId: '', oneShot: true }),
      ],
    });
    const walker = createEntity({
      id: 'walker',
      name: 'walker',
      geometry: 'capsule',
      position: [0, 1, 6],
      collider: { size: [0.9, 1.7, 0.9] },
      behaviours: [
        createBehaviourInstance('character', { speed: 6, useGravity: false, turnToFaceMotion: false }),
      ],
    });
    const harness = createHarness(project([plate, walker]));
    let presses = 0;
    harness.world.onEvent((event) => {
      if (event.type === 'custom' && event.name === 'open') presses += 1;
    });
    harness.input.setAxis(0, 1);

    harness.run(1.2);
    harness.input.setAxis(0, -1);
    harness.run(1.5);
    harness.input.setAxis(0, 1);
    harness.run(1.2);

    expect(presses).toBe(1);
    expect((harness.entity('plate').behaviours ?? [])[0].enabled).toBe(false);
  });
});

describe('collectible behaviour', () => {
  it('adds to a variable, hides itself and can respawn', () => {
    const player = createEntity({
      id: 'player',
      name: 'player',
      geometry: 'capsule',
      position: [0, 1, 4],
      collider: { size: [0.9, 1.7, 0.9] },
      behaviours: [
        createBehaviourInstance('character', { speed: 6, useGravity: false, turnToFaceMotion: false }),
      ],
    });
    const gem = createEntity({
      id: 'gem',
      name: 'gem',
      geometry: 'sphere',
      position: [0, 1, 0],
      collider: { size: [1, 1, 1], isTrigger: true },
      behaviours: [
        createBehaviourInstance('collectible', {
          variableId: 'gems',
          amount: 2,
          hideWhenCollected: true,
          respawnAfter: 1,
        }),
      ],
    });
    const harness = createHarness(
      project([player, gem], [], { gems: createVariable('gems', 'Gems', 'number', 0) }),
    );

    harness.input.setAxis(0, 1);
    harness.run(1);

    expect(harness.world.getVariable('gems')).toBe(2);
    expect(harness.entity('gem').visible).toBe(false);

    harness.input.setAxis(0, 0);
    harness.run(1.2);
    expect(harness.entity('gem').visible).toBe(true);
  });
});

describe('robustness', () => {
  it('disables unknown behaviours and reports a diagnostic instead of crashing', () => {
    const broken = box('broken', { behaviours: [createBehaviourInstance('spin', {}, 'Impostor')] });
    broken.behaviours = [
      { id: 'weird', type: 'does-not-exist', label: 'Weird', enabled: true, parameters: {} },
      ...(broken.behaviours ?? []),
    ];
    const harness = createHarness(project([broken]));

    harness.run(0.5);

    expect((harness.entity('broken').behaviours ?? [])[0].enabled).toBe(false);
    const diagnostics = harness.world.getDiagnostics();
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'unknown-behaviour')).toBe(true);
    // The healthy behaviour still ran.
    expect(harness.entity('broken').rotation[1]).toBeGreaterThan(0);
  });
});
