import type { AgentType } from './types.js';
import type { IntentType } from './hook-types.js';

// ---------------------------------------------------------------------------
// Support levels
// ---------------------------------------------------------------------------

/** How well an agent supports a particular intent sub-capability. */
export type SupportLevel = 'supported' | 'partial' | 'unsupported';

/**
 * Capability entry describing support for a specific intent sub-capability on a specific agent.
 */
export interface CapabilityEntry {
    level: SupportLevel;
    /** Human-readable note explaining partial/unsupported status. */
    note?: string;
}

// ---------------------------------------------------------------------------
// Capability matrix — static data
// ---------------------------------------------------------------------------

/**
 * Sub-capabilities per intent type.
 */
export interface IntentCapabilities {
    inject: {
        perTurn: CapabilityEntry;
        sessionStart: CapabilityEntry;
        compaction: CapabilityEntry;
        sessionEnd: CapabilityEntry;
    };
    beforeToolCall: {
        intercept: CapabilityEntry;
        block: CapabilityEntry;
        modifyArgs: CapabilityEntry;
        matcher: CapabilityEntry;
    };
    afterToolCall: {
        observe: CapabilityEntry;
        matcher: CapabilityEntry;
    };
    onSession: {
        start: CapabilityEntry;
        end: CapabilityEntry;
    };
    onPermission: {
        decide: CapabilityEntry;
        matcher: CapabilityEntry;
    };
}

const S: CapabilityEntry = { level: 'supported' };
const U = (note: string): CapabilityEntry => ({ level: 'unsupported', note });
const P = (note: string): CapabilityEntry => ({ level: 'partial', note });

/**
 * The capability matrix: intent sub-capability × agent → support level.
 *
 * This is the single source of truth for what each agent can and cannot do
 * with each intent type. Used by installHooks() to generate precise warnings.
 */
export const CAPABILITY_MATRIX: Record<AgentType, IntentCapabilities> = {
    'claude-code': {
        inject: {
            perTurn: S,
            sessionStart: S,
            compaction: S,
            sessionEnd: S,
        },
        beforeToolCall: {
            intercept: S,
            block: S,
            modifyArgs: S,
            matcher: S,
        },
        afterToolCall: {
            observe: S,
            matcher: S,
        },
        onSession: {
            start: S,
            end: S,
        },
        onPermission: {
            decide: S,
            matcher: S,
        },
    },

    codex: {
        inject: {
            perTurn: S,
            sessionStart: S,
            compaction: S,
            sessionEnd: S,
        },
        beforeToolCall: {
            intercept: S,
            block: S,
            modifyArgs: S,
            matcher: S,
        },
        afterToolCall: {
            observe: S,
            matcher: S,
        },
        onSession: {
            start: S,
            end: S,
        },
        onPermission: {
            decide: S,
            matcher: S,
        },
    },

    opencode: {
        inject: {
            perTurn: S,
            sessionStart: S,
            compaction: P('Relies on experimental.session.compacting which is marked experimental and may change.'),
            sessionEnd: U('OpenCode has no session end hook. The event hook does not emit session.end.'),
        },
        beforeToolCall: {
            intercept: S,
            block: P(
                "OpenCode's tool.execute.before has no explicit block mechanism. " +
                    'Blocking is simulated by clearing tool arguments, which may produce inconsistent behavior.',
            ),
            modifyArgs: S,
            matcher: U(
                'OpenCode hooks do not support regex matchers. All tool calls are received; filtering is done in handler code.',
            ),
        },
        afterToolCall: {
            observe: S,
            matcher: U(
                'OpenCode hooks do not support regex matchers. All tool calls are received; filtering is done in handler code.',
            ),
        },
        onSession: {
            start: P('OpenCode session start is detected via event hook filtering, not a dedicated hook.'),
            end: U('OpenCode has no session end hook.'),
        },
        onPermission: {
            decide: S,
            matcher: U('OpenCode permission.ask does not support regex matchers.'),
        },
    },

    openclaw: {
        inject: {
            perTurn: S,
            sessionStart: S,
            compaction: S,
            sessionEnd: P(
                'OpenClaw session_end is a void plugin hook; content injection may not reach the agent context.',
            ),
        },
        beforeToolCall: {
            intercept: S,
            block: S,
            modifyArgs: S,
            matcher: U('OpenClaw before_tool_call does not support regex matchers. All tool calls are received.'),
        },
        afterToolCall: {
            observe: S,
            matcher: U('OpenClaw after_tool_call does not support regex matchers. All tool calls are received.'),
        },
        onSession: {
            start: S,
            end: S,
        },
        onPermission: {
            decide: U(
                'OpenClaw has no dedicated permission hook. Use hooks.raw() with before_tool_call as a workaround.',
            ),
            matcher: U('OpenClaw has no dedicated permission hook.'),
        },
    },
};

