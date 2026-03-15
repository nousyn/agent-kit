import { describe, it, expect } from 'vitest';
import { detectProjectRoot } from '../src/platform.js';

describe('detectProjectRoot', () => {
    it('返回有效路径', async () => {
        const root = await detectProjectRoot();
        expect(typeof root).toBe('string');
        expect(root.length).toBeGreaterThan(0);
    });
});
