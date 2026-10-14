/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Behaviour registry: the reusable building blocks of a game.
 *
 * Every behaviour declares its parameters as data (`parameters`), so the
 * inspector UI, the runtime defaults and the sample scenes all read from one
 * source. Adding a behaviour is a single `registerBehaviour` call — there is no
 * switch statement to keep in sync anywhere else.
 *
 * Behaviours never mutate the document. They write into the runtime entity
 * (position/rotation/visible/...) and talk to the rest of the game exclusively
 * through `WorldAccess`.
 */

import { createBehaviour } from '../simulation/schema';
import type { Behaviour, BehaviourValue, Vec3 } from '../simulation/schema';
import { isSolidBody } from './collision';
import {
  DEG_TO_RAD,
  cloneVec3,
  getAxisValue,
  moveTowards,
  normalizeVec3,
  planarDistanceVec3,
  rotateTowards,
  setAxisValue,
  yawTowards,
} from './math';
import { readState, writeState } from './state';
import type {
  BehaviourContext,
  BehaviourDefinition,
  BehaviourMessageContext,
  BehaviourParameterSpec,
  BehaviourRuntimeState,
  RuntimeEntity,
  WorldAccess,
} from './types';
import { asAxis, asBoolean, asNumber, asString } from './values';

// ---------------------------------------------------------------------------
// Parameter spec helpers
// ---------------------------------------------------------------------------

function numberParam(
  key: string,
  label: string,
  value: number,
  options: Partial<BehaviourParameterSpec> = {},
): BehaviourParameterSpec {
  return { key, label, kind: 'number', default: value, step: 0.1, ...options };
}

function boolParam(key: string, label: string, value: boolean, help?: string): BehaviourParameterSpec {
  return { key, label, kind: 'boolean', default: value, ...(help ? { help } : {}) };
}

function axisParam(key: string, label: string, value: 'x' | 'y' | 'z'): BehaviourParameterSpec {
  return {
    key,
    label,
    kind: 'axis',
    default: value,
    options: [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
      { value: 'z', label: 'Z' },
    ],
  };
}

function entityParam(key: string, label: string, help?: string): BehaviourParameterSpec {
  return { key, label, kind: 'entity', default: '', ...(help ? { help } : {}) };
}

function variableParam(key: string, label: string, help?: string): BehaviourParameterSpec {
  return { key, label, kind: 'variable', default: '', ...(help ? { help } : {}) };
}

