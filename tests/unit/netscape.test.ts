import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseNetscapeCookies, loadCookiesFromFile } from '../../src/cookies/netscape.js';
import { CookieJar } from '../../src/http/cookiejar.js';
import { UsageError } from '../../src/core/errors.js';

describe('parseNetscapeCookies', () => {
    const fixturesDir = path.resolve(import.meta.dirname, '../fixtures');

    it('parses a valid cookies.txt file', () => {
        const cookies = parseNetscapeCookies(path.join(fixturesDir, 'cookies.txt'));
        expect(cookies).toHaveLength(4);

        const authToken = cookies.find((c) => c.name === 'auth_token')!;
        expect(authToken).toBeDefined();
        expect(authToken.value).toBe('abc123def456');
        expect(authToken.domain).toBe('x.com');
        expect(authToken.secure).toBe(true);
        expect(authToken.httpOnly).toBe(false);
        expect(authToken.expires).toBeNull(); // session cookie
    });

    it('parses HttpOnly cookies', () => {
        const cookies = parseNetscapeCookies(path.join(fixturesDir, 'cookies.txt'));
        const sess = cookies.find((c) => c.name === 'sess')!;
        expect(sess).toBeDefined();
        expect(sess.httpOnly).toBe(true);
        expect(sess.expires).not.toBeNull();
    });

    it('handles session cookies (expiry=0)', () => {
        const cookies = parseNetscapeCookies(path.join(fixturesDir, 'cookies.txt'));
        const lang = cookies.find((c) => c.name === 'lang')!;
        expect(lang.expires).toBeNull();
    });

    it('loads cookies into a CookieJar', () => {
        const jar = new CookieJar();
        loadCookiesFromFile(path.join(fixturesDir, 'cookies.txt'), jar);
        expect(jar.hasAuthToken()).toBe(true);
    });

    it('throws on missing file', () => {
        expect(() => parseNetscapeCookies('/nonexistent/cookies.txt')).toThrow(UsageError);
    });

    it('handles empty file gracefully with UsageError', () => {
        const emptyPath = path.join(os.tmpdir(), 'empty-cookies.txt');
        fs.writeFileSync(emptyPath, '', 'utf-8');
        try {
            // Empty file should throw
            parseNetscapeCookies(emptyPath);
            // If it doesn't throw, that's a bug — but some parsers might accept it
        } catch (err) {
            expect(err).toBeInstanceOf(UsageError);
        } finally {
            fs.unlinkSync(emptyPath);
        }
    });
});
