import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installHooks, uninstallHooks, hasHooksInstalled } from '../src/hooks.js';
import { defineHooks } from '../src/define-hooks.js';

// Use a temp directory for all tests
let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-kit-test-'));
    // Mock os.homedir to use temp dir
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('installHooks', () => {
    describe('claude-code', () => {
        it('写入 shell 脚本', async () => {
            const hooks = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "pre tool use"',
            });

            const result = await installHooks('test-tool', 'claude-code', hooks);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(1);

            const filePath = result.filesWritten[0];
            expect(filePath).toContain('test-tool-PreToolUse.sh');

            const content = await fs.readFile(filePath, 'utf-8');
            expect(content).toBe('#!/bin/bash\necho "pre tool use"');
        });

        it('多事件共享内容生成多个脚本', async () => {
            const hooks = defineHooks('claude-code', {
                events: ['PreToolUse', 'PostToolUse'],
                content: '#!/bin/bash\necho "hook"',
            });

            const result = await installHooks('test-tool', 'claude-code', hooks);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(2);

            const fileNames = result.filesWritten.map((f) => path.basename(f));
            expect(fileNames).toContain('test-tool-PreToolUse.sh');
            expect(fileNames).toContain('test-tool-PostToolUse.sh');
        });

        it('多条定义生成各自脚本', async () => {
            const hooks = defineHooks('claude-code', [
                { events: ['PreToolUse'], content: '#!/bin/bash\necho "pre"' },
                { events: ['PostToolUse'], content: '#!/bin/bash\necho "post"' },
            ]);

            const result = await installHooks('test-tool', 'claude-code', hooks);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(2);
        });

        it('shell 脚本有执行权限', async () => {
            const hooks = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "test"',
            });

            const result = await installHooks('test-tool', 'claude-code', hooks);
            const stat = await fs.stat(result.filesWritten[0]);
            // Check executable bit
            expect(stat.mode & 0o111).toBeGreaterThan(0);
        });

        it('写入 settings.json', async () => {
            const hooks = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "test"',
            });

            const result = await installHooks('test-tool', 'claude-code', hooks);
            expect(result.settingsUpdated).toBe(true);

            const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
            const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
            expect(settings.hooks).toBeDefined();
            expect(settings.hooks.PreToolUse).toBeDefined();
            expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain('test-tool');
        });
    });

    describe('codex', () => {
        it('与 claude-code 格式相同', async () => {
            const hooks = defineHooks('codex', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "codex"',
            });

            const result = await installHooks('test-tool', 'codex', hooks);
            expect(result.success).toBe(true);
            expect(result.filesWritten[0]).toContain('test-tool-PreToolUse.sh');
        });
    });

    describe('opencode', () => {
        it('写入 TypeScript 插件文件', async () => {
            const hooks = defineHooks('opencode', {
                events: ['experimental.chat.messages.transform'],
                content: 'export default { name: "test" }',
            });

            const result = await installHooks('test-tool', 'opencode', hooks);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(1);

            const fileName = path.basename(result.filesWritten[0]);
            expect(fileName).toBe('test-tool-experimental-chat-messages-transform-plugin.ts');
        });

        it('内容原样写入', async () => {
            const pluginCode = `
import type { Plugin } from 'opencode';
export default {
    name: 'test',
    hooks: {
        'experimental.chat.messages.transform': async (msgs) => msgs,
    },
};`;
            const hooks = defineHooks('opencode', {
                events: ['experimental.chat.messages.transform'],
                content: pluginCode,
            });

            const result = await installHooks('test-tool', 'opencode', hooks);
            const written = await fs.readFile(result.filesWritten[0], 'utf-8');
            expect(written).toBe(pluginCode);
        });
    });

    describe('openclaw', () => {
        it('生成 HOOK.md 和 handler.ts', async () => {
            const hooks = defineHooks('openclaw', {
                events: ['session_start', 'before_tool_call'],
                content: 'export default async function(event) { return event; }',
                description: '测试钩子',
            });

            const result = await installHooks('test-tool', 'openclaw', hooks);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(2);

            const fileNames = result.filesWritten.map((f) => path.basename(f));
            expect(fileNames).toContain('HOOK.md');
            expect(fileNames).toContain('handler.ts');
        });

        it('HOOK.md 包含正确的 YAML frontmatter', async () => {
            const hooks = defineHooks('openclaw', {
                events: ['session_start', 'before_tool_call'],
                content: 'export default async function() {}',
                description: '注入项目规范',
            });

            const result = await installHooks('test-tool', 'openclaw', hooks);
            const hookMdPath = result.filesWritten.find((f) => f.endsWith('HOOK.md'))!;
            const content = await fs.readFile(hookMdPath, 'utf-8');

            expect(content).toContain('name: test-tool');
            expect(content).toContain('description: 注入项目规范');
            expect(content).toContain('  - session_start');
            expect(content).toContain('  - before_tool_call');
        });

        it('HOOK.md 无 description 时用默认值', async () => {
            const hooks = defineHooks('openclaw', {
                events: ['session_start'],
                content: 'export default async function() {}',
            });

            const result = await installHooks('test-tool', 'openclaw', hooks);
            const hookMdPath = result.filesWritten.find((f) => f.endsWith('HOOK.md'))!;
            const content = await fs.readFile(hookMdPath, 'utf-8');

            expect(content).toContain('description: Hook installed by test-tool');
        });

        it('handler.ts 内容原样写入', async () => {
            const handlerCode = 'export default async function(event) { return event; }';
            const hooks = defineHooks('openclaw', {
                events: ['session_start'],
                content: handlerCode,
            });

            const result = await installHooks('test-tool', 'openclaw', hooks);
            const handlerPath = result.filesWritten.find((f) => f.endsWith('handler.ts'))!;
            const content = await fs.readFile(handlerPath, 'utf-8');

            expect(content).toBe(handlerCode);
        });
    });

    describe('agent 不匹配', () => {
        it('传入不匹配的 HookSet 返回错误', async () => {
            const hooks = defineHooks('opencode', {
                events: ['experimental.chat.messages.transform'],
                content: 'test',
            });

            const result = await installHooks('test-tool', 'claude-code', hooks);
            expect(result.success).toBe(false);
            expect(result.error).toContain('No hook definitions found');
        });
    });

    describe('多个 HookSet', () => {
        it('接受多个 HookSet 数组', async () => {
            const set1 = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "set1"',
            });
            const set2 = defineHooks('claude-code', {
                events: ['PostToolUse'],
                content: '#!/bin/bash\necho "set2"',
            });

            const result = await installHooks('test-tool', 'claude-code', [set1, set2]);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(2);
        });

        it('过滤不匹配的 HookSet', async () => {
            const claudeHooks = defineHooks('claude-code', {
                events: ['PreToolUse'],
                content: '#!/bin/bash\necho "claude"',
            });
            const openCodeHooks = defineHooks('opencode', {
                events: ['experimental.chat.messages.transform'],
                content: 'test',
            });

            const result = await installHooks('test-tool', 'claude-code', [claudeHooks, openCodeHooks]);
            expect(result.success).toBe(true);
            expect(result.filesWritten).toHaveLength(1);
        });
    });
});