// ---------------------------------------------------------------------------
// Degradation check API
// ---------------------------------------------------------------------------

/**
 * A degradation warning for a specific intent on a specific agent.
 */
export interface DegradationWarning {
    agent: AgentType;
    intent: IntentType;
    capability: string;
    level: SupportLevel;
    message: string;
}

/**
 * Check all sub-capabilities for a given intent type on a given agent.
 * Returns warnings for any partial or unsupported sub-capabilities.
 *
 * Only checks sub-capabilities that the intent actually uses.
 * For example, if an inject intent has no `compaction` field, the compaction
 * capability is not checked.
 */
export function checkDegradation(
    agent: AgentType,
    intentType: IntentType,
    usedCapabilities?: string[],
): DegradationWarning[] {
    const caps = CAPABILITY_MATRIX[agent][intentType];
    const warnings: DegradationWarning[] = [];

    const entries = Object.entries(caps) as [string, CapabilityEntry][];

    for (const [capName, entry] of entries) {
        // If usedCapabilities is specified, only check those
        if (usedCapabilities && !usedCapabilities.includes(capName)) continue;

        if (entry.level !== 'supported') {
            warnings.push({
                agent,
                intent: intentType,
                capability: capName,
                level: entry.level,
                message: `[${agent}] ${intentType}.${capName}: ${entry.note ?? `${entry.level} — no details available.`}`,
            });
        }
    }

    return warnings;
}

/**
 * Check degradation for all registered intents on a specific agent.
 * Analyzes which sub-capabilities each intent actually uses and only
 * warns about those.
 */
export function checkAllDegradation(agent: AgentType, intentTypes: IntentType[]): DegradationWarning[] {
    const warnings: DegradationWarning[] = [];
    const seen = new Set<string>();

    for (const intentType of intentTypes) {
        const intentWarnings = checkDegradation(agent, intentType);
        for (const w of intentWarnings) {
            const key = `${w.agent}::${w.intent}::${w.capability}`;
            if (!seen.has(key)) {
                seen.add(key);
                warnings.push(w);
            }
        }
    }

    return warnings;
}

/**
 * Check if a specific intent type is fully unsupported on an agent.
 * Returns true only if ALL sub-capabilities are unsupported.
 */
export function isIntentFullyUnsupported(agent: AgentType, intentType: IntentType): boolean {
    const caps = CAPABILITY_MATRIX[agent][intentType];
    return Object.values(caps).every((entry) => entry.level === 'unsupported');
}

/**
 * Detect conflicts between intent-generated hooks and raw hooks.
 *
 * @param agent - The target agent.
 * @param intentNativeHooks - Set of native hook names generated by intents.
 * @param rawNativeHooks - Set of native hook names registered via hooks.raw().
 * @returns Warning messages for each conflict.
 */
export function detectConflicts(
    agent: AgentType,
    intentNativeHooks: Set<string>,
    rawNativeHooks: Set<string>,
): string[] {
    const warnings: string[] = [];

    for (const hookName of intentNativeHooks) {
        if (rawNativeHooks.has(hookName)) {
            warnings.push(
                `[${agent}] Conflict: raw hook for '${hookName}' overrides intent-generated hook. ` +
                    `The raw hook will be used; intent-generated logic for this hook is discarded.`,
            );
        }
    }

    return warnings;
}