function stringParam(key: string, label: string, value: string, help?: string): BehaviourParameterSpec {
  return { key, label, kind: 'string', default: value, ...(help ? { help } : {}) };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, BehaviourDefinition>();

export function registerBehaviour(definition: BehaviourDefinition): void {
  registry.set(definition.type, definition);
}

export function getBehaviourDefinition(type: string): BehaviourDefinition | undefined {
  return registry.get(type);
}

export function listBehaviourDefinitions(): BehaviourDefinition[] {
  return [...registry.values()];
}

export function listBehavioursByCategory(): Record<string, BehaviourDefinition[]> {
  const grouped: Record<string, BehaviourDefinition[]> = {};
  for (const definition of registry.values()) {
    (grouped[definition.category] ??= []).push(definition);
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }
  return grouped;
}

export function getBehaviourDefaults(type: string): Record<string, BehaviourValue> {
  const definition = registry.get(type);
  if (!definition) return {};
  const defaults: Record<string, BehaviourValue> = {};
  for (const parameter of definition.parameters) defaults[parameter.key] = parameter.default;
  return defaults;
}

/**
 * Creates a behaviour with registry defaults filled in, so templates and the
 * inspector never have to know each parameter's default value.
 */
export function createBehaviourInstance(
  type: string,
  overrides: Record<string, BehaviourValue> = {},
  label?: string,
): Behaviour {
  const definition = registry.get(type);
  return createBehaviour(
    type,
    label ?? definition?.label ?? type,
    { ...getBehaviourDefaults(type), ...overrides },
  );
}

export function createBehaviourState(type: string, entity: RuntimeEntity): BehaviourRuntimeState {
  const definition = registry.get(type);
  return definition?.createState ? definition.createState(entity) : {};
}

/**
 * Runs one behaviour for one fixed step, converting any thrown error into a
 * diagnostic so a broken behaviour cannot stall the whole play session.
 */
export function runBehaviourUpdate(
  definition: BehaviourDefinition,
  context: BehaviourContext,
): void {
  try {
    definition.update(context);
  } catch (error) {
    context.world.report(
      'error',
      'behaviour-error',
      `${definition.label} failed: ${(error as Error).message}`,
      context.entity.id,
    );
  }
}

export function runBehaviourMessage(
  definition: BehaviourDefinition,
  context: BehaviourMessageContext,
): void {
  if (!definition.onMessage) return;
  try {
    definition.onMessage(context);
  } catch (error) {
    context.world.report(
      'error',
      'behaviour-error',
      `${definition.label} message handler failed: ${(error as Error).message}`,
      context.entity.id,
    );
  }
}

// ---------------------------------------------------------------------------
// Motion behaviours
// ---------------------------------------------------------------------------

registerBehaviour({
  type: 'spin',
  label: 'Spin',
  description: 'Rotates the object continuously on one axis.',
  category: 'motion',
  parameters: [
    axisParam('axis', 'Axis', 'y'),
    numberParam('speed', 'Speed °/s', 45, { step: 5 }),
  ],
  update: ({ entity, params, delta }) => {
    const axis = asAxis(params.axis);
    const degreesPerSecond = asNumber(params.speed, 45);
    entity.rotation = setAxisValue(
      entity.rotation,
      axis,
      getAxisValue(entity.rotation, axis) + degreesPerSecond * DEG_TO_RAD * delta,
    );
  },
});

registerBehaviour({
  type: 'bob',
  label: 'Float / Bob',
  description: 'Oscillates the object along an axis, relative to its authored position.',
  category: 'motion',
  parameters: [
    axisParam('axis', 'Axis', 'y'),
    numberParam('amplitude', 'Distance', 0.25, { step: 0.05 }),
    numberParam('frequency', 'Speed', 1, { step: 0.1, min: 0 }),
  ],
  update: ({ entity, params, state, delta }) => {
    const axis = asAxis(params.axis);
    const amplitude = asNumber(params.amplitude, 0.25);
    const frequency = Math.max(0, asNumber(params.frequency, 1));
    const elapsed = readState(state, 'elapsed', 0) + delta;
    const previousOffset = readState(state, 'offset', 0);
    const nextOffset = Math.sin(elapsed * frequency * Math.PI * 2) * amplitude;

    // Apply the delta between oscillations instead of overwriting the position,
    // so Bob composes with patrol/follow style movement without drifting.
    entity.position = setAxisValue(
      entity.position,
      axis,
      getAxisValue(entity.position, axis) + (nextOffset - previousOffset),
    );

    writeState(state, 'elapsed', elapsed);
    writeState(state, 'offset', nextOffset);
  },
});

registerBehaviour({
  type: 'patrol',
  label: 'Patrol',
  description: 'Moves back and forth between two points along an axis.',
  category: 'motion',
  parameters: [
    axisParam('axis', 'Axis', 'x'),
    numberParam('distance', 'Distance', 3, { step: 0.5 }),
    numberParam('speed', 'Speed', 1.5, { step: 0.1, min: 0 }),
    numberParam('pauseSeconds', 'Pause at ends', 0.4, { step: 0.1, min: 0 }),
  ],
  createState: (entity) => ({ progress: 0, direction: 1, pause: 0, base: cloneVec3(entity.initialPosition) }),
  update: ({ entity, params, state, delta }) => {
    const axis = asAxis(params.axis, 'x');
    const distance = asNumber(params.distance, 3);
    const speed = Math.max(0, asNumber(params.speed, 1.5));
    const pauseSeconds = Math.max(0, asNumber(params.pauseSeconds, 0.4));

    let progress = readState(state, 'progress', 0);
    let direction = readState(state, 'direction', 1);
    let pause = Math.max(0, readState(state, 'pause', 0) - delta);

    if (pause === 0) {
      const span = Math.abs(distance);
      progress += span < 1e-6 ? 0 : (direction * speed * delta) / span;
    }

    const low = Math.min(0, distance);
    const high = Math.max(0, distance);
    if (progress >= 1) {
      progress = 1;
      direction = -1;
      pause = pauseSeconds;
    } else if (progress <= 0) {
      progress = 0;
      direction = 1;
      pause = pauseSeconds;
    }

    const base = readState(state, 'base', entity.initialPosition);
    entity.position = setAxisValue(entity.position, axis, getAxisValue(base, axis) + low + progress * (high - low));

    writeState(state, 'progress', progress);
    writeState(state, 'direction', direction);
    writeState(state, 'pause', pause);
  },
});

registerBehaviour({
  type: 'orbit',
  label: 'Orbit',
  description: 'Circles around another object at a fixed radius.',
  category: 'motion',
  parameters: [
    entityParam('targetEntityId', 'Centre object'),
    numberParam('radius', 'Radius', 2, { step: 0.25, min: 0 }),
    numberParam('speed', 'Speed °/s', 60, { step: 5 }),
    numberParam('height', 'Height offset', 0, { step: 0.1 }),
    numberParam('startAngle', 'Start angle °', 0, { step: 5 }),
  ],
  createState: () => ({ angle: Number.NaN }),
  update: ({ entity, params, state, world, delta }) => {
    const targetId = asString(params.targetEntityId);
    const target = targetId ? world.getEntity(targetId) : undefined;
    if (!target) return;

    let angle = readState(state, 'angle', Number.NaN);
    if (!Number.isFinite(angle)) angle = asNumber(params.startAngle, 0) * DEG_TO_RAD;
    angle += asNumber(params.speed, 60) * DEG_TO_RAD * delta;

    const radius = Math.max(0, asNumber(params.radius, 2));
    entity.position = [
      target.position[0] + Math.sin(angle) * radius,
      target.position[1] + asNumber(params.height, 0),
      target.position[2] + Math.cos(angle) * radius,
    ];
    writeState(state, 'angle', angle);
  },
});

registerBehaviour({
  type: 'look-at',
  label: 'Look at',
  description: 'Turns to face another object, optionally limited to a turn rate.',
  category: 'motion',
  parameters: [
    entityParam('targetEntityId', 'Target object'),
    numberParam('turnSpeed', 'Turn speed °/s', 180, { step: 15, min: 0 }),
    boolParam('onlyYaw', 'Only turn sideways', true),
  ],
  update: ({ entity, params, world, delta }) => {
    const targetId = asString(params.targetEntityId);
    const target = targetId ? world.getEntity(targetId) : undefined;
    if (!target) return;

    const maxTurn = Math.max(0, asNumber(params.turnSpeed, 180)) * DEG_TO_RAD * delta;
    const desiredYaw = yawTowards(entity.position, target.position);
    entity.rotation = setAxisValue(
      entity.rotation,
      'y',
      rotateTowards(entity.rotation[1], desiredYaw, maxTurn),
    );

    if (!asBoolean(params.onlyYaw, true)) {
      const horizontal = planarDistanceVec3(entity.position, target.position);
      const desiredPitch = -Math.atan2(target.position[1] - entity.position[1], horizontal);
      entity.rotation = setAxisValue(
        entity.rotation,
        'x',
        rotateTowards(entity.rotation[0], desiredPitch, maxTurn),
      );
    }
  },
});

registerBehaviour({
  type: 'follow',
  label: 'Chase / Follow',
  description: 'Walks toward another object, stopping at a set distance.',
  category: 'motion',
  parameters: [
    entityParam('targetEntityId', 'Target object'),
    numberParam('speed', 'Speed', 2.5, { step: 0.25, min: 0 }),
    numberParam('stopDistance', 'Stop distance', 1.2, { step: 0.1, min: 0 }),
    boolParam('faceTarget', 'Face the target', true),
    numberParam('turnSpeed', 'Turn speed °/s', 360, { step: 15, min: 0 }),
  ],
  update: ({ entity, params, world, delta }) => {
    const targetId = asString(params.targetEntityId);
    const target = targetId ? world.getEntity(targetId) : undefined;
    if (!target) return;

    const stopDistance = Math.max(0, asNumber(params.stopDistance, 1.2));
    const toTarget: Vec3 = [
      target.position[0] - entity.position[0],
      0,
      target.position[2] - entity.position[2],
    ];
    const distance = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);

    if (distance > stopDistance + 1e-4) {
      const travel = Math.min(asNumber(params.speed, 2.5) * delta, distance - stopDistance);
      const direction = normalizeVec3(toTarget);
      world.moveEntity(entity.id, [
        direction[0] * travel,
        direction[1] * travel,
        direction[2] * travel,
      ]);
    }

    if (asBoolean(params.faceTarget, true)) {
      const maxTurn = Math.max(0, asNumber(params.turnSpeed, 360)) * DEG_TO_RAD * delta;
      const desiredYaw = yawTowards(entity.position, target.position);
      entity.rotation = setAxisValue(
        entity.rotation,
        'y',
        rotateTowards(entity.rotation[1], desiredYaw, maxTurn),
      );
    }
  },
});

