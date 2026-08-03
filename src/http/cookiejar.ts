import type { Cookie } from '../core/types.js';

/**
 * Simple domain-scoped cookie jar.
 *
 * Implements basic RFC 6265 cookie domain matching:
 * - Exact match: host === domain
 * - Subdomain match: host ends with "." + domain
 *
 * Does NOT send cookies with Secure flag over HTTP.
 */
export class CookieJar {
    private readonly cookies: Cookie[] = [];

    /** Add a cookie to the jar. Overwrites existing cookie with same name + domain + path. */
    add(cookie: Cookie): void {
        this.remove(cookie.name, cookie.domain, cookie.path);
        this.cookies.push(cookie);
    }

    /** Add multiple cookies at once. */
    addAll(cookies: Cookie[]): void {
        for (const c of cookies) {
            this.add(c);
        }
    }

    /** Remove a cookie by name, domain, and path. */
    remove(name: string, domain: string, path = '/'): void {
        const idx = this.cookies.findIndex((c) => c.name === name && c.domain === domain && c.path === path);
        if (idx !== -1) this.cookies.splice(idx, 1);
    }

    /** Check if the jar has an auth_token cookie (indicates logged-in session). */
    hasAuthToken(): boolean {
        return this.cookies.some((c) => c.name === 'auth_token' && !this.isExpired(c));
    }

    /**
     * Get a specific cookie by name, matching a given host.
     * Returns the first match found on exact or subdomain match.
     */
    get(name: string, host?: string): Cookie | undefined {
        return this.cookies.find((c) => {
            if (c.name !== name || this.isExpired(c)) return false;
            if (host !== undefined) return this.domainMatches(c.domain, host);
            return true;
        });
    }

    /**
     * Build the Cookie header value for a given URL.
     * Filters by domain match and excludes expired cookies.
     * Skips Secure cookies on non-HTTPS connections.
     */
    cookieHeaderFor(url: string): string {
        const urlObj = new URL(url);
        const host = urlObj.hostname;
        const isSecure = urlObj.protocol === 'https:';

        const matching = this.cookies.filter((c) => {
            if (this.isExpired(c)) return false;
            if (c.secure && !isSecure) return false;
            // Path matching: cookie path must be a prefix of the URL path
            if (!this.pathMatches(c.path, urlObj.pathname)) return false;
            return this.domainMatches(c.domain, host);
        });

        return matching.map((c) => `${c.name}=${c.value}`).join('; ');
    }

    /** Get all non-expired cookies (for debugging / serialization). */
    getAll(): Cookie[] {
        return this.cookies.filter((c) => !this.isExpired(c));
    }

    /**
     * RFC 6265 domain matching.
     * Exact match: host === domain (after stripping leading dot)
     * Subdomain: host ends with "." + domain
     * Public suffix (TLD) cookies are rejected by requiring at least one dot in the domain.
     */
    private domainMatches(cookieDomain: string, host: string): boolean {
        const domain = cookieDomain.replace(/^\./, '');

        // Reject TLD-only domains (e.g., "com", "net")
        if (!domain.includes('.')) return false;

        // Exact match
        if (host === domain) return true;

        // Subdomain match: host must end with '.' + domain
        // E.g., host="sub.x.com", domain="x.com" → true
        //       host="notx.com", domain="x.com" → false (no dot before)
        if (host.endsWith('.' + domain)) return true;

        return false;
    }

    /**
     * RFC 6265 path matching: cookie path must be a directory prefix of the request path.
     */
    private pathMatches(cookiePath: string, requestPath: string): boolean {
        if (cookiePath === requestPath) return true;
        if (cookiePath === '/') return true;
        // cookiePath is prefix and next char in requestPath is /
        if (
            requestPath.startsWith(cookiePath) &&
            (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/')
        ) {
            return true;
        }
        return false;
    }

    private isExpired(cookie: Cookie): boolean {
        return cookie.expires !== null && cookie.expires.getTime() <= Date.now();
    }
}
