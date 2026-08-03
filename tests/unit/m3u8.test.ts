import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseMasterPlaylist, parseMediaPlaylist, resolveUri } from '../../src/hls/m3u8';

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');
const BASE = 'https://video.twimg.com/amplify_video/123/';

describe('parseMasterPlaylist', () => {
    it('parses master playlist with variants', () => {
        const text = fs.readFileSync(path.join(fixturesDir, 'master.m3u8'), 'utf-8');
        const variants = parseMasterPlaylist(text, BASE);

        expect(variants).toHaveLength(3);

        const high = variants[2]!;
        expect(high.bandwidth).toBe(876225);
        expect(high.width).toBe(720);
        expect(high.height).toBe(776);
        expect(high.codecs).toBe('mp4a.40.2,avc1.64001F');
        expect(high.url).toContain('high.m3u8');
    });

    it('returns empty array for non-master playlist', () => {
        const text = fs.readFileSync(path.join(fixturesDir, 'media.m3u8'), 'utf-8');
        const variants = parseMasterPlaylist(text, BASE);
        expect(variants).toHaveLength(0);
    });

    it('resolves relative URIs', () => {
        const text = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nrel/path.m3u8\n';
        const variants = parseMasterPlaylist(text, 'https://cdn.example.com/pl/master.m3u8');
        expect(variants).toHaveLength(1);
        expect(variants[0]!.url).toBe('https://cdn.example.com/pl/rel/path.m3u8');
    });
});

describe('parseMediaPlaylist', () => {
    it('parses media playlist with segments', () => {
        const text = fs.readFileSync(path.join(fixturesDir, 'media.m3u8'), 'utf-8');
        const playlist = parseMediaPlaylist(text, BASE);

        expect(playlist.segments).toHaveLength(3);
        expect(playlist.targetDuration).toBe(3);
        expect(playlist.ended).toBe(true);
        expect(playlist.initSegment).toContain('init.mp4');
    });

    it('resolves relative segment URIs', () => {
        const text = '#EXTM3U\n#EXTINF:1.0,\nseg.ts\n';
        const playlist = parseMediaPlaylist(text, 'https://cdn.example.com/sub/playlist.m3u8');
        expect(playlist.segments[0]!.url).toBe('https://cdn.example.com/sub/seg.ts');
    });

    it('handles missing ENDLIST (live stream)', () => {
        const text = '#EXTM3U\n#EXTINF:1.0,\nseg.ts\n';
        const playlist = parseMediaPlaylist(text, BASE);
        expect(playlist.ended).toBe(false);
    });
});

describe('resolveUri', () => {
    it('resolves relative against base', () => {
        expect(resolveUri('/path/file.ts', 'https://cdn.example.com/base.m3u8')).toBe(
            'https://cdn.example.com/path/file.ts',
        );
    });

    it('returns absolute URLs as-is', () => {
        expect(resolveUri('https://other.example.com/file.ts', 'https://cdn.example.com/base.m3u8')).toBe(
            'https://other.example.com/file.ts',
        );
    });
});
