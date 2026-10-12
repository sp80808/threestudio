/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WHEN / IF / DO rule execution.
 *
 * A rule is `event -> conditions -> actions`. Evaluation is deliberately simple
 * and synchronous so authors can reason about ordering:
 *
 *  1. rules are evaluated in document order (scene rules first, then entities);
 *  2. actions never run twice for the same event;
 *  3. actions that emit events push them to the end of the queue, so a chain of
 *     rules resolves in separate passes and cannot recurse infinitely.
 */

import type { Rule, RuleAction, RuleCondition } from '../simulation/schema';
import {
  ENTITY_REF_BROADCAST,
  ENTITY_REF_EVENT_OTHER,
  ENTITY_REF_EVENT_SOURCE,
  ENTITY_REF_SELF,
} from '../simulation/schema';
import { distanceVec3 } from './math';
import type { GameEvent, RuntimeEntity, WorldAccess } from './types';
import { asBoolean, asNumber, asString, equalsLoose } from './values';

export interface RuleEvaluationContext {
  rule: Rule;
  event: GameEvent;
  /** Entity that owns the rule; `null` for scene-wide rules. */
  owner: RuntimeEntity | null;
  world: WorldAccess;
  /** Rule ids that already fired this session (used by `once` rules). */
  firedRules: Set<string>;
}

/**
 * Resolves a rule entity reference.
 *
 * - `null`/`''`/`$self` → the rule owner, falling back to the event source;
 * - `$source` → the entity the event came from;
 * - `$other` → the second entity of a trigger event (the body);
 * - anything else → an entity id.
 */
export function resolveEntityRef(
  ref: string | null | undefined,
  context: RuleEvaluationContext,
): RuntimeEntity | undefined {
  const { world } = context;
  const eventSource = context.event.sourceEntityId
    ? world.getEntity(context.event.sourceEntityId)
    : undefined;

  if (!ref || ref === ENTITY_REF_SELF || ref === 'self') {
    return context.owner ?? eventSource;
  }
  if (ref === ENTITY_REF_EVENT_SOURCE || ref === 'source') {
    return eventSource;
  }
  if (ref === ENTITY_REF_EVENT_OTHER || ref === 'other') {
    return context.event.otherEntityId ? world.getEntity(context.event.otherEntityId) : undefined;
  }
  return world.getEntity(ref);
}

/** Does this rule listen to this event? */
export function ruleMatchesEvent(rule: Rule, event: GameEvent, owner: RuntimeEntity | null): boolean {
  if (!rule.enabled) return false;
  if (rule.event.type !== event.type) return false;

  const expectedName = rule.event.name?.trim();
  if (expectedName && expectedName !== event.name) return false;

  const sourceFilter = rule.event.sourceEntityId;
  if (sourceFilter) {
    // Filters are resolved lazily: `$other` is only meaningful for trigger
    // events, where the rule usually wants to know which body entered.
    if (sourceFilter === ENTITY_REF_EVENT_OTHER || sourceFilter === 'other') {
      return Boolean(event.otherEntityId);
    }
    if (owner && (sourceFilter === ENTITY_REF_SELF || sourceFilter === 'self')) {
      return event.sourceEntityId === owner.id;
    }
    return event.sourceEntityId === sourceFilter;
  }

  // Unfiltered entity rules only react to their own events (plus global ones
  // such as scene-start or variable-changed).
  if (owner && event.sourceEntityId !== null && event.sourceEntityId !== owner.id) return false;
  return true;
}

