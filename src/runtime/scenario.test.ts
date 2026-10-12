import { describe, expect, it } from 'vitest';
import { ProjectSchema } from '../simulation/schema';
import {
  SCENE_TEMPLATES,
  createPlaygroundScene,
  createPressurePlateDoorScene,
  createSceneTemplate,
} from '../simulation/scenarios';
import { createHarness } from './testHarness';

/**
 * End-to-end acceptance tests for the shipped scenes.
 *
 * `docs/PROTOTYPE_STRATEGY.md` calls out the Pressure Plate Door scenario as the
 * gate every prototype must pass, so it is covered here as a play-through rather
 * than as a set of unit tests.
 */
describe('scene templates', () => {
  it('every template is a valid document', () => {
    for (const template of SCENE_TEMPLATES) {
      const result = ProjectSchema.safeParse(template.create());
      if (!result.success) {
        throw new Error(`${template.id} is invalid: ${JSON.stringify(result.error.issues, null, 2)}`);
      }
    }
  });

  it('falls back to the tutorial scene for unknown ids', () => {
    expect(createSceneTemplate('nope').id).toBe(createPressurePlateDoorScene().id);
  });
});

describe('Pressure Plate Door scene', () => {
  it('starts shut with the portal hidden', () => {
    const harness = createHarness(createPressurePlateDoorScene());

    expect(harness.world.getVariables()).toEqual({ Gems: 0, 'All gems found': false });
    expect(harness.entity('door-main').position[1]).toBeCloseTo(1.5, 5);
    expect(harness.entity('door-main').colliderEnabled).toBe(true);
    expect(harness.entity('portal').visible).toBe(false);

    harness.run(2);

    // Nothing happens until the player does something.
    expect(harness.entity('door-main').position[1]).toBeCloseTo(1.5, 5);
    expect(harness.world.getVariables()).toMatchObject({ Gems: 0 });
  });

  it('opens the door when the player walks onto the plate and closes it after', () => {
    const harness = createHarness(createPressurePlateDoorScene());
    const door = () => harness.entity('door-main');

    // Walk north-east until the plate under the player's feet is pressed, then
    // stand still: the plate is what holds the door open.
    harness.input.setAxis(1, 1);
    let steps = 0;
    while (harness.world.getOverlaps('plate-main').length === 0 && steps < 120) {
      harness.step();
      steps += 1;
    }
    expect(harness.world.getOverlaps('plate-main')).toContain('player');
    harness.input.setAxis(0, 0);

    harness.run(1);
    // Fully open: above the doorway, no longer blocking movement.
    expect(door().position[1]).toBeCloseTo(4.5, 1);
    expect(door().colliderEnabled).toBe(false);

    // Step off the plate: the release rule and the door's own auto-close shut it.
    harness.input.setAxis(-1, -1);
    harness.run(1);
    harness.input.setAxis(0, 0);
    harness.run(4);

    expect(door().position[1]).toBeCloseTo(1.5, 1);
    expect(door().colliderEnabled).toBe(true);
  });

  it('opens the door when the plate itself is clicked', () => {
    const harness = createHarness(createPressurePlateDoorScene());

    harness.input.pick('plate-main');
    harness.run(0.5);

    expect(harness.entity('door-main').position[1]).toBeGreaterThan(1.5);
  });

  it('collects gems, counts them and reveals the portal once all three are found', () => {
    const harness = createHarness(createPressurePlateDoorScene());
    const player = harness.entity('player');

    for (const gemId of ['gem-1', 'gem-2', 'gem-3']) {
      const gem = harness.entity(gemId);
      player.position = [gem.position[0], gem.position[1], gem.position[2]];
      harness.run(0.2);
      expect(harness.entity(gemId).visible).toBe(false);
    }

    expect(harness.world.getVariables()).toMatchObject({ Gems: 3, 'All gems found': true });
    expect(harness.entity('portal').visible).toBe(true);
  });

  it('reports no errors while playing for a few seconds', () => {
    const harness = createHarness(createPressurePlateDoorScene());
    harness.input.setAxis(1, 1);
    harness.run(6);

    const problems = harness.world
      .getDiagnostics()
      .filter((diagnostic) => diagnostic.level === 'error' || diagnostic.level === 'warning');
    expect(problems).toEqual([]);
  });

  it('is safe to stop and start again', () => {
    const harness = createHarness(createPressurePlateDoorScene());
    harness.input.setAxis(1, 1);
    harness.run(3);
    harness.input.setAxis(0, 0);
    harness.world.stop();

    expect(harness.world.getVariables()).toMatchObject({ Gems: 0, 'All gems found': false });
    expect(harness.entity('player').position).toEqual([0, 0.85, 8]);
    expect(harness.entity('portal').visible).toBe(false);

    harness.world.start();
    harness.run(1);
    expect(harness.entity('door-main').position[1]).toBeCloseTo(1.5, 5);
  });
});

describe('Playground scene', () => {
  it('counts clicks and switches the lamp on after three of them', () => {
    const harness = createHarness(createPlaygroundScene());

    expect(harness.entity('lamp').visible).toBe(false);

    for (let click = 0; click < 3; click += 1) {
      harness.input.pick('clickable');
      harness.step();
    }

    expect(harness.world.getVariables()).toMatchObject({ Clicks: 3, 'Last clicked': 'Click me' });
    expect(harness.entity('lamp').visible).toBe(true);
  });

  it('keeps the chaser on the player and resets it when it catches them', () => {
    const harness = createHarness(createPlaygroundScene());
    const chaser = () => harness.entity('chaser');

    expect(chaser().position).toEqual([0, 0.8, -6]);

    harness.run(6);
    const distance = Math.hypot(
      chaser().position[0] - harness.entity('player').position[0],
      chaser().position[2] - harness.entity('player').position[2],
    );

    expect(distance).toBeGreaterThan(1.5);
    // Either it is still closing in or the catch rule has already reset it.
    expect(harness.world.getStats().ruleFirings).toBeGreaterThan(0);
  });

  it('starts the player on the ground', () => {
    const harness = createHarness(createPlaygroundScene());
    harness.run(1);

    expect(harness.entity('player').position[1]).toBeCloseTo(0.85, 2);
  });
});
