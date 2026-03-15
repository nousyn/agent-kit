import { describe, it, expect } from 'vitest';
import { createKit } from '../src/create-kit.js';

describe('createKit', () => {
    it('返回包含所有方法的 kit 对象', () => {
        const kit = createKit('test-tool');
        expect(kit.name).toBe('test-tool');
        expect(typeof kit.injectPrompt).toBe('function');
        expect(typeof kit.hasPromptInjected).toBe('function');
        expect(typeof kit.installHooks).toBe('function');
        expect(typeof kit.uninstallHooks).toBe('function');
        expect(typeof kit.hasHooksInstalled).toBe('function');
        expect(typeof kit.getDataDir).toBe('function');
    });

    it('name 为空时抛错', () => {
        expect(() => createKit('')).toThrow('name is required');
    });

    it('name 为空白时抛错', () => {
        expect(() => createKit('   ')).toThrow('name is required');
    });

    it('支持解构', () => {
        const { injectPrompt, installHooks, getDataDir } = createKit('test-tool');
        expect(typeof injectPrompt).toBe('function');
        expect(typeof installHooks).toBe('function');
        expect(typeof getDataDir).toBe('function');
    });

    it('不同实例相互独立', () => {
        const kit1 = createKit('tool-a');
        const kit2 = createKit('tool-b');
        expect(kit1.name).toBe('tool-a');
        expect(kit2.name).toBe('tool-b');
    });

    it('injectPrompt 传入空 prompt 时抛错', () => {
        const kit = createKit('test-tool');
        expect(() => kit.injectPrompt('claude-code', '')).toThrow('prompt is required');
    });

    it('getDataDir 返回正确路径（global scope）', () => {
        const kit = createKit('test-mcp');
        const dir = kit.getDataDir();
        expect(dir).toContain('test-mcp');
    });

    it('getDataDir 支持 project scope', () => {
        const kit = createKit('test-mcp');
        const dir = kit.getDataDir({ scope: 'project', projectRoot: '/tmp/myproject' });
        expect(dir).toBe('/tmp/myproject/.test-mcp');
    });

    it('getDataDir project scope 未传 projectRoot 时抛错', () => {
        const kit = createKit('test-mcp');
        expect(() => kit.getDataDir({ scope: 'project' })).toThrow('projectRoot is required');
    });

    it('支持自定义目录名', () => {
        const kit = createKit('test-mcp', { dirs: { global: 'custom-dir', project: '.custom' } });
        const globalDir = kit.getDataDir();
        expect(globalDir).toContain('custom-dir');

        const projectDir = kit.getDataDir({ scope: 'project', projectRoot: '/tmp/proj' });
        expect(projectDir).toBe('/tmp/proj/.custom');
    });

    it('支持环境变量覆盖', () => {
        const kit = createKit('test-mcp', { envOverride: 'MY_CUSTOM_DIR' });
        process.env.MY_CUSTOM_DIR = '/tmp/custom-data';
        try {
            expect(kit.getDataDir()).toBe('/tmp/custom-data');
        } finally {
            delete process.env.MY_CUSTOM_DIR;
        }
    });
});