export function evaluateCondition(
  condition: RuleCondition,
  context: RuleEvaluationContext,
): boolean {
  const { world } = context;

  switch (condition.type) {
    case 'always':
      return true;

    case 'variable-equals': {
      const variableId = asString(condition.property ?? '');
      if (!variableId) {
        world.report('warning', 'missing-variable', 'Condition has no variable selected', context.owner?.id);
        return false;
      }
      if (!world.hasVariable(variableId)) {
        world.report('warning', 'missing-variable', `Variable "${variableId}" does not exist`, context.owner?.id);
        return false;
      }
      return equalsLoose(world.getVariable(variableId), condition.value);
    }

    case 'variable-greater-than': {
      const variableId = asString(condition.property ?? '');
      if (!variableId || !world.hasVariable(variableId)) {
        world.report('warning', 'missing-variable', `Variable "${variableId}" does not exist`, context.owner?.id);
        return false;
      }
      return asNumber(world.getVariable(variableId), 0) > asNumber(condition.value, 0);
    }

    case 'distance-less-than': {
      const subject = resolveEntityRef(condition.subjectEntityId, context);
      const other = resolveEntityRef(condition.property, context);
      if (!subject || !other) {
        world.report('warning', 'missing-entity', 'Distance condition references a missing object', context.owner?.id);
        return false;
      }
      return distanceVec3(subject.position, other.position) < asNumber(condition.value, 0);
    }

    case 'entity-enabled': {
      const subject = resolveEntityRef(condition.subjectEntityId, context);
      if (!subject) return false;
      return subject.enabled === asBoolean(condition.value, true);
    }

    case 'entity-visible': {
      const subject = resolveEntityRef(condition.subjectEntityId, context);
      if (!subject) return false;
      return subject.visible === asBoolean(condition.value, true);
    }

    case 'is-overlapping': {
      const subject = resolveEntityRef(condition.subjectEntityId, context);
      const other = resolveEntityRef(condition.property, context);
      if (!subject || !other) return false;
      return subject.overlaps.has(other.id);
    }

    default: {
      world.report(
        'warning',
        'unknown-rule-condition',
        `Unknown condition type "${(condition as RuleCondition).type}"`,
        context.owner?.id,
      );
      return false;
    }
  }
}

