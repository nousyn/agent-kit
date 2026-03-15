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

function toPascalCase(str: string): string {
    return str
        .split(/[-_]/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join('');
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function matcherToRegex(match: RegExp | string | undefined): string {
    if (match === undefined || match === '*') return '/.*/';
    if (match instanceof RegExp) return match.toString();
    return `/${match}/`;
}

// ---------------------------------------------------------------------------
// OpenCode Translator
// ---------------------------------------------------------------------------

/**
 * Translates intent-based hooks into an OpenCode plugin file.
 *
 * OpenCode constraints:
 * - All hooks must merge into a single .ts plugin file
 * - Plugin exports an async factory function that returns a hook object
 * - Hooks are keys in the returned object (e.g. "tool.execute.before")
 * - Each hook is an async function(input, output) that modifies output in-place
 * - No explicit block mechanism for tool.execute.before (partial support)
 */
export class OpenCodeTranslator implements AgentHookTranslator {
    translate(
        intents: readonly HookIntent[],
        rawHooks: ReadonlyMap<string, RawHookRegistration>,
        extendHooks: ReadonlyMap<string, readonly ExtendHookRegistration[]>,
        toolName: string,
    ): TranslationResult {
        const warnings: string[] = [];
        const skipped: TranslationResult['skipped'] = [];

        // Collect all hook bodies keyed by OpenCode hook name
        const hookBodies: Map<string, string[]> = new Map();

        // Track intent-generated hooks for conflict detection
        const intentGeneratedHooks = new Set<string>();

        // --- inject intents ---
        const injectIntents = intents.filter((i): i is InjectIntent => i.type === 'inject');
        if (injectIntents.length > 0) {
            const hookName = 'experimental.chat.messages.transform';

            if (rawHooks.has(`opencode::${hookName}`)) {
                warnings.push(`[opencode] raw hook for ${hookName} overrides inject intent.`);
            } else {
                const body = this.buildInjectHookBody(injectIntents);
                this.addHookBody(hookBodies, hookName, body);
                intentGeneratedHooks.add(hookName);
            }

            // compaction → experimental.session.compacting
            const compactions = injectIntents.filter((i) => i.compaction);
            if (compactions.length > 0) {
                const compactHook = 'experimental.session.compacting';
                if (rawHooks.has(`opencode::${compactHook}`)) {
                    warnings.push(`[opencode] raw hook for ${compactHook} overrides inject.compaction intent.`);
                } else {
                    const combined = compactions.map((i) => i.compaction!).join('\\n\\n');
                    const body = `            output.context.push(\`${combined}\`);`;
                    this.addHookBody(hookBodies, compactHook, body);
                    intentGeneratedHooks.add(compactHook);
                }
            }

            warnings.push(
                `[opencode] inject relies on experimental.chat.messages.transform which is marked experimental and may change.`,
            );
        }

        // --- beforeToolCall intents ---
        const beforeIntents = intents.filter((i): i is BeforeToolCallIntent => i.type === 'beforeToolCall');
        if (beforeIntents.length > 0) {
            const hookName = 'tool.execute.before';
            if (rawHooks.has(`opencode::${hookName}`)) {
                warnings.push(`[opencode] raw hook for ${hookName} overrides beforeToolCall intent.`);
            } else {
                const body = this.buildBeforeToolCallBody(beforeIntents);
                this.addHookBody(hookBodies, hookName, body);
                intentGeneratedHooks.add(hookName);

                if (beforeIntents.some((i) => true)) {
                    warnings.push(
                        `[opencode] beforeToolCall.block: OpenCode's tool.execute.before has no explicit block mechanism. ` +
                            `Blocking is simulated by clearing tool arguments, which may produce inconsistent behavior.`,
                    );
                }
            }
        }

        // --- afterToolCall intents ---
        const afterIntents = intents.filter((i): i is AfterToolCallIntent => i.type === 'afterToolCall');
        if (afterIntents.length > 0) {
            const hookName = 'tool.execute.after';
            if (rawHooks.has(`opencode::${hookName}`)) {
                warnings.push(`[opencode] raw hook for ${hookName} overrides afterToolCall intent.`);
            } else {
                const body = this.buildAfterToolCallBody(afterIntents);
                this.addHookBody(hookBodies, hookName, body);
                intentGeneratedHooks.add(hookName);
            }
        }

        // --- onSession intents ---
        const sessionIntents = intents.filter((i): i is OnSessionIntent => i.type === 'onSession');
        if (sessionIntents.length > 0) {
            const hookName = 'event';
            if (rawHooks.has(`opencode::${hookName}`)) {
                warnings.push(`[opencode] raw hook for ${hookName} overrides onSession intent.`);
            } else {
                const body = this.buildSessionBody(sessionIntents);
                this.addHookBody(hookBodies, hookName, body);
                intentGeneratedHooks.add(hookName);
            }
        }

        // --- onPermission intents ---
        const permIntents = intents.filter((i): i is OnPermissionIntent => i.type === 'onPermission');
        if (permIntents.length > 0) {
            const hookName = 'permission.ask';
            if (rawHooks.has(`opencode::${hookName}`)) {
                warnings.push(`[opencode] raw hook for ${hookName} overrides onPermission intent.`);
            } else {
                const body = this.buildPermissionBody(permIntents);
                this.addHookBody(hookBodies, hookName, body);
                intentGeneratedHooks.add(hookName);
            }
        }

        // --- Apply extend hooks ---
        for (const hookName of hookBodies.keys()) {
            const key = `opencode::${hookName}`;
            const extends_ = extendHooks.get(key);
            if (extends_ && extends_.length > 0) {
                for (const ext of extends_) {
                    this.addHookBody(hookBodies, hookName, `            // --- extend ---\n${ext.handler}`);
                }
            }
        }

        // --- Raw hooks: merge directly ---
        for (const [key, reg] of rawHooks) {
            if (!key.startsWith('opencode::')) continue;
            const hookName = key.split('::')[1];

            if (intentGeneratedHooks.has(hookName)) {
                warnings.push(`[opencode] raw hook for ${hookName} replaces intent-generated hook.`);
                hookBodies.delete(hookName);
            }

            this.addHookBody(hookBodies, hookName, reg.handler);
        }

        // --- Generate the single plugin file ---
        const files: Record<string, string> = {};
        if (hookBodies.size > 0) {
            files[`${toolName}-plugin.ts`] = this.buildPluginFile(toolName, hookBodies);
        }

        return { files, warnings, skipped };
    }

    getSettingsEntries(): SettingsHookEntry[] {
        // OpenCode doesn't use settings.json for hooks
        return [];
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private addHookBody(map: Map<string, string[]>, hookName: string, body: string): void {
        const existing = map.get(hookName) ?? [];
        existing.push(body);
        map.set(hookName, existing);
    }

    private buildInjectHookBody(intents: InjectIntent[]): string {
        const perTurnParts = intents.map((i) => i.perTurn);
        const sessionStartParts = intents.filter((i) => i.sessionStart).map((i) => i.sessionStart!);

        const hasSessionStart = sessionStartParts.length > 0;
        const perTurnCombined = perTurnParts.join('\\n\\n');
        const sessionStartCombined = hasSessionStart
            ? [...sessionStartParts, ...perTurnParts].join('\\n\\n')
            : perTurnCombined;

        return `            const messages = output.messages;
            if (!messages || messages.length === 0) return;

            const sessionID = messages[0]?.info?.sessionID;
            const isNewSession = sessionID && !_seenSessions.has(sessionID);
            if (sessionID) _seenSessions.add(sessionID);

            const reminder = isNewSession
                ? \`${sessionStartCombined}\`
                : \`${perTurnCombined}\`;

            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].info?.role === "user") {
                    messages[i].parts.push({ type: "text", text: reminder });
                    break;
                }
            }`;
    }

    private buildBeforeToolCallBody(intents: BeforeToolCallIntent[]): string {
        const cases = intents.map((intent, i) => {
            const regex = matcherToRegex(intent.match);
            return `            // beforeToolCall intent #${i + 1}
            if (${regex}.test(output.toolName || "")) {
                // Handler evaluated at runtime via agent-kit
            }`;
        });

        return cases.join('\n\n');
    }

    private buildAfterToolCallBody(intents: AfterToolCallIntent[]): string {
        const cases = intents.map((intent, i) => {
            const regex = matcherToRegex(intent.match);
            return `            // afterToolCall observer #${i + 1}
            if (${regex}.test(output.toolName || "")) {
                // Observer evaluated at runtime via agent-kit
            }`;
        });

        return cases.join('\n\n');
    }

    private buildSessionBody(intents: OnSessionIntent[]): string {
        return `            const eventType = output.type || "";
            if (eventType === "session.start") {
                // onSession.start handlers
            } else if (eventType === "session.end") {
                // onSession.end handlers
            }`;
    }

    private buildPermissionBody(intents: OnPermissionIntent[]): string {
        const cases = intents.map((intent, i) => {
            const regex = matcherToRegex(intent.match);
            return `            // onPermission handler #${i + 1}
            if (${regex}.test(output.toolName || "")) {
                // Permission decision evaluated at runtime via agent-kit
            }`;
        });

        return cases.join('\n\n');
    }

    private buildPluginFile(toolName: string, hookBodies: Map<string, string[]>): string {
        const exportName = toPascalCase(toolName) + 'Plugin';

        const hookEntries = Array.from(hookBodies.entries())
            .map(([hookName, bodies]) => {
                const combinedBody = bodies.join('\n\n');
                return `        "${hookName}": async (_input: unknown, output: any) => {
${combinedBody}
        }`;
            })
            .join(',\n\n');

        return `/**
 * ${capitalize(toolName)} Plugin for OpenCode
 * Generated by @s_s/agent-kit
 */

const _seenSessions = new Set<string>();

export const ${exportName} = async () => {
    return {
${hookEntries}
    };
};
`;
    }
}
