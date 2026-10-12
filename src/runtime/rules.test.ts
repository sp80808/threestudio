import { describe, expect, it, vi } from 'vitest';
import { createVariable, type Rule } from '../simulation/schema';
import { executeRule, resolveEntityRef, ruleMatchesEvent } from './rules';
import { makeRuntimeEntity, type RuntimeEntityInit } from './testHarness';
import type { GameEvent, RuntimeEntity, WorldAccess } from './types';
import { createVariableStore } from './variables';

function event(init: Partial<GameEvent> = {}): GameEvent {
  return {
    type: 'custom',
    sourceEntityId: null,
    name: null,
    otherEntityId: null,
    value: null,
    previousValue: null,
    time: 0,
    ...init,
  };
}

function rule(init: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-1',
    name: 'Rule',
    enabled: true,
    once: false,
    event: { type: 'custom', sourceEntityId: null, name: null, interval: null },
    conditions: [],
    actions: [],
    ...init,
  };
}

interface FakeWorld {
  world: WorldAccess;
  entities: RuntimeEntity[];
  messages: { targetEntityId: string; name: string; value: unknown }[];
  emitted: GameEvent[];
  reports: { code: string; message: string }[];
}

function createFakeWorld(initEntities: RuntimeEntityInit[] = []): FakeWorld {
  const entities = initEntities.map((init) => makeRuntimeEntity(init));
  const messages: FakeWorld['messages'] = [];
  const emitted: GameEvent[] = [];
  const reports: FakeWorld['reports'] = [];
  const variables = createVariableStore([
    createVariable('gems', 'Gems', 'number', 0),
    createVariable('won', 'Won', 'boolean', false),
    createVariable('label', 'Label', 'string', ''),
  ]);

  const world: WorldAccess = {
    time: 0,
    delta: 1 / 60,
    gravity: -9.81,
    cameraYaw: 0,
    input: {
      getMovementAxis: () => ({ x: 0, y: 0 }),
      isKeyDown: () => false,
      getPressedKeys: () => [],
      takePointerPicks: () => [],
      endStep: () => {},
    },
    random: () => 0.5,
    getEntity: (id) => entities.find((entity) => entity.id === id),
    getEntities: () => entities,
    getPlayer: () => undefined,
    findEntitiesByTag: (tag) => entities.filter((entity) => entity.tags.includes(tag)),
    getOverlaps: (id) =>
      [...(entities.find((entity) => entity.id === id)?.overlaps ?? new Set<string>())],
    moveEntity: (id, delta) => {
      const entity = entities.find((candidate) => candidate.id === id);
      if (entity) {
        entity.position = [
          entity.position[0] + delta[0],
          entity.position[1] + delta[1],
          entity.position[2] + delta[2],
        ];
      }
      return { position: entity?.position ?? [0, 0, 0], blocked: { x: false, y: false, z: false } };
    },
    setColliderEnabled: (id, enabled) => {
      const entity = entities.find((candidate) => candidate.id === id);
      if (entity) entity.colliderEnabled = enabled;
    },
    resetEntity: vi.fn(),
    hasVariable: (id) => variables.has(id),
    getVariable: (id) => variables.get(id),
    getVariableByName: (name) => variables.getByName(name),
    setVariable: (id, value) => {
      variables.set(id, value);
    },
    changeVariable: (id, delta) => {
      variables.change(id, delta);
    },
    sendMessage: (targetEntityId, name, value = null) => {
      messages.push({ targetEntityId, name, value });
    },
    emitEvent: (next) => {
      emitted.push({ ...next, time: 0 } as GameEvent);
    },
    report: (level, code, message) => {
      reports.push({ code, message });
      void level;
    },
  };

  return { world, entities, messages, emitted, reports };
}