registerBehaviour({
  type: 'character',
  label: 'Player character',
  description: 'Drives the object with WASD/arrow keys, gravity and optional jumping.',
  category: 'gameplay',
  parameters: [
    numberParam('speed', 'Move speed', 6, { step: 0.5, min: 0 }),
    boolParam('relativeToCamera', 'Move relative to camera', true),
    boolParam('turnToFaceMotion', 'Face movement direction', true),
    numberParam('turnSpeed', 'Turn speed °/s', 720, { step: 30, min: 0 }),
    boolParam('useGravity', 'Use scene gravity', true),
    numberParam('jumpSpeed', 'Jump speed (0 disables)', 0, { step: 0.5, min: 0 }),
    stringParam('jumpKey', 'Jump key', 'Space'),
  ],
  createState: () => ({ verticalVelocity: 0, grounded: false }),
  update: ({ entity, params, state, world, delta }) => {
    const axis = world.input.getMovementAxis();
    const speed = Math.max(0, asNumber(params.speed, 6));
    const cameraYaw = asBoolean(params.relativeToCamera, true) ? world.cameraYaw : 0;

    // Forward is -Z at yaw 0 (matching a camera looking down -Z).
    const forwardX = -Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let moveX = forwardX * axis.y + rightX * axis.x;
    let moveZ = forwardZ * axis.y + rightZ * axis.x;
    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveZ /= magnitude;
    }
    const motion: Vec3 = [moveX * speed * delta, 0, moveZ * speed * delta];

    let verticalVelocity = readState(state, 'verticalVelocity', 0);
    let grounded = readState(state, 'grounded', false);
    const gravity = asBoolean(params.useGravity, true) ? world.gravity : 0;
    const jumpSpeed = Math.max(0, asNumber(params.jumpSpeed, 0));
    const jumpKey = asString(params.jumpKey, 'Space');

    if (jumpSpeed > 0 && grounded && world.input.getPressedKeys().includes(jumpKey)) {
      verticalVelocity = jumpSpeed;
      grounded = false;
    } else {
      verticalVelocity += gravity * delta;
    }

    motion[1] = verticalVelocity * delta;
    const result = world.moveEntity(entity.id, motion);

    if (result.blocked.y) {
      if (verticalVelocity <= 0) {
        grounded = true;
        verticalVelocity = 0;
      } else {
        verticalVelocity = 0;
      }
    } else {
      grounded = false;
    }
    if (gravity === 0) grounded = false;

    writeState(state, 'verticalVelocity', verticalVelocity);
    writeState(state, 'grounded', grounded);

    if (asBoolean(params.turnToFaceMotion, true) && magnitude > 1e-3) {
      const maxTurn = Math.max(0, asNumber(params.turnSpeed, 720)) * DEG_TO_RAD * delta;
      const desiredYaw = Math.atan2(moveX, moveZ);
      entity.rotation = setAxisValue(
        entity.rotation,
        'y',
        rotateTowards(entity.rotation[1], desiredYaw, maxTurn),
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Interaction behaviours
// ---------------------------------------------------------------------------

registerBehaviour({
  type: 'door',
  label: 'Door',
  description: 'Slides open on a message such as "open" and can close itself again.',
  category: 'interaction',
  parameters: [
    axisParam('axis', 'Slide axis', 'y'),
    numberParam('distance', 'Distance', 2, { step: 0.25 }),
    numberParam('duration', 'Open time (s)', 0.8, { step: 0.1, min: 0.01 }),
    boolParam('autoClose', 'Close automatically', true),
    numberParam('closeDelay', 'Close delay (s)', 2, { step: 0.25, min: 0 }),
    stringParam('openMessage', 'Open message', 'open'),
    stringParam('closeMessage', 'Close message', 'close'),
    boolParam('blocksWhileClosed', 'Blocks while closed', true),
  ],
  createState: (entity) => ({ openness: 0, target: 0, closeTimer: 0, base: cloneVec3(entity.initialPosition) }),
  update: ({ entity, params, state, world, delta }) => {
    const axis = asAxis(params.axis);
    const distance = asNumber(params.distance, 2);
    const duration = Math.max(0.01, asNumber(params.duration, 0.8));
    const autoClose = asBoolean(params.autoClose, true);
    const closeDelay = Math.max(0, asNumber(params.closeDelay, 2));

    let openness = readState(state, 'openness', 0);
    let target = readState(state, 'target', 0);
    let closeTimer = readState(state, 'closeTimer', 0);

    if (autoClose && target === 1 && openness >= 1) {
      closeTimer += delta;
      if (closeTimer >= closeDelay) {
        target = 0;
        closeTimer = 0;
      }
    } else {
      closeTimer = 0;
    }

    const step = delta / duration;
    const previousOpenness = openness;
    openness = moveTowards(openness, target, step);

    if (openness !== previousOpenness) {
      const base = readState(state, 'base', entity.initialPosition);
      entity.position = setAxisValue(
        entity.position,
        axis,
        getAxisValue(base, axis) + openness * distance,
      );
      if (asBoolean(params.blocksWhileClosed, true)) {
        world.setColliderEnabled(entity.id, openness < 0.5);
      }
    }

    writeState(state, 'openness', openness);
    writeState(state, 'target', target);
    writeState(state, 'closeTimer', closeTimer);
  },
  onMessage: ({ params, state, message }) => {
    const openMessage = asString(params.openMessage, 'open');
    const closeMessage = asString(params.closeMessage, 'close');

    if (message.name === openMessage || message.name === 'open') {
      writeState(state, 'target', 1);
      writeState(state, 'closeTimer', 0);
    } else if (message.name === closeMessage || message.name === 'close') {
      writeState(state, 'target', 0);
      writeState(state, 'closeTimer', 0);
    } else if (message.name === 'toggle') {
      writeState(state, 'target', readState<number>(state, 'target', 0) === 1 ? 0 : 1);
      writeState(state, 'closeTimer', 0);
    }
  },
});

registerBehaviour({
  type: 'pressure-plate',
  label: 'Pressure Plate',
  description: 'Sends a message while something solid stands on it.',
  category: 'interaction',
  parameters: [
    entityParam('targetEntityId', 'Tell this object'),
    stringParam('message', 'Message when pressed', 'open'),
    stringParam('releaseMessage', 'Message when released', 'close'),
    numberParam('releaseDelay', 'Release delay (s)', 0.2, { step: 0.05, min: 0 }),
    numberParam('sinkDepth', 'Sink depth', 0.08, { step: 0.01, min: 0 }),
    boolParam('oneShot', 'Trigger only once', false),
  ],
  createState: (entity) => ({
    pressed: false,
    releaseTimer: null,
    sink: 0,
    base: cloneVec3(entity.initialPosition),
  }),
  update: ({ entity, params, state, world, delta }) => {
    const overlaps = world.getOverlaps(entity.id);
    const pressed = overlaps.some((id) => {
      const other = world.getEntity(id);
      return other ? isSolidBody(other) : false;
    });

    const wasPressed = readState<boolean>(state, 'pressed', false);
    let releaseTimer = readState<number | null>(state, 'releaseTimer', null);
    const message = asString(params.message, 'open');
    const releaseMessage = asString(params.releaseMessage, 'close');
    const releaseDelay = Math.max(0, asNumber(params.releaseDelay, 0.2));
    const oneShot = asBoolean(params.oneShot, false);

    if (pressed && !wasPressed) {
      const targetId = asString(params.targetEntityId);
      if (targetId) world.sendMessage(targetId, message, true);
      else world.emitEvent({ type: 'custom', name: message, sourceEntityId: entity.id, otherEntityId: null, value: true, previousValue: null });
      releaseTimer = null;
      if (oneShot) {
        const behaviour = entity.behaviours.find((candidate) => candidate.type === 'pressure-plate');
        if (behaviour) behaviour.enabled = false;
      }
    } else if (!pressed && wasPressed && releaseDelay >= 0) {
      releaseTimer = releaseDelay;
    }

    if (releaseTimer !== null) {
      releaseTimer -= delta;
      if (releaseTimer <= 0) {
        const targetId = asString(params.targetEntityId);
        if (targetId) world.sendMessage(targetId, releaseMessage, false);
        else world.emitEvent({ type: 'custom', name: releaseMessage, sourceEntityId: entity.id, otherEntityId: null, value: false, previousValue: null });
        releaseTimer = null;
      }
    }

    // Visual feedback: the plate sinks slightly while held down.
    const sinkDepth = Math.max(0, asNumber(params.sinkDepth, 0.08));
    let sink = readState(state, 'sink', 0);
    const desiredSink = pressed ? -sinkDepth : 0;
    if (Math.abs(sink - desiredSink) > 1e-4) {
      const base = readState(state, 'base', entity.initialPosition);
      sink = moveTowards(sink, desiredSink, sinkDepth > 0 ? Math.max(sinkDepth, 0.05) * delta * 6 : 0);
      entity.position = setAxisValue(entity.position, 'y', base[1] + sink);
      writeState(state, 'sink', sink);
    }

    writeState(state, 'pressed', pressed);
    writeState(state, 'releaseTimer', releaseTimer);
  },
});

registerBehaviour({
  type: 'collectible',
  label: 'Collectible',
  description: 'Counts up a variable when the player (or anything) touches it.',
  category: 'gameplay',
  parameters: [
    variableParam('variableId', 'Add to variable'),
    numberParam('amount', 'Amount', 1, { step: 1 }),
    boolParam('onlyPlayer', 'Only the player', true),
    boolParam('hideWhenCollected', 'Hide once collected', true),
    numberParam('respawnAfter', 'Respawn after (s, 0 = never)', 0, { step: 0.5, min: 0 }),
    stringParam('message', 'Message to send', 'collected'),
  ],
  createState: () => ({ collected: false, timer: 0 }),
  update: ({ entity, params, state, world, delta }) => {
    const respawnAfter = Math.max(0, asNumber(params.respawnAfter, 0));
    let collected = readState(state, 'collected', false);
    let timer = readState(state, 'timer', 0);

    if (collected) {
      if (respawnAfter > 0) {
        timer += delta;
        if (timer >= respawnAfter) {
          collected = false;
          timer = 0;
          entity.visible = true;
        }
      }
      writeState(state, 'collected', collected);
      writeState(state, 'timer', timer);
      return;
    }

    const overlaps = world.getOverlaps(entity.id);
    const player = world.getPlayer();
    const onlyPlayer = asBoolean(params.onlyPlayer, true);
    const touched = onlyPlayer
      ? Boolean(player && overlaps.includes(player.id))
      : overlaps.some((id) => {
          const other = world.getEntity(id);
          return other ? isSolidBody(other) : false;
        });

    if (!touched) return;

    collected = true;
    timer = 0;
    if (asBoolean(params.hideWhenCollected, true)) entity.visible = false;

    const variableId = asString(params.variableId);
    if (variableId) world.changeVariable(variableId, asNumber(params.amount, 1));

    const message = asString(params.message, 'collected');
    if (message) {
      world.emitEvent({
        type: 'custom',
        name: message,
        sourceEntityId: entity.id,
        otherEntityId: player?.id ?? null,
        value: true,
        previousValue: null,
      });
    }

    writeState(state, 'collected', collected);
    writeState(state, 'timer', timer);
  },
});

/** Marks an {@link WorldAccess} entity as the player character when present. */
export function isPlayerEntity(entity: RuntimeEntity): boolean {
  return entity.behaviours.some(
    (behaviour) => behaviour.type === 'character' && behaviour.enabled,
  );
}

export function findPlayer(entities: RuntimeEntity[]): RuntimeEntity | undefined {
  return entities.find((entity) => entity.enabled && isPlayerEntity(entity));
}
