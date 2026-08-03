import { describe, it, expect } from 'vitest';
import { parseTweetUrl } from '../../src/tweet/url';
import { UsageError } from '../../src/core/errors';

describe('parseTweetUrl', () => {
    it('parses standard x.com URL', () => {
        const result = parseTweetUrl('https://x.com/user/status/12345');
        expect(result.statusId).toBe('12345');
        expect(result.username).toBe('user');
    });

    it('parses twitter.com URL', () => {
        const result = parseTweetUrl('https://twitter.com/user/status/999999');
        expect(result.statusId).toBe('999999');
        expect(result.username).toBe('user');
    });

    it('parses www subdomain', () => {
        const result = parseTweetUrl('https://www.twitter.com/user/status/12345');
        expect(result.statusId).toBe('12345');
    });

    it('parses mobile subdomain', () => {
        const r1 = parseTweetUrl('https://m.twitter.com/user/status/12345');
        expect(r1.statusId).toBe('12345');
        const r2 = parseTweetUrl('https://mobile.twitter.com/user/status/12345');
        expect(r2.statusId).toBe('12345');
    });

    it('parses i/web/status URL', () => {
        const result = parseTweetUrl('https://x.com/i/web/status/12345');
        expect(result.statusId).toBe('12345');
        expect(result.username).toBeNull();
    });

    it('strips query strings and fragments', () => {
        const result = parseTweetUrl('https://x.com/user/status/12345?utm_source=test#frag');
        expect(result.statusId).toBe('12345');
    });

    it('strips trailing slash', () => {
        const result = parseTweetUrl('https://x.com/user/status/12345/');
        expect(result.statusId).toBe('12345');
    });

    it('trims whitespace', () => {
        const result = parseTweetUrl('  https://x.com/user/status/12345  ');
        expect(result.statusId).toBe('12345');
    });

    it('throws on empty input', () => {
        expect(() => parseTweetUrl('')).toThrow(UsageError);
        expect(() => parseTweetUrl('   ')).toThrow(UsageError);
    });

    it('throws on invalid URL', () => {
        expect(() => parseTweetUrl('not-a-url')).toThrow(UsageError);
    });

    it('throws on non-Twitter domain', () => {
        expect(() => parseTweetUrl('https://youtube.com/user/status/12345')).toThrow(UsageError);
    });

    it('throws when no status ID found', () => {
        expect(() => parseTweetUrl('https://x.com/user')).toThrow(UsageError);
        expect(() => parseTweetUrl('https://x.com/user/status/')).toThrow(UsageError);
    });
});
