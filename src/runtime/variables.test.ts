import { describe, expect, it, vi } from 'vitest';
import { createVariable } from '../simulation/schema';
import { createVariableStore } from './variables';

describe('variable store', () => {
  it('starts from authored initial values with type coercion', () => {
    const store = createVariableStore([
      createVariable('gems', 'Gems', 'number', '3'),
      createVariable('won', 'Won', 'boolean', false),
      createVariable('name', 'Name', 'string', 'Player'),
    ]);

    expect(store.get('gems')).toBe(3);
    expect(store.get('won')).toBe(false);
    expect(store.get('name')).toBe('Player');
    expect(store.getByName('Gems')).toBe(3);
  });

  it('reports changes with previous values and skips no-ops', () => {
    const onChanged = vi.fn();
    const store = createVariableStore([createVariable('gems', 'Gems', 'number', 0)], onChanged);

    store.set('gems', 2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith({
      id: 'gems',
      name: 'Gems',
      value: 2,
      previousValue: 0,
    });

    store.set('gems', 2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('coerces writes to the declared type', () => {
    const store = createVariableStore([
      createVariable('gems', 'Gems', 'number', 0),
      createVariable('won', 'Won', 'boolean', false),
      createVariable('label', 'Label', 'string', ''),
    ]);

    store.set('gems', '12');
    store.set('won', 1);
    store.set('label', 42);

    expect(store.get('gems')).toBe(12);
    expect(store.get('won')).toBe(true);
    expect(store.get('label')).toBe('42');
  });

  it('supports numeric deltas, toggling and resetting', () => {
    const store = createVariableStore([
      createVariable('gems', 'Gems', 'number', 1),
      createVariable('won', 'Won', 'boolean', false),
    ]);

    expect(store.change('gems', 4)).toBe(true);
    expect(store.get('gems')).toBe(5);
    expect(store.change('missing', 1)).toBe(false);

    expect(store.toggle('won')).toBe(true);
    expect(store.get('won')).toBe(true);

    store.reset();
    expect(store.get('gems')).toBe(1);
    expect(store.get('won')).toBe(false);
  });

  it('exposes a plain snapshot for HUDs', () => {
    const store = createVariableStore([
      createVariable('gems', 'Gems', 'number', 2),
      createVariable('won', 'Won', 'boolean', true),
    ]);

    expect(store.snapshot()).toEqual({ Gems: 2, Won: true });
    expect(store.entries().map((entry) => entry.variable.id)).toEqual(['gems', 'won']);
  });
});
