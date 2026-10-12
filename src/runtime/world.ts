/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * The game world: fixed-step simulation of a project document.
 *
 * Lifecycle: `start()` (or `createWorld` + `step`) → `pause()`/`resume()` →
 * `stepOnce()` for frame-by-frame debugging → `stop()`.
 *
 * Guarantees that matter for an editor:
 *  - the document is never mutated — play mode runs on a clone, so stopping
 *    always restores the authored scene exactly;
 *  - the simulation is deterministic: fixed timestep, document order iteration,
 *    seeded randomness and a bounded event queue;
 *  - nothing throws at frame time; every problem becomes a diagnostic.
 */

import type { BehaviourValue, Entity, Project, Vec3 } from '../simulation/schema';
import { getEntities, resolveSettings } from '../simulation/schema';
import { findPlayer, getBehaviourDefinition, runBehaviourMessage, runBehaviourUpdate } from './behaviours';
import { collidersOverlap, hasActiveCollider, isSolidBody, resolveMovement } from './collision';
import {
  DiagnosticCodes,
  createDiagnosticsSink,
  type Diagnostic,
  type DiagnosticLevel,
  type DiagnosticsSink,
} from './diagnostics';
import { cloneVec3 } from './math';
import { executeRule, type RuleEvaluationContext } from './rules';
import type {
  BehaviourRuntimeState,
  GameEvent,
  GameInput,
  GameEventType,
  MoveResult,
  PointerPick,
  RuntimeEntity,
  WorldAccess,
  WorldOptions,
} from './types';
import { createVariableStore, type VariableStore } from './variables';

/** Upper bound on events processed per fixed step (anti event-storm guard). */
export const MAX_EVENTS_PER_STEP = 128;
/** Upper bound on synchronous message chains (a message handler sending messages). */
const MAX_MESSAGE_DEPTH = 16;
/** Upper bound on fixed steps per `step()` call (anti spiral-of-death guard). */
const MAX_FRAME_DELTA = 0.25;

export interface WorldStats {
  /** Simulated seconds since the session started. */
  time: number;
  steps: number;
  behaviourUpdates: number;
  eventsProcessed: number;
  ruleFirings: number;
  entityCount: number;
  eventCount: number;
}

export type WorldListener<T> = (payload: T) => void;

export interface World extends WorldAccess {
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  isRunning(): boolean;
  isPaused(): boolean;
  /** Advances the simulation by real time, running fixed steps as needed. */
  step(realDeltaSeconds: number): void;
  /** Runs exactly one fixed step (frame-by-frame debugging). */
  stepOnce(): void;
  setCameraYaw(yaw: number): void;
  getStats(): WorldStats;
  getDiagnostics(): Diagnostic[];
  clearDiagnostics(): void;
  getVariables(): Record<string, BehaviourValue>;
  getVariableEntries(): { id: string; name: string; value: BehaviourValue }[];
  /** Applies structural document edits (objects added/removed) without a reset. */
  syncFromProject(project: Project): void;
  onStep(listener: WorldListener<WorldStats>): () => void;
  onEvent(listener: WorldListener<GameEvent>): () => void;
  onDiagnostic(listener: WorldListener<Diagnostic>): () => void;
  dispose(): void;
}

function cloneBehaviour(behaviour: RuntimeEntity['behaviours'][number]) {
  return { ...behaviour, parameters: { ...behaviour.parameters } };
}

function createIdleInput(): GameInput {
  return {
    getMovementAxis: () => ({ x: 0, y: 0 }),
    isKeyDown: () => false,
    getPressedKeys: () => [],
    getHeldKeys: () => [],
    takePointerPicks: () => [],
    endStep: () => {},
  };
}

