import { describe, it, expect, vi } from 'vitest';
import { defineHooks } from '../src/define-hooks.js';

describe('defineHooks', () => {
    describe('基本功能', () => {
        it('单条定义返回 HookSet', () => {
            const set = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "pre"',
            });

            expect(set.__brand).toBe('HookSet');
            expect(set.agent).toBe('claude-code');
            expect(set.definitions).toHaveLength(1);
            expect(set.definitions[0].events).toEqual(['PreToolUse']);
            expect(set.definitions[0].content).toBe('#!/bin/bash\necho "pre"');
        });

        it('数组定义返回 HookSet', () => {
            const set = defineHooks('claude-code', [
                { events: ['PreToolUse'], content: '#!/bin/bash\necho "pre"' },
                { events: ['PostToolUse'], content: '#!/bin/bash\necho "post"' },
            ]);

            expect(set.definitions).toHaveLength(2);
        });

        it('多事件共享内容', () => {
            const set = defineHooks('claude-code', {
                events: ['PreToolUse', 'PostToolUse'],
                content: '#!/bin/bash\necho "hook"',
            });

            expect(set.definitions[0].events).toEqual(['PreToolUse', 'PostToolUse']);
        });

        it('definitions 是只读的', () => {
            const set = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "test"',
            });

            expect(Object.isFrozen(set.definitions)).toBe(true);
        });
    });

    describe('各 agent 事件校验', () => {
        it('claude-code 有效事件', () => {
            expect(() =>
                defineHooks('claude-code', { events: ['PreToolUse', 'SessionStart'], content: 'test' }),
            ).not.toThrow();
        });

        it('codex 有效事件（与 claude-code 相同）', () => {
            expect(() =>
                defineHooks('codex', { events: ['PreToolUse', 'PostToolUse'], content: 'test' }),
            ).not.toThrow();
        });

        it('opencode 有效事件', () => {
            expect(() =>
                defineHooks('opencode', {
                    events: ['experimental.chat.messages.transform'],
                    content: 'export default {}',
                }),
            ).not.toThrow();
        });

        it('openclaw 有效事件', () => {
            expect(() =>
                defineHooks('openclaw', {
                    events: ['session_start', 'before_tool_call'],
                    content: 'export default async function() {}',
                }),
            ).not.toThrow();
        });

        it('openclaw 内部事件也有效', () => {
            expect(() =>
                defineHooks('openclaw', {
                    events: ['agent:bootstrap'],
                    content: 'export default async function() {}',
                }),
            ).not.toThrow();
        });

        it('无效事件名抛错', () => {
            expect(() => defineHooks('claude-code', { events: ['InvalidEvent' as any], content: 'test' })).toThrow(
                'unknown event "InvalidEvent"',
            );
        });

        it('opencode 无效事件名抛错', () => {
            expect(() => defineHooks('opencode', { events: ['not.a.real.hook' as any], content: 'test' })).toThrow(
                'unknown event',
            );
        });
    });

    describe('参数校验', () => {
        it('未知 agent 抛错', () => {
            expect(() => defineHooks('unknown-agent' as any, { events: ['test'], content: 'test' })).toThrow(
                'unknown agent type',
            );
        });

        it('空 events 数组抛错', () => {
            expect(() => defineHooks('claude-code', { events: [] as any, content: 'test' })).toThrow('non-empty array');
        });

        it('空 content 抛错', () => {
            expect(() => defineHooks('claude-code', { events: ['PreToolUse'], content: '' })).toThrow(
                'non-empty string',
            );
        });

        it('空白 content 抛错', () => {
            expect(() => defineHooks('claude-code', { events: ['PreToolUse'], content: '   ' })).toThrow(
                'non-empty string',
            );
        });

        it('空数组抛错', () => {
            expect(() => defineHooks('claude-code', [])).toThrow('cannot be empty');
        });
    });

    describe('OpenClaw 特殊处理', () => {
        it('多条定义只取第一条并 warn', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const set = defineHooks('openclaw', [
                {
                    events: ['session_start'],
                    content: 'first',
                    description: '第一个',
                },
                {
                    events: ['before_tool_call'],
                    content: 'second',
                    description: '第二个',
                },
            ]);

            expect(set.definitions).toHaveLength(1);
            expect(set.definitions[0].content).toBe('first');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('only the first will be used'));

            warnSpy.mockRestore();
        });

        it('单条定义不 warn', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            defineHooks('openclaw', {
                events: ['session_start'],
                content: 'handler code',
            });

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('支持 description', () => {
            const set = defineHooks('openclaw', {
                events: ['session_start'],
                content: 'handler code',
                description: '注入项目规范',
            });

            expect(set.definitions[0].description).toBe('注入项目规范');
        });
    });
});
