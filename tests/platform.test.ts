import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import { register, _resetForTesting } from '../src/register.js';
import { getDataDir, detectProjectRoot } from '../src/platform.js';

describe('getDataDir', () => {
    beforeEach(() => {
        _resetForTesting();
    });

    it('global scope 返回平台数据目录', () => {
        register({ name: 'test-mcp', prompt: 'test' });
        const dir = getDataDir();
        const home = os.homedir();

        if (process.platform === 'darwin') {
            expect(dir).toBe(`${home}/Library/Application Support/test-mcp`);
        } else if (process.platform === 'win32') {
            expect(dir).toContain('test-mcp');
        } else {
            expect(dir).toContain('test-mcp');
        }
    });

    it('project scope 返回项目数据目录', () => {
        register({ name: 'test-mcp', prompt: 'test' });
        const dir = getDataDir({ scope: 'project', projectRoot: '/tmp/myproject' });
        expect(dir).toBe('/tmp/myproject/.test-mcp');
    });

    it('project scope 未传 projectRoot 时抛错', () => {
        register({ name: 'test-mcp', prompt: 'test' });
        expect(() => getDataDir({ scope: 'project' })).toThrow('projectRoot is required');
    });

    it('支持自定义目录名', () => {
        register({ name: 'test-mcp', prompt: 'test', dirs: { global: 'custom-dir', project: '.custom' } });
        const globalDir = getDataDir();
        expect(globalDir).toContain('custom-dir');

        const projectDir = getDataDir({ scope: 'project', projectRoot: '/tmp/proj' });
        expect(projectDir).toBe('/tmp/proj/.custom');
    });

    it('支持环境变量覆盖', () => {
        register({ name: 'test-mcp', prompt: 'test', envOverride: 'MY_CUSTOM_DIR' });
        process.env.MY_CUSTOM_DIR = '/tmp/custom-data';
        try {
            expect(getDataDir()).toBe('/tmp/custom-data');
        } finally {
            delete process.env.MY_CUSTOM_DIR;
        }
    });

    it('未注册时抛错', () => {
        expect(() => getDataDir()).toThrow('No tool registered');
    });
});

describe('detectProjectRoot', () => {
    it('返回有效路径', async () => {
        const root = await detectProjectRoot();
        expect(typeof root).toBe('string');
        expect(root.length).toBeGreaterThan(0);
    });
});