/** Small deterministic PRNG so replays and tests are reproducible. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRuntimeEntity(entity: Entity, order: number): RuntimeEntity {
  const collider = entity.components.collider;
  const authoredEnabled = entity.enabled ?? true;
  const authoredVisible = entity.components.render?.visible ?? true;

  return {
    id: entity.id,
    name: entity.name,
    parentId: entity.parentId ?? null,
    position: cloneVec3(entity.transform.position),
    rotation: cloneVec3(entity.transform.rotation),
    scale: cloneVec3(entity.transform.scale),
    render: entity.components.render ? { ...entity.components.render } : null,
    collider: collider
      ? {
          ...collider,
          size: cloneVec3(collider.size),
          ...(collider.offset ? { offset: cloneVec3(collider.offset) } : {}),
        }
      : null,
    colliderEnabled: true,
    visible: authoredVisible && authoredEnabled,
    enabled: authoredEnabled,
    tags: entity.tags ?? [],
    behaviours: (entity.behaviours ?? []).map(cloneBehaviour),
    rules: entity.rules ?? [],
    state: new Map<string, BehaviourRuntimeState>(),
    overlaps: new Set<string>(),
    initialPosition: cloneVec3(entity.transform.position),
    initialRotation: cloneVec3(entity.transform.rotation),
    initialScale: cloneVec3(entity.transform.scale),
    initialVisible: authoredVisible,
    initialEnabled: authoredEnabled,
    order,
  };
}

export function createWorld(options: WorldOptions): World {
  const { project } = options;
  const settings = resolveSettings(project);
  const fixedStep = 1 / (options.stepRate ?? settings.stepRate);
  const maxStepsPerFrame = Math.max(1, Math.floor(settings.maxStepsPerFrame));
  const input = options.input ?? createIdleInput();
  const random = createRandom(options.seed ?? 0x5eed);
  const now = options.now ?? (() => Date.now());

  const diagnostics: DiagnosticsSink = createDiagnosticsSink(() => time);
  const variables: VariableStore = createVariableStore(Object.values(project.variables ?? {}), (change) => {
    pushEvent({
      type: 'variable-changed',
      name: change.name,
      sourceEntityId: null,
      otherEntityId: null,
      value: change.value,
      previousValue: change.previousValue,
    });
  });

  const entities: RuntimeEntity[] = getEntities(project)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((entity, index) => buildRuntimeEntity(entity, index));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  const queue: GameEvent[] = [];
  const firedRules = new Set<string>();
  const intervalTimers = new Map<string, number>();
  const stepListeners = new Set<WorldListener<WorldStats>>();
  const eventListeners = new Set<WorldListener<GameEvent>>();
  const diagnosticListeners = new Set<WorldListener<Diagnostic>>();

  let time = 0;
  let deliveryDepth = 0;
  let accumulator = 0;
  let running = false;
  let paused = false;
  let cameraYaw = 0;
  let stats: WorldStats = {
    time: 0,
    steps: 0,
    behaviourUpdates: 0,
    eventsProcessed: 0,
    ruleFirings: 0,
    entityCount: entities.length,
    eventCount: 0,
  };

  diagnostics.onReport((diagnostic) => {
    for (const listener of diagnosticListeners) listener(diagnostic);
  });

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  function pushEvent(event: {
    type: GameEventType;
    name: string | null;
    sourceEntityId: string | null;
    otherEntityId: string | null;
    value: BehaviourValue;
    previousValue: BehaviourValue;
  }): void {
    queue.push({ ...event, time });
    stats.eventCount += 1;
  }

  /** Rules in evaluation order: scene rules first, then per-entity rules. */
  function collectRules(): { rule: RuntimeEntity['rules'][number]; owner: RuntimeEntity | null }[] {
    const result: { rule: RuntimeEntity['rules'][number]; owner: RuntimeEntity | null }[] = [];
    for (const rule of project.rules ?? []) result.push({ rule, owner: null });
    for (const entity of entities) {
      for (const rule of entity.rules) result.push({ rule, owner: entity });
    }
    return result;
  }

  function drainEvents(): void {
    let processed = 0;
    while (queue.length > 0) {
      if (processed >= MAX_EVENTS_PER_STEP) {
        diagnostics.report(
          'warning',
          DiagnosticCodes.eventStorm,
          `More than ${MAX_EVENTS_PER_STEP} events in one step: remaining events were dropped (check for rules that trigger each other in a loop)`,
        );
        queue.length = 0;
        break;
      }

      const event = queue.shift() as GameEvent;
      processed += 1;
      stats.eventsProcessed += 1;

      for (const listener of eventListeners) listener(event);

      for (const { rule, owner } of collectRules()) {
        const context: RuleEvaluationContext = { rule, event, owner, world: access, firedRules };
        if (executeRule(rule, context)) stats.ruleFirings += 1;
      }
    }
  }

  /**
   * Messages are delivered to the receiving behaviours *immediately* rather than
   * on the next pass, so a plate that opens a door does so in the same step the
   * player stepped on it. The event is still queued for the rules, which run
   * later in the same step.
   */
  function deliverMessage(event: GameEvent): void {
    if (!event.sourceEntityId) return;
    const target = entityById.get(event.sourceEntityId);
    if (!target?.enabled) return;

    if (deliveryDepth >= MAX_MESSAGE_DEPTH) {
      diagnostics.report(
        'warning',
        DiagnosticCodes.eventStorm,
        `Message "${event.name ?? ''}" was dropped after ${MAX_MESSAGE_DEPTH} nested messages (check for objects that keep messaging each other)`,
        { entityId: target.id },
      );
      return;
    }

    deliveryDepth += 1;
    try {
      for (const behaviour of target.behaviours) {
        if (!behaviour.enabled) continue;
        const definition = getBehaviourDefinition(behaviour.type);
        if (!definition?.onMessage) continue;
        const state = getBehaviourState(target, behaviour.id, behaviour.type);
        runBehaviourMessage(definition, {
          entity: target,
          params: behaviour.parameters,
          state,
          delta: 0,
          time,
          world: access,
          message: event,
        });
      }
    } finally {
      deliveryDepth -= 1;
    }
  }

  function updateIntervalRules(delta: number): void {
    for (const { rule, owner } of collectRules()) {
      if (!rule.enabled || rule.event.type !== 'interval') continue;
      const interval = Math.max(0.05, rule.event.interval ?? 1);
      const remaining = (intervalTimers.get(rule.id) ?? interval) - delta;
      if (remaining > 0) {
        intervalTimers.set(rule.id, remaining);
        continue;
      }
      intervalTimers.set(rule.id, interval);
      const event: GameEvent = {
        type: 'interval',
        name: rule.event.name ?? null,
        sourceEntityId: owner?.id ?? null,
        otherEntityId: null,
        value: null,
        previousValue: null,
        time,
      };
      const context: RuleEvaluationContext = { rule, event, owner, world: access, firedRules };
      if (executeRule(rule, context)) stats.ruleFirings += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Collision
  // -------------------------------------------------------------------------

  function updateOverlaps(): void {
    const collidables = entities.filter((entity) => hasActiveCollider(entity));

    for (let i = 0; i < collidables.length; i += 1) {
      for (let j = i + 1; j < collidables.length; j += 1) {
        const a = collidables[i];
        const b = collidables[j];
        const overlapping = collidersOverlap(a, b);
        const hadOverlap = a.overlaps.has(b.id);

        if (overlapping && !hadOverlap) {
          a.overlaps.add(b.id);
          b.overlaps.add(a.id);
          if (a.collider?.isTrigger) {
            pushEvent({
              type: 'trigger-enter',
              name: null,
              sourceEntityId: a.id,
              otherEntityId: b.id,
              value: null,
              previousValue: null,
            });
          }
          if (b.collider?.isTrigger) {
            pushEvent({
              type: 'trigger-enter',
              name: null,
              sourceEntityId: b.id,
              otherEntityId: a.id,
              value: null,
              previousValue: null,
            });
          }
        } else if (!overlapping && hadOverlap) {
          a.overlaps.delete(b.id);
          b.overlaps.delete(a.id);
          if (a.collider?.isTrigger) {
            pushEvent({
              type: 'trigger-exit',
              name: null,
              sourceEntityId: a.id,
              otherEntityId: b.id,
              value: null,
              previousValue: null,
            });
          }
          if (b.collider?.isTrigger) {
            pushEvent({
              type: 'trigger-exit',
              name: null,
              sourceEntityId: b.id,
              otherEntityId: a.id,
              value: null,
              previousValue: null,
            });
          }
        }
      }
    }
  }

  function getBehaviourState(
    entity: RuntimeEntity,
    behaviourId: string,
    behaviourType: string,
  ): BehaviourRuntimeState {
    let state = entity.state.get(behaviourId);
    if (!state) {
      state = {};
      const definition = getBehaviourDefinition(behaviourType);
      const initial = definition?.createState?.(entity);
      if (initial) Object.assign(state, initial);
      entity.state.set(behaviourId, state);
    }
    return state;
  }

  // -------------------------------------------------------------------------
  // Fixed step
  // -------------------------------------------------------------------------

  function runFixedStep(delta: number): void {
    time += delta;
    stats.time = time;
    stats.steps += 1;

    // 1. Pointer picks recorded by the renderer since the previous step.
    const picks: PointerPick[] = input.takePointerPicks();
    for (const pick of picks) {
      pushEvent({
        type: 'pointer-click',
        name: null,
        sourceEntityId: pick.entityId,
        otherEntityId: null,
        value: null,
        previousValue: null,
      });
    }

    // 2. Overlaps (produces trigger-enter / trigger-exit events).
    updateOverlaps();

    // 3. Behaviours, in document order.
    for (const entity of entities) {
      if (!entity.enabled) continue;
      for (const behaviour of entity.behaviours) {
        if (!behaviour.enabled) continue;
        const definition = getBehaviourDefinition(behaviour.type);
        if (!definition) {
          diagnostics.report(
            'error',
            DiagnosticCodes.unknownBehaviour,
            `Unknown behaviour "${behaviour.type}" was disabled for this session (is it from a newer version?)`,
            { entityId: entity.id },
          );
          behaviour.enabled = false;
          continue;
        }
        const state = getBehaviourState(entity, behaviour.id, behaviour.type);
        runBehaviourUpdate(definition, {
          entity,
          params: behaviour.parameters,
          state,
          delta,
          time,
          world: access,
        });
        stats.behaviourUpdates += 1;
      }
    }

    // 4. Rules react to everything that happened above.
    drainEvents();

    // 5. Interval rules.
    updateIntervalRules(delta);

    // 6. Input edges are cleared once the whole step has been consumed.
    input.endStep();
    stats.entityCount = entities.length;

    for (const listener of stepListeners) listener(stats);
  }

  function resetSession(): void {
    time = 0;
    accumulator = 0;
    queue.length = 0;
    firedRules.clear();
    intervalTimers.clear();
    variables.reset();
    for (const entity of entities) resetEntityRuntime(entity);
    stats = {
      time: 0,
      steps: 0,
      behaviourUpdates: 0,
      eventsProcessed: 0,
      ruleFirings: 0,
      entityCount: entities.length,
      eventCount: 0,
    };
    diagnostics.clear();
  }

  function resetEntityRuntime(entity: RuntimeEntity): void {
    entity.position = cloneVec3(entity.initialPosition);
    entity.rotation = cloneVec3(entity.initialRotation);
    entity.scale = cloneVec3(entity.initialScale);
    entity.visible = entity.initialVisible && entity.initialEnabled;
    entity.enabled = entity.initialEnabled;
    entity.colliderEnabled = true;
    entity.overlaps.clear();
    entity.state.clear();
  }

  // -------------------------------------------------------------------------
  // WorldAccess facade
  // -------------------------------------------------------------------------

  const access: WorldAccess = {
    get time() {
      return time;
    },
    get delta() {
      return fixedStep;
    },
    get gravity() {
      return settings.gravity;
    },
    get cameraYaw() {
      return cameraYaw;
    },
    input,
    random,
    getEntity: (id) => entityById.get(id),
    getEntities: () => entities,
    getPlayer: () => findPlayer(entities),
    findEntitiesByTag: (tag) => entities.filter((entity) => entity.tags.includes(tag)),
    getOverlaps: (entityId) => {
      const entity = entityById.get(entityId);
      if (!entity) return [];
      return entities.filter((candidate) => entity.overlaps.has(candidate.id)).map((e) => e.id);
    },
    moveEntity: (entityId, delta) => moveEntity(entityId, delta),
    setColliderEnabled: (entityId, enabled) => {
      const entity = entityById.get(entityId);
      if (entity) entity.colliderEnabled = enabled;
    },
    resetEntity: (entityId) => {
      const entity = entityById.get(entityId);
      if (entity) resetEntityRuntime(entity);
    },
    hasVariable: (id) => variables.has(id),
    getVariable: (id) => variables.get(id),
    getVariableByName: (name) => variables.getByName(name),
    setVariable: (id, value) => {
      if (!variables.set(id, value)) {
        diagnostics.report('warning', DiagnosticCodes.missingVariable, `Unknown variable "${id}"`);
      }
    },
    changeVariable: (id, delta) => {
      if (!variables.change(id, delta)) {
        diagnostics.report('warning', DiagnosticCodes.missingVariable, `Unknown variable "${id}"`);
      }
    },
    sendMessage: (targetEntityId, name, value = null) => {
      if (!entityById.has(targetEntityId)) {
        diagnostics.report(
          'warning',
          DiagnosticCodes.missingEntity,
          `Message "${name}" targets a missing object`,
        );
        return;
      }
      const event: GameEvent = {
        type: 'custom',
        name,
        sourceEntityId: targetEntityId,
        otherEntityId: null,
        value,
        previousValue: null,
        time,
      };
      queue.push(event);
      stats.eventCount += 1;
      deliverMessage(event);
    },
    emitEvent: (event) => {
      pushEvent({
        type: event.type,
        name: event.name,
        sourceEntityId: event.sourceEntityId,
        otherEntityId: event.otherEntityId,
        value: event.value,
        previousValue: event.previousValue,
      });
    },
    report: (level: DiagnosticLevel, code: string, message: string, entityId?: string) => {
      diagnostics.report(level, code, message, entityId ? { entityId } : {});
    },
  };

  function moveEntity(id: string, delta: Vec3): MoveResult {
    const entity = entityById.get(id);
    if (!entity) {
      diagnostics.report('warning', DiagnosticCodes.missingEntity, `Cannot move unknown object "${id}"`);
      return { position: [0, 0, 0], blocked: { x: false, y: false, z: false } };
    }

    if (!entity.collider || !entity.enabled || !entity.colliderEnabled) {
      entity.position = [
        entity.position[0] + delta[0],
        entity.position[1] + delta[1],
        entity.position[2] + delta[2],
      ];
      return { position: cloneVec3(entity.position), blocked: { x: false, y: false, z: false } };
    }

    const blockers = entities.filter((candidate) => candidate.id !== id && isSolidBody(candidate));
    const result = resolveMovement(entity, delta, blockers);
    entity.position = result.position;
    return result;
  }

  // -------------------------------------------------------------------------
  // Public world API
  // -------------------------------------------------------------------------

  const world: World = {
    ...access,
    get time() {
      return access.time;
    },
    get delta() {
      return access.delta;
    },
    get gravity() {
      return access.gravity;
    },
    get cameraYaw() {
      return access.cameraYaw;
    },
    get input() {
      return input;
    },
    get random() {
      return random;
    },

    start: () => {
      resetSession();
      running = true;
      paused = false;
      // Scene-start and any rules that follow from it run immediately so the
      // first rendered frame already reflects the opening state.
      pushEvent({
        type: 'scene-start',
        name: null,
        sourceEntityId: null,
        otherEntityId: null,
        value: null,
        previousValue: null,
      });
      drainEvents();
      for (const listener of stepListeners) listener(stats);
    },

    pause: () => {
      if (!running) return;
      paused = true;
    },

    resume: () => {
      if (!running) return;
      paused = false;
    },

    stop: () => {
      running = false;
      paused = false;
      queue.length = 0;
      accumulator = 0;
      for (const entity of entities) resetEntityRuntime(entity);
      variables.reset();
      time = 0;
      stats.time = 0;
    },

    isRunning: () => running,
    isPaused: () => paused,

    step: (realDeltaSeconds) => {
      if (!running || paused) return;
      const delta = Math.min(Math.max(realDeltaSeconds, 0), MAX_FRAME_DELTA);
      accumulator += delta;

      let steps = 0;
      while (accumulator >= fixedStep && steps < maxStepsPerFrame) {
        accumulator -= fixedStep;
        steps += 1;
        runFixedStep(fixedStep);
      }

      if (steps >= maxStepsPerFrame && accumulator >= fixedStep) {
        // Dropping time keeps the simulation stable on slow frames instead of
        // falling further and further behind.
        diagnostics.report(
          'warning',
          DiagnosticCodes.stepOverflow,
          `Frame took longer than ${maxStepsPerFrame} simulation steps; time was dropped to keep play mode responsive`,
        );
        accumulator = 0;
      }
    },

    stepOnce: () => {
      if (!running) {
        resetSession();
        running = true;
        paused = true;
      }
      runFixedStep(fixedStep);
    },

    setCameraYaw: (yaw) => {
      cameraYaw = yaw;
    },

    getStats: () => ({ ...stats }),
    getDiagnostics: () => diagnostics.entries(),
    clearDiagnostics: () => diagnostics.clear(),
    getVariables: () => variables.snapshot(),
    getVariableEntries: () =>
      variables.entries().map((entry) => ({
        id: entry.variable.id,
        name: entry.variable.name,
        value: entry.value,
      })),

    syncFromProject: (next) => {
      const authored = getEntities(next);
      const wanted = new Set(authored.map((entity) => entity.id));

      for (let index = entities.length - 1; index >= 0; index -= 1) {
        const entity = entities[index];
        if (wanted.has(entity.id)) continue;
        entities.splice(index, 1);
        entityById.delete(entity.id);
        for (const other of entities) other.overlaps.delete(entity.id);
      }

      for (const [index, source] of authored.entries()) {
        const existing = entityById.get(source.id);
        if (!existing) {
          const created = buildRuntimeEntity(source, index);
          entities.push(created);
          entityById.set(created.id, created);
          continue;
        }
        existing.name = source.name;
        existing.tags = source.tags ?? [];
        existing.render = source.components.render ? { ...source.components.render } : null;
        existing.rules = source.rules ?? [];

        const collider = source.components.collider;
        existing.collider = collider
          ? {
              ...collider,
              size: cloneVec3(collider.size),
              ...(collider.offset ? { offset: cloneVec3(collider.offset) } : {}),
            }
          : null;

        // Behaviours are merged by id: field edits during play are ignored on
        // purpose so runtime toggles (rules switching behaviours off) survive,
        // while genuinely new behaviours start working immediately.
        const nextBehaviours = (source.behaviours ?? []).map(cloneBehaviour);
        const merged = nextBehaviours.map((behaviour) => {
          const current = existing.behaviours.find((candidate) => candidate.id === behaviour.id);
          if (!current) return behaviour;
          current.label = behaviour.label;
          return current;
        });
        const removed = existing.behaviours.filter(
          (behaviour) => !merged.some((candidate) => candidate.id === behaviour.id),
        );
        for (const behaviour of removed) existing.state.delete(behaviour.id);
        existing.behaviours = merged;
      }

      for (const [index, entity] of entities.entries()) entity.order = index;
      stats.entityCount = entities.length;
    },

    onStep: (listener) => {
      stepListeners.add(listener);
      return () => stepListeners.delete(listener);
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onDiagnostic: (listener) => {
      diagnosticListeners.add(listener);
      return () => diagnosticListeners.delete(listener);
    },

    dispose: () => {
      running = false;
      queue.length = 0;
      stepListeners.clear();
      eventListeners.clear();
      diagnosticListeners.clear();
      void now;
    },
  };

  return world;
}