export function applyAction(action: RuleAction, context: RuleEvaluationContext): void {
  const { world } = context;

  switch (action.type) {
    case 'set-variable': {
      const variableId = asString(action.property ?? '');
      if (!variableId || !world.hasVariable(variableId)) {
        world.report('warning', 'missing-variable', `Cannot set unknown variable "${variableId}"`, context.owner?.id);
        return;
      }
      world.setVariable(variableId, action.value);
      return;
    }

    case 'change-variable': {
      const variableId = asString(action.property ?? '');
      if (!variableId || !world.hasVariable(variableId)) {
        world.report('warning', 'missing-variable', `Cannot change unknown variable "${variableId}"`, context.owner?.id);
        return;
      }
      world.changeVariable(variableId, asNumber(action.value, 0));
      return;
    }

    case 'set-enabled': {
      const target = resolveEntityRef(action.targetEntityId, context);
      if (!target) {
        world.report('warning', 'missing-entity', 'Action targets a missing object', context.owner?.id);
        return;
      }
      target.enabled = asBoolean(action.value, true);
      if (!target.enabled) target.visible = false;
      return;
    }

    case 'set-visible': {
      const target = resolveEntityRef(action.targetEntityId, context);
      if (!target) {
        world.report('warning', 'missing-entity', 'Action targets a missing object', context.owner?.id);
        return;
      }
      target.visible = asBoolean(action.value, true);
      return;
    }

    case 'set-behaviour-enabled': {
      const target = resolveEntityRef(action.targetEntityId, context);
      const behaviourRef = asString(action.property ?? '');
      if (!target || !behaviourRef) {
        world.report('warning', 'missing-entity', 'Action targets a missing behaviour', context.owner?.id);
        return;
      }
      const enabled = asBoolean(action.value, true);
      const byId = target.behaviours.find((behaviour) => behaviour.id === behaviourRef);
      if (byId) {
        byId.enabled = enabled;
        return;
      }
      const matchingType = target.behaviours.filter((behaviour) => behaviour.type === behaviourRef);
      if (matchingType.length === 0) {
        world.report(
          'warning',
          'missing-entity',
          `"${target.name}" has no behaviour "${behaviourRef}"`,
          context.owner?.id,
        );
        return;
      }
      for (const behaviour of matchingType) behaviour.enabled = enabled;
      return;
    }

    case 'move-entity': {
      const target = resolveEntityRef(action.targetEntityId, context);
      if (!target) {
        world.report('warning', 'missing-entity', 'Action targets a missing object', context.owner?.id);
        return;
      }
      const axis = asString(action.property ?? 'y');
      const amount = asNumber(action.value, 0);
      const delta: [number, number, number] = [0, 0, 0];
      if (axis === 'x') delta[0] = amount;
      else if (axis === 'z') delta[2] = amount;
      else if (axis === 'xyz') {
        delta[0] = amount;
        delta[1] = amount;
        delta[2] = amount;
      } else delta[1] = amount;
      world.moveEntity(target.id, delta);
      return;
    }

    case 'reset-entity': {
      const target = resolveEntityRef(action.targetEntityId, context);
      if (!target) {
        world.report('warning', 'missing-entity', 'Action targets a missing object', context.owner?.id);
        return;
      }
      world.resetEntity(target.id);
      return;
    }

    case 'emit-event': {
      const name = asString(action.property ?? '');
      if (!name) return;
      const targetRef = action.targetEntityId;
      // Emitting is the one action where "no target" means everyone: sending a
      // message to yourself would make the broadcast case impossible to express.
      if (!targetRef || targetRef === ENTITY_REF_BROADCAST) {
        world.emitEvent({
          type: 'custom',
          name,
          sourceEntityId: context.owner?.id ?? context.event.sourceEntityId,
          otherEntityId: context.event.otherEntityId,
          value: action.value,
          previousValue: null,
        });
        return;
      }
      const target = resolveEntityRef(targetRef, context);
      if (target) {
        world.sendMessage(target.id, name, action.value);
        return;
      }
      world.emitEvent({
        type: 'custom',
        name,
        sourceEntityId: context.owner?.id ?? context.event.sourceEntityId,
        otherEntityId: context.event.otherEntityId,
        value: action.value,
        previousValue: null,
      });
      return;
    }

    default: {
      world.report(
        'warning',
        'unknown-rule-action',
        `Unknown action type "${(action as RuleAction).type}"`,
        context.owner?.id,
      );
    }
  }
}

/**
 * Evaluates a rule against an event.
 *
 * @returns true when every condition passed and the actions ran.
 */
export function executeRule(rule: Rule, context: RuleEvaluationContext): boolean {
  if (rule.once && context.firedRules.has(rule.id)) return false;
  if (!ruleMatchesEvent(rule, context.event, context.owner)) return false;

  try {
    for (const condition of rule.conditions) {
      if (!evaluateCondition(condition, context)) return false;
    }
    for (const action of rule.actions) {
      applyAction(action, context);
    }
  } catch (error) {
    context.world.report(
      'error',
      'rule-error',
      `Rule "${rule.name}" failed: ${(error as Error).message}`,
      context.owner?.id,
    );
    return false;
  }

  context.firedRules.add(rule.id);
  return true;
}

/** Human readable summary used by the rules panel and the diagnostics overlay. */
export function describeRuleEvent(rule: Rule): string {
  const suffix = rule.event.name ? ` "${rule.event.name}"` : '';
  switch (rule.event.type) {
    case 'scene-start':
      return 'when the scene starts';
    case 'pointer-click':
      return 'when the object is clicked';
    case 'trigger-enter':
      return 'when something enters';
    case 'trigger-exit':
      return 'when something leaves';
    case 'variable-changed':
      return `when the variable${suffix} changes`;
    case 'interval':
      return `every ${rule.event.interval ?? 1}s`;
    case 'custom':
      return `on the message${suffix}`;
    default:
      return 'when';
  }
}
