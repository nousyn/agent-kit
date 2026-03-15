import type { AgentType } from './types.js';
import type {
    InjectIntent,
    BeforeToolCallIntent,
    AfterToolCallIntent,
    OnSessionIntent,
    OnPermissionIntent,
    HookIntent,
    RawHookRegistration,
    ExtendHookRegistration,
} from './hook-types.js';

// ---------------------------------------------------------------------------
// Internal state — module-level singleton
// ---------------------------------------------------------------------------

/** All registered intents (ordered by registration time). */
let intents: HookIntent[] = [];

/** Raw hook registrations keyed by `${agent}::${hookName}`. */
let rawHooks: Map<string, RawHookRegistration> = new Map();

/** Extend hook registrations keyed by `${agent}::${hookName}` (multiple per key). */
let extendHooks: Map<string, ExtendHookRegistration[]> = new Map();

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function rawKey(agent: AgentType, hookName: string): string {
    return `${agent}::${hookName}`;
}

// ---------------------------------------------------------------------------
// Read-only accessors (for translators and installHooks)
// ---------------------------------------------------------------------------

/** Get a snapshot of all registered intents. */
export function getIntents(): readonly HookIntent[] {
    return intents;
}

/** Get intents filtered by type. */
export function getIntentsByType<T extends HookIntent['type']>(type: T): Extract<HookIntent, { type: T }>[] {
    return intents.filter((i) => i.type === type) as Extract<HookIntent, { type: T }>[];
}

/** Get the raw hook map (read-only view). */
export function getRawHooks(): ReadonlyMap<string, RawHookRegistration> {
    return rawHooks;
}

/** Get the extend hook map (read-only view). */
export function getExtendHooks(): ReadonlyMap<string, readonly ExtendHookRegistration[]> {
    return extendHooks;
}

/** Check if a raw hook is registered for a specific agent + native hook name. */
export function hasRawHook(agent: AgentType, hookName: string): boolean {
    return rawHooks.has(rawKey(agent, hookName));
}

/** Get a raw hook registration for a specific agent + native hook name. */
export function getRawHook(agent: AgentType, hookName: string): RawHookRegistration | undefined {
    return rawHooks.get(rawKey(agent, hookName));
}

/** Get extend registrations for a specific agent + native hook name. */
export function getExtendHooksFor(agent: AgentType, hookName: string): readonly ExtendHookRegistration[] {
    return extendHooks.get(rawKey(agent, hookName)) ?? [];
}

// ---------------------------------------------------------------------------
// Intent registration API
// ---------------------------------------------------------------------------

/**
 * Register a content injection intent.
 *
 * Injects text into agent context at various lifecycle points.
 * At minimum, `perTurn` is required.
 *
 * @example
 * ```ts
 * hooks.inject({
 *     perTurn: 'Always remember: you are a helpful assistant.',
 *     sessionStart: 'Welcome! This session uses the Foo tool.',
 *     compaction: 'Preserve the Foo tool context.',
 * });
 * ```
 */
function inject(config: Omit<InjectIntent, 'type'>): void {
    intents.push({ type: 'inject', ...config });
}

/**
 * Register a pre-tool-call interception intent.
 *
 * Intercept tool calls before execution — can block or modify arguments.
 *
 * @example
 * ```ts
 * hooks.beforeToolCall({
 *     match: /^(Bash|Write)/,
 *     handler: (ctx) => {
 *         if (ctx.args.path?.includes('/etc/')) {
 *             return { block: true, reason: 'Cannot modify /etc/' };
 *         }
 *     },
 * });
 * ```
 */
function beforeToolCall(config: Omit<BeforeToolCallIntent, 'type'>): void {
    intents.push({ type: 'beforeToolCall', ...config });
}

/**
 * Register a post-tool-call observation intent.
 *
 * Observe tool call results — cannot modify, only react.
 *
 * @example
 * ```ts
 * hooks.afterToolCall({
 *     match: 'Bash',
 *     handler: (ctx) => {
 *         console.log(`Tool ${ctx.toolName} returned: ${ctx.result}`);
 *     },
 * });
 * ```
 */
