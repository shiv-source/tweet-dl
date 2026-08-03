import * as fs from 'node:fs';
import { UsageError } from '../core/errors.js';
import { CookieJar } from '../http/cookiejar.js';
import type { Cookie } from '../core/types.js';

/**
 * Parse a Netscape-format cookies.txt file.
 *
 * Format (tab-separated):
 *   # Netscape HTTP Cookie File
 *   # comment lines start with #
 *   domain  flag  path  secure  expiry  name  value
 *
 * The flag field: TRUE/FALSE (whether all machines in domain can read)
 * The secure field: TRUE/FALSE
 * Expiry: Unix timestamp in seconds (0 = session cookie)
 *
 * Lines beginning with #HttpOnly_ prefix the domain — strip the prefix
 * and mark the cookie as httpOnly.
 */
export function parseNetscapeCookies(filePath: string): Cookie[] {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new UsageError(`Could not read cookies file "${filePath}": ${message}`);
    }

    // Try tab-delimited first, fall back to space-delimited
    const tabCookies = parseLines(content, '\t');
    if (tabCookies.length > 0) {
        return tabCookies;
    }

    // Space-delimited fallback
    const spaceCookies = parseLines(content, ' ');
    if (spaceCookies.length > 0) {
        return spaceCookies;
    }

    throw new UsageError(`No cookies found in "${filePath}".`);
}

/** Parse cookie lines with the given field delimiter. */
function parseLines(content: string, delimiter: string): Cookie[] {
    const cookies: Cookie[] = [];

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();

        // Skip empty lines
        if (!line) {
            continue;
        }

        // Handle #HttpOnly_ prefix lines (check BEFORE general # skip)
        const isHttpOnly = line.startsWith('#HttpOnly_');

        // Skip comment lines (lines starting with # that are NOT #HttpOnly_)
        if (line.startsWith('#') && !isHttpOnly) {
            continue;
        }

        const dataLine = isHttpOnly ? line.slice('#HttpOnly_'.length) : line;

        const parts = dataLine.split(delimiter);
        if (parts.length !== 7) continue;

        const rawDomain = parts[0];
        const rawPath = parts[2];
        const rawSecure = parts[3];
        const rawExpiry = parts[4] ?? '';
        const name = parts[5];
        const value = parts[6];

        if (!rawDomain || !name || !value) continue;

        const expiryNum = parseInt(rawExpiry, 10);
        const expires = rawExpiry === '0' || !rawExpiry || isNaN(expiryNum) ? null : new Date(expiryNum * 1000);

        cookies.push({
            name,
            value,
            domain: rawDomain.replace(/^\./, ''),
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            path: rawPath || '/',
            expires,
            httpOnly: isHttpOnly,
            secure: rawSecure?.toUpperCase() === 'TRUE',
        });
    }

    return cookies;
}

/** Load cookies from a Netscape file into a CookieJar. */
export function loadCookiesFromFile(filePath: string, jar: CookieJar): void {
    const cookies = parseNetscapeCookies(filePath);
    jar.addAll(cookies);
}
