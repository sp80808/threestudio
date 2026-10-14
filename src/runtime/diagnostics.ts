/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Runtime diagnostics.
 *
 * The engine never throws at frame time: a broken rule, an unknown behaviour
 * or a runaway event loop is reported once as a diagnostic so the editor can
 * surface it. This keeps authoring mistakes from turning into a black canvas.
 */

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface Diagnostic {
  level: DiagnosticLevel;
  /** Stable machine-readable identifier, e.g. `unknown-behaviour`. */
  code: string;
  message: string;
  /** Simulation time (seconds) when the diagnostic was raised. */
  time: number;
  entityId?: string;
  /** Repetition count for diagnostics that would otherwise spam the log. */
  occurrences?: number;
}

export type DiagnosticHandler = (diagnostic: Diagnostic) => void;

export const DiagnosticCodes = {
  unknownBehaviour: 'unknown-behaviour',
  unknownRuleEvent: 'unknown-rule-event',
  unknownRuleCondition: 'unknown-rule-condition',
  unknownRuleAction: 'unknown-rule-action',
  missingEntity: 'missing-entity',
  missingVariable: 'missing-variable',
  invalidVariableValue: 'invalid-variable-value',
  eventStorm: 'event-storm',
  stepOverflow: 'step-overflow',
  behaviourError: 'behaviour-error',
  hierarchy: 'hierarchy',
  ruleError: 'rule-error',
} as const;

const MAX_ENTRIES = 200;
const MAX_OCCURRENCES_PER_CODE = 5;

export interface DiagnosticsSink {
  report(
    level: DiagnosticLevel,
    code: string,
    message: string,
    options?: { entityId?: string },
  ): void;
  entries(): Diagnostic[];
  clear(): void;
  counts(): Record<DiagnosticLevel, number>;
  onReport(handler: DiagnosticHandler): () => void;
}

export function createDiagnosticsSink(getTime: () => number = () => 0): DiagnosticsSink {
  const entries: Diagnostic[] = [];
  const seen = new Map<string, number>();
  const handlers = new Set<DiagnosticHandler>();
  const counts: Record<DiagnosticLevel, number> = { info: 0, warning: 0, error: 0 };

  const report: DiagnosticsSink['report'] = (level, code, message, options = {}) => {
    counts[level] += 1;
    const key = `${code}|${options.entityId ?? ''}|${message}`;
    const seenCount = seen.get(key) ?? 0;
    seen.set(key, seenCount + 1);

    // Suppress duplicates: keep the first few, then only bump the counter.
    if (seenCount >= MAX_OCCURRENCES_PER_CODE) {
      const existing = entries.find(
        (entry) => entry.code === code && entry.message === message && entry.entityId === options.entityId,
      );
      if (existing) existing.occurrences = (existing.occurrences ?? 1) + 1;
      return;
    }

    const diagnostic: Diagnostic = {
      level,
      code,
      message,
      time: getTime(),
      occurrences: 1,
      ...(options.entityId ? { entityId: options.entityId } : {}),
    };

    entries.push(diagnostic);
    if (entries.length > MAX_ENTRIES) entries.shift();
    for (const handler of handlers) handler(diagnostic);
  };

  return {
    report,
    entries: () => [...entries],
    clear: () => {
      entries.length = 0;
      seen.clear();
      counts.info = 0;
      counts.warning = 0;
      counts.error = 0;
    },
    counts: () => ({ ...counts }),
    onReport: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
