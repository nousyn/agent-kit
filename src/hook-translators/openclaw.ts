import type { AgentHookTranslator, TranslationResult, SettingsHookEntry } from './types.js';
import type {
    HookIntent,
    InjectIntent,
    BeforeToolCallIntent,
    AfterToolCallIntent,
    OnSessionIntent,
    OnPermissionIntent,
    RawHookRegistration,
    ExtendHookRegistration,
} from '../hook-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function matcherToRegex(match: RegExp | string | undefined): string {
    if (match === undefined || match === '*') return '/.*/';
    if (match instanceof RegExp) return match.toString();
    return `/${match}/`;
}

// ---------------------------------------------------------------------------
// OpenClaw Translator
// ---------------------------------------------------------------------------

/**
 * Translates intent-based hooks into OpenClaw native format.
 *
 * OpenClaw dual-layer system:
 * - Internal hooks: type:action string keys, event objects, errors never propagate
 * - Plugin hooks: typed, validated, modifying hooks run sequentially by priority
 *
 * File format:
 * - HOOK.md with YAML frontmatter (name, description, metadata.openclaw.events)
 * - handler.ts exporting default async function
 */
export class OpenClawTranslator implements AgentHookTranslator {
    translate(
        intents: readonly HookIntent[],
        rawHooks: ReadonlyMap<string, RawHookRegistration>,
        extendHooks: ReadonlyMap<string, readonly ExtendHookRegistration[]>,
        toolName: string,
    ): TranslationResult {
        const files: Record<string, string> = {};
        const warnings: string[] = [];
        const skipped: TranslationResult['skipped'] = [];

        // OpenClaw hook files live in subdirectories per hook type.
        // We collect all events that the main handler needs to respond to,
        // and internal hooks that need separate registration.
        const pluginEvents = new Set<string>();
        const internalEvents = new Set<string>();
        const handlerSections: string[] = [];

        // Track intent-generated hooks for conflict detection
        const intentGeneratedPluginHooks = new Set<string>();
        const intentGeneratedInternalHooks = new Set<string>();

        // --- inject intents ---
        const injectIntents = intents.filter((i): i is InjectIntent => i.type === 'inject');
        if (injectIntents.length > 0) {
            const internalHook = 'agent:bootstrap';

            if (rawHooks.has(`openclaw::${internalHook}`)) {
                warnings.push(`[openclaw] raw hook for ${internalHook} overrides inject intent.`);
            } else {
                internalEvents.add(internalHook);
                intentGeneratedInternalHooks.add(internalHook);

                const reminderParts = injectIntents
                    .flatMap((i) => [i.sessionStart, i.perTurn].filter(Boolean))
                    .join('\\n\\n');

                handlerSections.push(this.buildInjectSection(toolName, reminderParts));
            }

            // session_start / session_end via plugin hooks
            const sessionStarts = injectIntents.filter((i) => i.sessionStart);
            if (sessionStarts.length > 0 && !rawHooks.has('openclaw::session_start')) {
                pluginEvents.add('session_start');
                intentGeneratedPluginHooks.add('session_start');
            }

            const sessionEnds = injectIntents.filter((i) => i.sessionEnd);
            if (sessionEnds.length > 0 && !rawHooks.has('openclaw::session_end')) {
                pluginEvents.add('session_end');
                intentGeneratedPluginHooks.add('session_end');
                const combined = sessionEnds.map((i) => i.sessionEnd!).join('\\n\\n');
                handlerSections.push(this.buildSessionEndInjectSection(combined));
            }

            // compaction → session:compact:before (internal) or before_compaction (plugin)
            const compactions = injectIntents.filter((i) => i.compaction);
            if (compactions.length > 0) {
                if (!rawHooks.has('openclaw::before_compaction')) {
                    pluginEvents.add('before_compaction');
                    intentGeneratedPluginHooks.add('before_compaction');
                    const combined = compactions.map((i) => i.compaction!).join('\\n\\n');
                    handlerSections.push(this.buildCompactionSection(combined));
                }
            }
        }

        // --- beforeToolCall intents ---
        const beforeIntents = intents.filter((i): i is BeforeToolCallIntent => i.type === 'beforeToolCall');
        if (beforeIntents.length > 0) {
            const hookName = 'before_tool_call';
            if (rawHooks.has(`openclaw::${hookName}`)) {
                warnings.push(`[openclaw] raw hook for ${hookName} overrides beforeToolCall intent.`);
            } else {
                pluginEvents.add(hookName);
                intentGeneratedPluginHooks.add(hookName);
                handlerSections.push(this.buildBeforeToolCallSection(beforeIntents));
            }
        }

        // --- afterToolCall intents ---
        const afterIntents = intents.filter((i): i is AfterToolCallIntent => i.type === 'afterToolCall');
        if (afterIntents.length > 0) {
            const hookName = 'after_tool_call';
            if (rawHooks.has(`openclaw::${hookName}`)) {
                warnings.push(`[openclaw] raw hook for ${hookName} overrides afterToolCall intent.`);
            } else {
                pluginEvents.add(hookName);
                intentGeneratedPluginHooks.add(hookName);
                handlerSections.push(this.buildAfterToolCallSection(afterIntents));
            }
        }

        // --- onSession intents ---
        const sessionIntents = intents.filter((i): i is OnSessionIntent => i.type === 'onSession');
        if (sessionIntents.length > 0) {
            const hasStart = sessionIntents.some((i) => i.start);
            const hasEnd = sessionIntents.some((i) => i.end);

            if (hasStart && !intentGeneratedPluginHooks.has('session_start')) {
                if (rawHooks.has('openclaw::session_start')) {
                    warnings.push(`[openclaw] raw hook for session_start overrides onSession.start intent.`);
                } else {
                    pluginEvents.add('session_start');
                    intentGeneratedPluginHooks.add('session_start');
                    handlerSections.push(this.buildOnSessionSection('start'));
                }
            }

            if (hasEnd && !intentGeneratedPluginHooks.has('session_end')) {
                if (rawHooks.has('openclaw::session_end')) {
                    warnings.push(`[openclaw] raw hook for session_end overrides onSession.end intent.`);
                } else {
                    pluginEvents.add('session_end');
                    intentGeneratedPluginHooks.add('session_end');
                    handlerSections.push(this.buildOnSessionSection('end'));
                }
            }
        }

        // --- onPermission intents ---
        const permIntents = intents.filter((i): i is OnPermissionIntent => i.type === 'onPermission');
        if (permIntents.length > 0) {
            // OpenClaw has no dedicated permission hook.
            // Best effort: degrade to before_tool_call with block capability.
            skipped.push({
                intent: 'onPermission',
                agent: 'openclaw',
                reason:
                    'OpenClaw has no dedicated permission request hook. ' +
                    'Consider using hooks.raw() with before_tool_call for similar behavior.',
            });
            warnings.push(
                `[openclaw] onPermission: not supported. OpenClaw has no PermissionRequest equivalent. ` +
                    `Use hooks.raw("openclaw", "before_tool_call", ...) as a workaround.`,
            );
        }

        // --- Apply extend hooks to handler sections ---
        for (const hookName of [...intentGeneratedPluginHooks, ...intentGeneratedInternalHooks]) {
            const key = `openclaw::${hookName}`;
            const extends_ = extendHooks.get(key);
            if (extends_ && extends_.length > 0) {
                for (const ext of extends_) {
                    handlerSections.push(`    // --- extend for ${hookName} ---\n    ${ext.handler}`);
                }
            }
        }

        // --- Build HOOK.md and handler.ts ---
        if (handlerSections.length > 0 || internalEvents.size > 0 || pluginEvents.size > 0) {
            const allEvents = [...internalEvents, ...pluginEvents];
            files['HOOK.md'] = this.buildHookMd(toolName, allEvents);
            files['handler.ts'] = this.buildHandlerTs(toolName, handlerSections, internalEvents, pluginEvents);
        }

        // --- Raw hooks: write as additional files ---
        for (const [key, reg] of rawHooks) {
            if (!key.startsWith('openclaw::')) continue;
            const hookName = key.split('::')[1];

            if (intentGeneratedPluginHooks.has(hookName) || intentGeneratedInternalHooks.has(hookName)) {
                warnings.push(`[openclaw] raw hook for ${hookName} replaces intent-generated hook.`);
            }

            // Raw hooks get their own subdirectory-style files
            const safeName = hookName.replace(/[:.]/g, '-');
            files[`raw-${safeName}.ts`] = reg.handler;
        }

        return { files, warnings, skipped };
    }

