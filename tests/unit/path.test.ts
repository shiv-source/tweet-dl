import { describe, it, expect } from 'vitest';
import { resolveOutputPath } from '../../src/util/path';
import { UsageError } from '../../src/core/errors';
import * as path from 'node:path';

describe('resolveOutputPath', () => {
    it('generates default path with timestamp when no input', () => {
        const result = resolveOutputPath();
        expect(result).toMatch(/video-\d{8}-\d{6}\.mp4$/);
        expect(path.isAbsolute(result)).toBe(true);
    });

    it('uses user-provided path', () => {
        const result = resolveOutputPath('/tmp/my-video.mp4');
        expect(result).toBe('/tmp/my-video.mp4');
    });

    it('appends .mp4 if missing', () => {
        const result = resolveOutputPath('/tmp/my-video');
        expect(result).toBe('/tmp/my-video.mp4');
    });

    it('handles relative paths', () => {
        const result = resolveOutputPath('out.mp4');
        expect(path.isAbsolute(result)).toBe(true);
    });

    it('strips null bytes from filename', () => {
        const result = resolveOutputPath('/tmp/\x00bad.mp4');
        expect(result).not.toContain('\x00');
    });

    it('preserves directory separators', () => {
        const result = resolveOutputPath('/some/nested/dir/video.mp4');
        expect(result).toBe('/some/nested/dir/video.mp4');
    });

    it('throws on empty result', () => {
        expect(() => resolveOutputPath('\x00')).toThrow(UsageError);
    });
});
