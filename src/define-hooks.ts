import { AGENT_TYPES } from './types.js';
import type { AgentType, AgentEventMap, HookDefinition, HookSet } from './types.js';

// ---------------------------------------------------------------------------
// Valid event names per agent (for runtime validation)
// ---------------------------------------------------------------------------

const VALID_EVENTS: Record<AgentType, ReadonlySet<string>> = {
    'claude-code': new Set([
        'SessionStart',
        'InstructionsLoaded',
        'UserPromptSubmit',
        'PreToolUse',
        'PermissionRequest',
        'PostToolUse',
        'PostToolUseFailure',
        'Notification',
        'SubagentStart',
        'SubagentStop',
        'Stop',
        'TeammateIdle',
        'TaskCompleted',
        'ConfigChange',
        'WorktreeCreate',
        'WorktreeRemove',
        'PreCompact',
        'PostCompact',
        'Elicitation',
        'ElicitationResult',
        'SessionEnd',
    ]),
    codex: new Set([
        'SessionStart',
        'InstructionsLoaded',
        'UserPromptSubmit',
        'PreToolUse',
        'PermissionRequest',
        'PostToolUse',
        'PostToolUseFailure',
        'Notification',
        'SubagentStart',
        'SubagentStop',
        'Stop',
        'TeammateIdle',
        'TaskCompleted',
        'ConfigChange',
        'WorktreeCreate',
        'WorktreeRemove',
        'PreCompact',
        'PostCompact',
        'Elicitation',
        'ElicitationResult',
        'SessionEnd',
    ]),
    opencode: new Set([
        'event',
        'config',
        'tool',
        'auth',
        'chat.message',
        'chat.params',
        'chat.headers',
        'permission.ask',
        'command.execute.before',
        'tool.execute.before',
        'shell.env',
        'tool.execute.after',
        'experimental.chat.messages.transform',
        'experimental.chat.system.transform',
        'experimental.session.compacting',
        'experimental.text.complete',
        'tool.definition',
    ]),
    openclaw: new Set([
        // Plugin hooks
        'before_model_resolve',
        'before_prompt_build',
        'before_agent_start',
        'llm_input',
        'llm_output',
        'agent_end',
        'before_compaction',
        'after_compaction',
        'before_reset',
        'message_received',
        'message_sending',
        'message_sent',
        'before_tool_call',
        'after_tool_call',
        'tool_result_persist',
        'before_message_write',
        'session_start',
        'session_end',
        'subagent_spawning',
        'subagent_delivery_target',
        'subagent_spawned',
        'subagent_ended',
        'gateway_start',
        'gateway_stop',
        // Internal hooks
        'command:new',
        'command:reset',
        'command:stop',
        'session:compact:before',
        'session:compact:after',
        'agent:bootstrap',
        'gateway:startup',
        'message:received',
        'message:sent',
        'message:transcribed',
        'message:preprocessed',
    ]),
};

// ---------------------------------------------------------------------------
// defineHooks — pure validation + packaging function
// ---------------------------------------------------------------------------

/**
 * Define hooks for a specific agent. Returns a validated HookSet that can be
 * passed to `kit.installHooks()`.
 *
 * Pure function — no side effects, no global state, no instance dependency.
 *
 * @param agent - Target agent type.
 * @param definitions - A single HookDefinition or an array of HookDefinitions.
 *
 * @example
 * ```ts
 * // Single definition
 * const hooks = defineHooks('claude-code', {
 *   events: ['PreToolUse', 'PostToolUse'],
 *   content: '#!/bin/bash\necho "hook fired"',
 * });
 *
 * // Multiple definitions
 * const hooks = defineHooks('claude-code', [
 *   { events: ['PreToolUse'], content: '#!/bin/bash\necho "pre"' },
 *   { events: ['PostToolUse'], content: '#!/bin/bash\necho "post"' },
 * ]);
 * ```
 */
export function defineHooks<A extends AgentType>(
    agent: A,
    definitions: HookDefinition<A> | HookDefinition<A>[],
): HookSet<A> {
    // Validate agent
    if (!AGENT_TYPES.includes(agent)) {
        throw new Error(`defineHooks: unknown agent type "${agent}". Valid types: ${AGENT_TYPES.join(', ')}`);
    }

    // Normalize to array
    const defs = Array.isArray(definitions) ? definitions : [definitions];

    if (defs.length === 0) {
        throw new Error('defineHooks: definitions array cannot be empty.');
    }

    // OpenClaw: warn if multiple definitions provided (only first is used)
    const warnings: string[] = [];
    if (agent === 'openclaw' && defs.length > 1) {
        warnings.push(
            `defineHooks: OpenClaw only supports a single hook definition. ` +
                `Got ${defs.length} definitions — only the first will be used.`,
        );
        // Log warning (user can also see it in installHooks result)
        console.warn(warnings[0]);
    }

    const validEvents = VALID_EVENTS[agent];

    for (let i = 0; i < defs.length; i++) {
        const def = defs[i];

        // Validate events
        if (!Array.isArray(def.events) || def.events.length === 0) {
            throw new Error(`defineHooks: definitions[${i}].events must be a non-empty array.`);
        }

        for (const event of def.events) {
            if (!validEvents.has(event as string)) {
                throw new Error(
                    `defineHooks: unknown event "${event}" for agent "${agent}". ` +
                        `Valid events: ${[...validEvents].join(', ')}`,
                );
            }
        }

        // Validate content
        if (typeof def.content !== 'string' || !def.content.trim()) {
            throw new Error(`defineHooks: definitions[${i}].content must be a non-empty string.`);
        }
    }

    // For OpenClaw, only keep first definition
    const effectiveDefs = agent === 'openclaw' && defs.length > 1 ? [defs[0]] : defs;

    return {
        __brand: 'HookSet' as const,
        agent,
        definitions: Object.freeze([...effectiveDefs]) as readonly HookDefinition<A>[],
    };
}

/**
 * Get the set of valid event names for a given agent.
 * Useful for tooling and documentation generation.
 */
export function getValidEvents(agent: AgentType): ReadonlySet<string> {
    if (!AGENT_TYPES.includes(agent)) {
        throw new Error(`getValidEvents: unknown agent type "${agent}".`);
    }
    return VALID_EVENTS[agent];
}