    getSettingsEntries(): SettingsHookEntry[] {
        // OpenClaw doesn't use settings.json for hooks
        return [];
    }

    // -----------------------------------------------------------------------
    // Section builders
    // -----------------------------------------------------------------------

    private buildInjectSection(toolName: string, reminderContent: string): string {
        const constName = toolName.toUpperCase().replace(/-/g, '_') + '_REMINDER';
        return `    // --- inject (agent:bootstrap) ---
    if (event.type === 'agent' && event.action === 'bootstrap') {
        if (event.sessionKey && event.sessionKey.includes(':subagent:')) {
            return;
        }
        if (Array.isArray(event.context?.bootstrapFiles)) {
            event.context.bootstrapFiles.push({
                path: '${constName}.md',
                content: \`${reminderContent}\`,
                virtual: true,
            });
        }
    }`;
    }

    private buildSessionEndInjectSection(content: string): string {
        return `    // --- inject.sessionEnd (session_end) ---
    if (event.hookName === 'session_end') {
        // Session end content: ${content.substring(0, 50)}...
    }`;
    }

    private buildCompactionSection(content: string): string {
        return `    // --- inject.compaction (before_compaction) ---
    if (event.hookName === 'before_compaction') {
        if (event.context) {
            event.context.additionalContext = (event.context.additionalContext || '') +
                '\\n' + \`${content}\`;
        }
    }`;
    }

