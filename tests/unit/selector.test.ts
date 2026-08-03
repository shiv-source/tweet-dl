import { describe, it, expect } from 'vitest';
import { selectVariant, validateQuality } from '../../src/hls/selector';
import { UsageError } from '../../src/core/errors';
import type { StreamVariant } from '../../src/core/types';

function makeVariant(overrides: Partial<StreamVariant> = {}): StreamVariant {
    return {
        url: 'https://example.com/video.m3u8',
        bandwidth: 500_000,
        width: 640,
        height: 480,
        codecs: 'avc1.4D401E,mp4a.40.2',
        audioGroup: null,
        audioUrl: null,
        ...overrides,
    };
}

const variants: StreamVariant[] = [
    makeVariant({ bandwidth: 200_000, width: 320, height: 240 }),
    makeVariant({ bandwidth: 500_000, width: 640, height: 480 }),
    makeVariant({ bandwidth: 900_000, width: 1280, height: 720 }),
    makeVariant({ bandwidth: 2_000_000, width: 1920, height: 1080 }),
];

describe('selectVariant', () => {
    it('selects highest bandwidth for "best"', () => {
        const result = selectVariant(variants, 'best');
        expect(result.width).toBe(1920);
        expect(result.height).toBe(1080);
    });

    it('selects exact match for 1080p', () => {
        const result = selectVariant(variants, '1080p');
        expect(result.height).toBe(1080);
    });

    it('selects closest for 720p', () => {
        const result = selectVariant(variants, '720p');
        expect(result.height).toBe(720);
    });

    it('falls back to nearest lower tier when exact not available', () => {
        // Remove 720p variant
        const subset = variants.filter((v) => v.height !== 720);
        const result = selectVariant(subset, '720p');
        expect(result.height).toBe(480);
    });

    it('falls back to lowest when all are above target', () => {
        const highOnly = [makeVariant({ height: 1920 }), makeVariant({ height: 1080 })];
        const result = selectVariant(highOnly, '480p');
        expect(result.height).toBe(1080); // lowest available
    });

    it('rejects audio-only variants', () => {
        const audioOnly = makeVariant({ codecs: 'mp4a.40.2', width: null, height: null });
        const mixed = [audioOnly, ...variants];
        const result = selectVariant(mixed, 'best');
        expect(result.codecs).toContain('avc1');
    });

    it('throws on invalid quality', () => {
        expect(() => selectVariant(variants, '4k')).toThrow(UsageError);
    });

    it('throws when no video variants', () => {
        const audioOnly = [makeVariant({ codecs: 'mp4a.40.2', width: null, height: null })];
        expect(() => selectVariant(audioOnly, 'best')).toThrow(UsageError);
    });
});

describe('validateQuality', () => {
    it('accepts valid qualities', () => {
        expect(() => validateQuality('best')).not.toThrow();
        expect(() => validateQuality('1080p')).not.toThrow();
        expect(() => validateQuality('720p')).not.toThrow();
        expect(() => validateQuality('480p')).not.toThrow();
    });

    it('throws on invalid quality', () => {
        expect(() => validateQuality('4k')).toThrow(UsageError);
        expect(() => validateQuality('360p')).toThrow(UsageError);
    });
});
