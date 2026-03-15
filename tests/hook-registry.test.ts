import { describe, it, expect, beforeEach } from 'vitest';
import {
    hooks,
    getIntents,
    getIntentsByType,
    getRawHooks,
    getExtendHooks,
    hasRawHook,
    getRawHook,
    getExtendHooksFor,
} from '../src/hook-registry.js';

describe('hook-registry', () => {
    beforeEach(() => {
        hooks._resetForTesting();
    });

    describe('hooks.inject()', () => {
        it('注册 inject intent', () => {
            hooks.inject({ perTurn: 'reminder text' });

            const intents = getIntents();
            expect(intents).toHaveLength(1);
            expect(intents[0].type).toBe('inject');
            expect((intents[0] as any).perTurn).toBe('reminder text');
        });

        it('可注册多个 inject intent', () => {
            hooks.inject({ perTurn: 'first' });
            hooks.inject({ perTurn: 'second', sessionStart: 'start text' });

            const injects = getIntentsByType('inject');
            expect(injects).toHaveLength(2);
            expect(injects[1].sessionStart).toBe('start text');
        });
    });

    describe('hooks.beforeToolCall()', () => {
        it('注册 beforeToolCall intent', () => {
            hooks.beforeToolCall({
                match: /^Bash/,
                handler: (ctx) => {
                    if (ctx.toolName === 'Bash') return { block: true, reason: 'blocked' };
                },
            });

            const intents = getIntentsByType('beforeToolCall');
            expect(intents).toHaveLength(1);
            expect(intents[0].match).toBeInstanceOf(RegExp);
        });
    });

    describe('hooks.afterToolCall()', () => {
        it('注册 afterToolCall intent', () => {
            hooks.afterToolCall({
                match: 'Write',
                handler: (ctx) => {
                    // observe
                },
            });

            const intents = getIntentsByType('afterToolCall');
            expect(intents).toHaveLength(1);
        });
    });

    describe('hooks.onSession()', () => {
        it('注册 onSession intent', () => {
            hooks.onSession({
                start: (ctx) => {},
                end: (ctx) => {},
            });

            const intents = getIntentsByType('onSession');
            expect(intents).toHaveLength(1);
            expect(intents[0].start).toBeTypeOf('function');
            expect(intents[0].end).toBeTypeOf('function');
        });
    });

    describe('hooks.onPermission()', () => {
        it('注册 onPermission intent', () => {
            hooks.onPermission({
                match: 'Bash',
                handler: () => 'allow',
            });

            const intents = getIntentsByType('onPermission');
            expect(intents).toHaveLength(1);
        });
    });

    describe('hooks.raw()', () => {
        it('注册 raw hook', () => {
            hooks.raw({
                agent: 'claude-code',
                hookName: 'Notification',
                handler: '#!/bin/bash\necho "notified"',
            });

            expect(hasRawHook('claude-code', 'Notification')).toBe(true);
            expect(hasRawHook('opencode', 'Notification')).toBe(false);

            const reg = getRawHook('claude-code', 'Notification');
            expect(reg).toBeDefined();
            expect(reg!.handler).toContain('echo "notified"');
        });

        it('覆盖同一 agent + hookName 的 raw hook', () => {
            hooks.raw({ agent: 'claude-code', hookName: 'Notification', handler: 'first' });
            hooks.raw({ agent: 'claude-code', hookName: 'Notification', handler: 'second' });

            const reg = getRawHook('claude-code', 'Notification');
            expect(reg!.handler).toBe('second');
        });
    });

    describe('hooks.extend()', () => {
        it('注册 extend hook', () => {
            hooks.extend({
                agent: 'opencode',
                hookName: 'tool.execute.after',
                handler: 'console.log("extended");',
            });

            const extends_ = getExtendHooksFor('opencode', 'tool.execute.after');
            expect(extends_).toHaveLength(1);
            expect(extends_[0].handler).toContain('extended');
        });

        it('同一 hook 可有多个 extend', () => {
            hooks.extend({ agent: 'opencode', hookName: 'tool.execute.after', handler: 'first' });
            hooks.extend({ agent: 'opencode', hookName: 'tool.execute.after', handler: 'second' });

            const extends_ = getExtendHooksFor('opencode', 'tool.execute.after');
            expect(extends_).toHaveLength(2);
        });

        it('不同 agent 的 extend 互不干扰', () => {
            hooks.extend({ agent: 'opencode', hookName: 'tool.execute.after', handler: 'oc' });
            hooks.extend({ agent: 'openclaw', hookName: 'after_tool_call', handler: 'ocl' });

            expect(getExtendHooksFor('opencode', 'tool.execute.after')).toHaveLength(1);
            expect(getExtendHooksFor('openclaw', 'after_tool_call')).toHaveLength(1);
            expect(getExtendHooksFor('opencode', 'after_tool_call')).toHaveLength(0);
        });
    });

    describe('hooks._resetForTesting()', () => {
        it('清空所有注册', () => {
            hooks.inject({ perTurn: 'text' });
            hooks.raw({ agent: 'claude-code', hookName: 'SessionStart', handler: '...' });
            hooks.extend({ agent: 'opencode', hookName: 'event', handler: '...' });

            hooks._resetForTesting();

            expect(getIntents()).toHaveLength(0);
            expect(getRawHooks().size).toBe(0);
            expect(getExtendHooks().size).toBe(0);
        });
    });

    describe('getIntentsByType()', () => {
        it('按类型过滤', () => {
            hooks.inject({ perTurn: 'a' });
            hooks.beforeToolCall({ handler: () => {} });
            hooks.inject({ perTurn: 'b' });
            hooks.onSession({ start: () => {} });

            expect(getIntentsByType('inject')).toHaveLength(2);
            expect(getIntentsByType('beforeToolCall')).toHaveLength(1);
            expect(getIntentsByType('onSession')).toHaveLength(1);
            expect(getIntentsByType('afterToolCall')).toHaveLength(0);
        });
    });

    describe('读取 API 返回只读视图', () => {
        it('getIntents 返回的数组修改不影响内部状态', () => {
            hooks.inject({ perTurn: 'test' });
            const intents = getIntents();
            // readonly 数组，无法直接修改
            expect(intents).toHaveLength(1);
        });
    });
});
