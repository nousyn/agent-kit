import { describe, it, expect, beforeEach } from 'vitest';
import { register, _resetForTesting } from '../src/register.js';
import { buildHookFiles } from '../src/hooks.js';
import type { HookReminders } from '../src/types.js';

const reminders: HookReminders = {
    perTurn: '<test-reminder>Check something after each turn.</test-reminder>',
    sessionStart: '<test-start>Load context at session start.</test-start>',
    compaction: '<test-compact>Save before compaction.</test-compact>',
};

describe('buildHookFiles', () => {
    beforeEach(() => {
        _resetForTesting();
    });

    describe('claude-code / codex — shell 脚本', () => {
        it('生成 activator shell 脚本', () => {
            const files = buildHookFiles('claude-code', 'test-tool', reminders);
            expect(Object.keys(files)).toEqual(['test-tool-activator.sh']);

            const script = files['test-tool-activator.sh'];
            expect(script).toContain('#!/bin/bash');
            expect(script).toContain(reminders.perTurn);
        });

        it('codex 生成相同格式', () => {
            const files = buildHookFiles('codex', 'test-tool', reminders);
            expect(Object.keys(files)).toEqual(['test-tool-activator.sh']);
        });
    });

    describe('openclaw — HOOK.md + handler.ts', () => {
        it('生成 HOOK.md 和 handler.ts', () => {
            const files = buildHookFiles('openclaw', 'test-tool', reminders);
            expect(Object.keys(files).sort()).toEqual(['HOOK.md', 'handler.ts']);
        });

        it('HOOK.md 包含工具名', () => {
            const files = buildHookFiles('openclaw', 'test-tool', reminders);
            expect(files['HOOK.md']).toContain('name: test-tool');
        });

        it('handler.ts 包含 sessionStart 和 perTurn', () => {
            const files = buildHookFiles('openclaw', 'test-tool', reminders);
            const handler = files['handler.ts'];
            expect(handler).toContain(reminders.sessionStart);
            expect(handler).toContain(reminders.perTurn);
        });

        it('handler.ts 注入的虚拟文件名基于工具名', () => {
            const files = buildHookFiles('openclaw', 'test-tool', reminders);
            expect(files['handler.ts']).toContain('TEST_TOOL_REMINDER.md');
        });
    });

    describe('opencode — TypeScript plugin', () => {
        it('生成 reminder plugin 文件', () => {
            const files = buildHookFiles('opencode', 'test-tool', reminders);
            expect(Object.keys(files)).toEqual(['test-tool-reminder.ts']);
        });

        it('导出名为 PascalCase + Reminder', () => {
            const files = buildHookFiles('opencode', 'test-tool', reminders);
            expect(files['test-tool-reminder.ts']).toContain('export const TestToolReminder');
        });

        it('包含 messages.transform 钩子', () => {
            const files = buildHookFiles('opencode', 'test-tool', reminders);
            expect(files['test-tool-reminder.ts']).toContain('experimental.chat.messages.transform');
        });

        it('有 compaction 时包含 compacting 钩子', () => {
            const files = buildHookFiles('opencode', 'test-tool', reminders);
            expect(files['test-tool-reminder.ts']).toContain('experimental.session.compacting');
            expect(files['test-tool-reminder.ts']).toContain(reminders.compaction);
        });

        it('无 compaction 时不包含 compacting 钩子', () => {
            const noCompact: HookReminders = { perTurn: 'check something' };
            const files = buildHookFiles('opencode', 'test-tool', noCompact);
            expect(files['test-tool-reminder.ts']).not.toContain('experimental.session.compacting');
        });
    });
});
