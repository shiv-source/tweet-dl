import { describe, it, expect } from 'vitest';
import { CookieJar } from '../../src/http/cookiejar.js';
import type { Cookie } from '../../src/core/types.js';

function makeCookie(overrides: Partial<Cookie> = {}): Cookie {
    const now = Date.now();
    return {
        name: 'test',
        value: 'val',
        domain: 'x.com',
        path: '/',
        expires: new Date(now + 3600_000), // 1 hour from now
        httpOnly: false,
        secure: true,
        ...overrides,
    };
}

describe('CookieJar', () => {
    it('stores and retrieves cookies by name', () => {
        const jar = new CookieJar();
        const cookie = makeCookie({ name: 'auth_token', value: 'secret' });
        jar.add(cookie);
        expect(jar.get('auth_token')?.value).toBe('secret');
    });

    it('get can filter by host', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: '1', domain: 'x.com' }));
        jar.add(makeCookie({ name: 'a', value: '2', domain: 'other.com' }));
        expect(jar.get('a', 'x.com')?.value).toBe('1');
        expect(jar.get('a', 'sub.x.com')?.value).toBe('1');
        expect(jar.get('a', 'other.com')?.value).toBe('2');
    });

    it('detects auth_token', () => {
        const jar = new CookieJar();
        expect(jar.hasAuthToken()).toBe(false);
        jar.add(makeCookie({ name: 'auth_token', value: 'tok' }));
        expect(jar.hasAuthToken()).toBe(true);
    });

    it('filters expired cookies', () => {
        const jar = new CookieJar();
        const expired = makeCookie({
            name: 'old',
            expires: new Date(Date.now() - 1000),
        });
        jar.add(expired);
        expect(jar.get('old')).toBeUndefined();
        expect(jar.hasAuthToken()).toBe(false);
    });

    it('overwrites cookies with same name+domain+path', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'key', value: 'v1', domain: 'x.com', path: '/' }));
        jar.add(makeCookie({ name: 'key', value: 'v2', domain: 'x.com', path: '/' }));
        expect(jar.get('key')?.value).toBe('v2');
    });

    it('builds cookie header for matching domain', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: '1', domain: 'x.com', secure: false }));
        jar.add(makeCookie({ name: 'b', value: '2', domain: 'video.twimg.com', secure: false }));
        jar.add(makeCookie({ name: 'c', value: '3', domain: 'other.com', secure: false }));

        const header = jar.cookieHeaderFor('https://x.com/i/api/graphql');
        expect(header).toContain('a=1');
        expect(header).not.toContain('b=2');
        expect(header).not.toContain('c=3');
    });

    it('handles leading dot in domain', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: '1', domain: '.x.com', secure: false }));
        const header = jar.cookieHeaderFor('https://x.com/path');
        expect(header).toContain('a=1');
    });

    it('matches subdomains correctly', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: '1', domain: 'x.com', secure: false }));
        const header = jar.cookieHeaderFor('https://sub.x.com/path');
        expect(header).toContain('a=1');
    });

    it('rejects suffix-confusion hosts', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: '1', domain: 'x.com', secure: false }));
        // notx.com should NOT match x.com (no dot before)
        expect(jar.cookieHeaderFor('https://notx.com/path')).toBe('');
        // badexamplex.com should NOT match x.com
        expect(jar.cookieHeaderFor('https://badexamplex.com/path')).toBe('');
    });

    it('rejects TLD-only domains', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: '1', domain: 'com', secure: false }));
        // "com" is a TLD, should not be accepted for any host
        expect(jar.cookieHeaderFor('https://example.com/path')).toBe('');
    });

    it('filters secure cookies over HTTP', () => {
        const jar = new CookieJar();
        jar.add(makeCookie({ name: 'a', value: 'secret', domain: 'x.com', secure: true }));
        // Over HTTPS — should be sent
        expect(jar.cookieHeaderFor('https://x.com/path')).toContain('a=secret');
        // Over HTTP — should NOT be sent
        expect(jar.cookieHeaderFor('http://x.com/path')).toBe('');
    });

    it('respects path prefix matching', () => {
        const jar = new CookieJar();
        jar.add(
            makeCookie({
                name: 'a',
                value: '1',
                domain: 'x.com',
                path: '/api',
                secure: false,
            }),
        );
        // Should match /api and /api/whatever
        expect(jar.cookieHeaderFor('https://x.com/api/graphql')).toContain('a=1');
        // Should NOT match root or /other
        expect(jar.cookieHeaderFor('https://x.com/')).toBe('');
        expect(jar.cookieHeaderFor('https://x.com/other')).toBe('');
    });
});