describe('rule entity references', () => {
  const setup = () => {
    const fake = createFakeWorld([{ id: 'self' }, { id: 'other' }]);
    const context = {
      rule: rule(),
      event: event({ sourceEntityId: 'self', otherEntityId: 'other' }),
      owner: fake.entities[0],
      world: fake.world,
      firedRules: new Set<string>(),
    };
    return { fake, context };
  };

  it('resolves self, source, other and concrete ids', () => {
    const { context } = setup();

    expect(resolveEntityRef(null, context)?.id).toBe('self');
    expect(resolveEntityRef('$self', context)?.id).toBe('self');
    expect(resolveEntityRef('$source', context)?.id).toBe('self');
    expect(resolveEntityRef('$other', context)?.id).toBe('other');
    expect(resolveEntityRef('other', context)?.id).toBe('other');
    expect(resolveEntityRef('missing', context)).toBeUndefined();
  });

  it('falls back to the event source for scene rules', () => {
    const { fake, context } = setup();
    const sceneContext = { ...context, owner: null };
    expect(resolveEntityRef('$self', sceneContext)?.id).toBe('self');
    void fake;
  });
});

describe('rule event matching', () => {
  it('only lets an entity rule react to its own events', () => {
    const owner = makeRuntimeEntity({ id: 'plate' });
    const own = event({ sourceEntityId: 'plate', name: 'open' });
    const foreign = event({ sourceEntityId: 'door', name: 'open' });
    const global = event({ type: 'scene-start', sourceEntityId: null });

    const startRule = rule({
      event: { type: 'scene-start', sourceEntityId: null, name: null, interval: null },
    });

    expect(ruleMatchesEvent(rule(), own, owner)).toBe(true);
    expect(ruleMatchesEvent(rule(), foreign, owner)).toBe(false);
    expect(ruleMatchesEvent(startRule, global, owner)).toBe(true);
  });

  it('lets scene rules react to everything', () => {
    const foreign = event({ sourceEntityId: 'door', name: 'open' });
    expect(ruleMatchesEvent(rule(), foreign, null)).toBe(true);
  });

  it('matches on event name and source filters', () => {
    const owner = makeRuntimeEntity({ id: 'plate' });
    const filtered = rule({
      event: { type: 'custom', sourceEntityId: 'plate', name: 'open', interval: null },
    });

    expect(ruleMatchesEvent(filtered, event({ sourceEntityId: 'plate', name: 'open' }), null)).toBe(true);
    expect(ruleMatchesEvent(filtered, event({ sourceEntityId: 'plate', name: 'close' }), null)).toBe(false);
    expect(ruleMatchesEvent(filtered, event({ sourceEntityId: 'door', name: 'open' }), null)).toBe(false);
    void owner;
  });

  it('ignores disabled rules and respects the once flag', () => {
    const fired = new Set<string>();
    const onceRule = rule({ once: true });
    const context = {
      rule: onceRule,
      event: event({ sourceEntityId: 'plate' }),
      owner: null,
      world: createFakeWorld().world,
      firedRules: fired,
    };

    expect(executeRule(onceRule, context)).toBe(true);
    expect(executeRule(onceRule, context)).toBe(false);
    expect(executeRule(rule({ enabled: false }), { ...context, rule: rule({ enabled: false }) })).toBe(false);
  });
});