function afterToolCall(config: Omit<AfterToolCallIntent, 'type'>): void {
    intents.push({ type: 'afterToolCall', ...config });
}

/**
 * Register a session lifecycle intent.
 *
 * React to session start and/or end.
 *
 * @example
 * ```ts
 * hooks.onSession({
 *     start: (ctx) => console.log('Session started:', ctx.sessionId),
 *     end: (ctx) => console.log('Session ended:', ctx.sessionId),
 * });
 * ```
 */
function onSession(config: Omit<OnSessionIntent, 'type'>): void {
    intents.push({ type: 'onSession', ...config });
}

/**
 * Register a permission decision intent.
 *
 * Intercept permission requests and decide allow/deny/ask.
 *
 * @example
 * ```ts
 * hooks.onPermission({
 *     match: 'Bash',
 *     handler: (ctx) => {
 *         if (ctx.args.command?.startsWith('git ')) return 'allow';
 *         return 'ask';
 *     },
 * });
 * ```
 */
function onPermission(config: Omit<OnPermissionIntent, 'type'>): void {
    intents.push({ type: 'onPermission', ...config });
}

// ---------------------------------------------------------------------------
// Raw hook registration — bypass intent layer
// ---------------------------------------------------------------------------

/**
 * Register a raw native hook for a specific agent.
 *
 * Raw hooks bypass the intent layer entirely and write handler code directly.
 * When a raw hook targets the same native hook as an intent-generated hook,
 * the raw hook wins and a warning is emitted during `installHooks()`.
 *
 * @example
 * ```ts
 * hooks.raw({
 *     agent: 'claude-code',
 *     hookName: 'Notification',
 *     handler: '#!/bin/bash\ncurl -X POST https://webhook.example.com',
 * });
 * ```
 */
function raw<A extends AgentType>(registration: RawHookRegistration<A>): void {
    const key = rawKey(registration.agent, registration.hookName as string);
    rawHooks.set(key, registration as RawHookRegistration);
}

// ---------------------------------------------------------------------------
// Extend hook registration — augment intent-generated hooks
// ---------------------------------------------------------------------------

/**
 * Register an extend hook for a specific agent.
 *
 * Extend hooks run after the intent-generated handler for the same native hook.
 * They cannot replace, only augment. Multiple extends for the same hook
 * are executed in registration order.
 *
 * @example
 * ```ts
 * hooks.extend({
 *     agent: 'opencode',
 *     hookName: 'tool.execute.after',
 *     handler: 'console.log("Tool execution completed");',
 * });
 * ```
 */
function extend<A extends AgentType>(registration: ExtendHookRegistration<A>): void {
    const key = rawKey(registration.agent, registration.hookName as string);
    const existing = extendHooks.get(key) ?? [];
    existing.push(registration as ExtendHookRegistration);
    extendHooks.set(key, existing);
}

// ---------------------------------------------------------------------------
// Testing utilities
// ---------------------------------------------------------------------------

/**
 * Reset all registrations. For testing only.
 */
function _resetForTesting(): void {
    intents = [];
    rawHooks = new Map();
    extendHooks = new Map();
}

// ---------------------------------------------------------------------------
// Public namespace object
// ---------------------------------------------------------------------------

/**
 * Hook declaration API.
 *
 * Use `hooks.inject()`, `hooks.beforeToolCall()`, etc. to declare intents.
 * Use `hooks.raw()` to bypass the intent layer for a specific agent.
 * Use `hooks.extend()` to augment intent-generated hooks for a specific agent.
 *
 * All registrations are stored in a module-level singleton and consumed by
 * `installHooks()` when generating native hook files.
 */
export const hooks = {
    inject,
    beforeToolCall,
    afterToolCall,
    onSession,
    onPermission,
    raw,
    extend,
    _resetForTesting,
} as const;