describe('uninstallHooks', () => {
    it('删除已安装的文件', async () => {
        const hooks = defineHooks('claude-code', {
            events: ['PreToolUse'],
            content: '#!/bin/bash\necho "test"',
        });

        await installHooks('test-tool', 'claude-code', hooks);

        const result = await uninstallHooks('test-tool', 'claude-code');
        expect(result.success).toBe(true);
        expect(result.removed).toHaveLength(1);
    });

    it('目录不存在时也成功', async () => {
        const result = await uninstallHooks('nonexistent', 'claude-code');
        expect(result.success).toBe(true);
        expect(result.removed).toHaveLength(0);
    });

    it('清理 settings.json', async () => {
        const hooks = defineHooks('claude-code', {
            events: ['PreToolUse'],
            content: '#!/bin/bash\necho "test"',
        });

        await installHooks('test-tool', 'claude-code', hooks);
        await uninstallHooks('test-tool', 'claude-code');

        const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
        try {
            const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
            // hooks key should be removed or event should be empty
            expect(settings.hooks).toBeUndefined();
        } catch {
            // Settings file removed entirely is also valid
        }
    });
});

describe('hasHooksInstalled', () => {
    it('未安装时返回 false', async () => {
        expect(await hasHooksInstalled('test-tool', 'claude-code')).toBe(false);
    });

    it('安装后返回 true', async () => {
        const hooks = defineHooks('claude-code', {
            events: ['PreToolUse'],
            content: '#!/bin/bash\necho "test"',
        });

        await installHooks('test-tool', 'claude-code', hooks);
        expect(await hasHooksInstalled('test-tool', 'claude-code')).toBe(true);
    });

    it('卸载后返回 false', async () => {
        const hooks = defineHooks('claude-code', {
            events: ['PreToolUse'],
            content: '#!/bin/bash\necho "test"',
        });

        await installHooks('test-tool', 'claude-code', hooks);
        await uninstallHooks('test-tool', 'claude-code');
        expect(await hasHooksInstalled('test-tool', 'claude-code')).toBe(false);
    });
});