describe('rule conditions and actions', () => {
  it('runs actions only when every condition passes', () => {
    const fake = createFakeWorld([{ id: 'plate' }, { id: 'door' }]);
    const gated = rule({
      conditions: [
        { id: 'c1', type: 'variable-greater-than', subjectEntityId: null, property: 'gems', value: 2 },
      ],
      actions: [
        { id: 'a1', type: 'emit-event', targetEntityId: 'door', property: 'open', value: true },
      ],
    });

    const context = {
      rule: gated,
      event: event({ sourceEntityId: 'plate' }),
      owner: fake.entities[0],
      world: fake.world,
      firedRules: new Set<string>(),
    };

    expect(executeRule(gated, context)).toBe(false);
    expect(fake.messages).toHaveLength(0);

    fake.world.setVariable('gems', 5);
    expect(executeRule(gated, context)).toBe(true);
    expect(fake.messages).toEqual([{ targetEntityId: 'door', name: 'open', value: true }]);
  });

  it('evaluates distance, visibility, enabled and overlap conditions', () => {
    const fake = createFakeWorld([
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [1, 0, 0], visible: false, enabled: true },
    ]);
    fake.entities[0].overlaps.add('b');

    const context = {
      rule: rule(),
      event: event({ sourceEntityId: 'a' }),
      owner: fake.entities[0],
      world: fake.world,
      firedRules: new Set<string>(),
    };

    const passes = (condition: Rule['conditions'][number]) =>
      executeRule(rule({ conditions: [condition] }), context);

    expect(
      passes({ id: 'c1', type: 'distance-less-than', subjectEntityId: 'a', property: 'b', value: 2 }),
    ).toBe(true);
    expect(
      passes({ id: 'c2', type: 'distance-less-than', subjectEntityId: 'a', property: 'b', value: 0.5 }),
    ).toBe(false);
    expect(
      passes({ id: 'c3', type: 'entity-visible', subjectEntityId: 'b', property: null, value: false }),
    ).toBe(true);
    expect(
      passes({ id: 'c4', type: 'entity-enabled', subjectEntityId: 'b', property: null, value: true }),
    ).toBe(true);
    expect(
      passes({ id: 'c5', type: 'is-overlapping', subjectEntityId: 'a', property: 'b', value: null }),
    ).toBe(true);
    expect(passes({ id: 'c6', type: 'always', subjectEntityId: null, property: null, value: null })).toBe(
      true,
    );
    // A condition on a missing object fails closed instead of throwing.
    expect(
      passes({ id: 'c7', type: 'entity-visible', subjectEntityId: 'ghost', property: null, value: true }),
    ).toBe(false);
  });

  it('applies variable, visibility, enable and movement actions', () => {
    const fake = createFakeWorld([{ id: 'gate', position: [0, 0, 0] }, { id: 'plate' }]);
    const context = {
      rule: rule(),
      event: event({ sourceEntityId: 'plate' }),
      owner: fake.entities[1],
      world: fake.world,
      firedRules: new Set<string>(),
    };

    executeRule(
      rule({
        actions: [
          { id: 'a1', type: 'set-variable', targetEntityId: null, property: 'won', value: true },
          { id: 'a2', type: 'change-variable', targetEntityId: null, property: 'gems', value: 2 },
          { id: 'a3', type: 'set-visible', targetEntityId: 'gate', property: null, value: false },
          { id: 'a4', type: 'set-enabled', targetEntityId: 'gate', property: null, value: false },
          { id: 'a5', type: 'move-entity', targetEntityId: 'gate', property: 'y', value: 1.5 },
        ],
      }),
      context,
    );

    expect(fake.world.getVariable('won')).toBe(true);
    expect(fake.world.getVariable('gems')).toBe(2);
    expect(fake.entities[0].visible).toBe(false);
    expect(fake.entities[0].enabled).toBe(false);
    expect(fake.entities[0].position[1]).toBeCloseTo(1.5, 6);
  });

  it('reports missing variables and objects instead of throwing', () => {
    const fake = createFakeWorld([{ id: 'plate' }]);
    const context = {
      rule: rule(),
      event: event({ sourceEntityId: 'plate' }),
      owner: fake.entities[0],
      world: fake.world,
      firedRules: new Set<string>(),
    };

    executeRule(
      rule({
        conditions: [{ id: 'c1', type: 'variable-equals', subjectEntityId: null, property: 'nope', value: 1 }],
        actions: [{ id: 'a1', type: 'set-visible', targetEntityId: 'ghost', property: null, value: true }],
      }),
      context,
    );

    expect(fake.reports.map((report) => report.code)).toEqual(['missing-variable']);
  });

  it('emits globally when a message has no target', () => {
    const fake = createFakeWorld([{ id: 'plate' }]);
    const context = {
      rule: rule(),
      event: event({ sourceEntityId: 'plate' }),
      owner: fake.entities[0],
      world: fake.world,
      firedRules: new Set<string>(),
    };

    executeRule(
      rule({ actions: [{ id: 'a1', type: 'emit-event', targetEntityId: null, property: 'alarm', value: 3 }] }),
      context,
    );

    expect(fake.emitted).toHaveLength(1);
    expect(fake.emitted[0]).toMatchObject({ type: 'custom', name: 'alarm', sourceEntityId: 'plate', value: 3 });

    executeRule(
      rule({ actions: [{ id: 'a2', type: 'emit-event', targetEntityId: '$all', property: 'alarm', value: 4 }] }),
      context,
    );
    expect(fake.emitted).toHaveLength(2);
    expect(fake.emitted[1]).toMatchObject({ name: 'alarm', value: 4 });
  });
});
