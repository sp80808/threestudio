import { describe, expect, it } from 'vitest';
import { createPressurePlateDoorRecipe } from './recipes';

describe('Pressure Plate Door recipe', () => {
  it('creates a valid connected gameplay slice', () => {
    const recipe = createPressurePlateDoorRecipe();
    const entities = Object.fromEntries(recipe.entities.map((entity) => [entity.id, entity]));
    const plate = entities[recipe.ids.plate];
    const door = entities[recipe.ids.door];
    const crate = entities[recipe.ids.crate];
    const ground = entities[recipe.ids.ground];

    expect(recipe.entities).toHaveLength(4);
    expect(recipe.selectedEntityId).toBe(recipe.ids.plate);
    expect(Object.keys(entities)).toHaveLength(4);

    expect(plate.components.physics).toMatchObject({
      type: 'physics',
      bodyType: 'fixed',
      sensor: true,
    });
    expect(crate.components.physics).toMatchObject({
      type: 'physics',
      bodyType: 'dynamic',
      sensor: false,
    });
    expect(door.components.physics).toMatchObject({
      type: 'physics',
      bodyType: 'kinematic-position',
      sensor: false,
    });
    expect(ground.components.physics).toMatchObject({
      type: 'physics',
      bodyType: 'fixed',
      sensor: false,
    });

    const pressurePlate = plate.behaviours?.find((behaviour) => behaviour.type === 'pressure-plate');
    expect(pressurePlate?.parameters.targetEntityId).toBe(recipe.ids.door);

    const rules = plate.rules ?? [];
    expect(rules.map((rule) => rule.event.type)).toEqual(['trigger-enter', 'trigger-exit']);
    expect(rules.every((rule) => rule.event.sourceEntityId === recipe.ids.plate)).toBe(true);
    expect(rules[0].actions[0]).toMatchObject({
      type: 'open-door',
      targetEntityId: recipe.ids.door,
    });
    expect(rules[1].actions[0]).toMatchObject({
      type: 'close-door',
      targetEntityId: recipe.ids.door,
    });
  });
});