    private buildBeforeToolCallSection(intents: BeforeToolCallIntent[]): string {
        const cases = intents.map((intent, i) => {
            const regex = matcherToRegex(intent.match);
            return `        // beforeToolCall handler #${i + 1}
        if (${regex}.test(event.toolName || "")) {
            // Handler evaluated at runtime via agent-kit
        }`;
        });

        return `    // --- beforeToolCall (before_tool_call) ---
    if (event.hookName === 'before_tool_call') {
${cases.join('\n\n')}
    }`;
    }

    private buildAfterToolCallSection(intents: AfterToolCallIntent[]): string {
        const cases = intents.map((intent, i) => {
            const regex = matcherToRegex(intent.match);
            return `        // afterToolCall observer #${i + 1}
        if (${regex}.test(event.toolName || "")) {
            // Observer evaluated at runtime via agent-kit
        }`;
        });

        return `    // --- afterToolCall (after_tool_call) ---
    if (event.hookName === 'after_tool_call') {
${cases.join('\n\n')}
    }`;
    }

    private buildOnSessionSection(phase: 'start' | 'end'): string {
        return `    // --- onSession.${phase} (session_${phase}) ---
    if (event.hookName === 'session_${phase}') {
        // Session ${phase} handler — extend with hooks.extend() for custom logic.
    }`;
    }

    // -----------------------------------------------------------------------
    // File builders
    // -----------------------------------------------------------------------

    private buildHookMd(toolName: string, events: string[]): string {
        return `---
name: ${toolName}
description: "${capitalize(toolName)} hook - generated by @s_s/agent-kit"
metadata: {"openclaw":{"events":${JSON.stringify(events)}}}
---
`;
    }

    private buildHandlerTs(
        toolName: string,
        sections: string[],
        _internalEvents: Set<string>,
        _pluginEvents: Set<string>,
    ): string {
        return `/**
 * ${capitalize(toolName)} Hook Handler for OpenClaw
 * Generated by @s_s/agent-kit
 */

const handler = async (event: any) => {
${sections.join('\n\n')}
};

export default handler;
`;
    }
}
