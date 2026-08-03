import { UsageError } from '../core/errors.js';
import type { TweetUrl } from '../core/types.js';

/**
 * Parse and validate a Twitter/X tweet URL.
 * Supports these URL formats:
 *   https://twitter.com/{user}/status/{id}
 *   https://x.com/{user}/status/{id}
 *   https://www.twitter.com/{user}/status/{id}
 *   https://m.twitter.com/{user}/status/{id}
 *   https://mobile.twitter.com/{user}/status/{id}
 *   https://x.com/i/web/status/{id}
 *
 * Query strings and fragments are silently stripped.
 * Trailing slashes are tolerated.
 */
export function parseTweetUrl(raw: string): TweetUrl {
    const trimmed = raw.trim();

    if (!trimmed) {
        throw new UsageError('Tweet URL must not be empty.');
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new UsageError(`Could not parse URL: "${trimmed}"`);
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    // Accept twitter.com and x.com (including subdomains m/mobile)
    if (
        hostname !== 'twitter.com' &&
        hostname !== 'x.com' &&
        hostname !== 'm.twitter.com' &&
        hostname !== 'mobile.twitter.com'
    ) {
        throw new UsageError(`Not a recognized Twitter/X URL. Expected x.com or twitter.com, got "${hostname}".`);
    }

    // Strip query and fragment for path matching
    const pathname = url.pathname.replace(/\/$/, '');

    // Pattern 1: /{user}/status/{id}
    const statusMatch = /^\/([^/]+)\/status\/(\d+)$/.exec(pathname);
    if (statusMatch?.[1] && statusMatch[2]) {
        return {
            username: statusMatch[1],
            statusId: statusMatch[2],
            raw: trimmed,
        };
    }

    // Pattern 2: /i/web/status/{id} (no username available)
    const webMatch = /^\/i\/web\/status\/(\d+)$/.exec(pathname);
    if (webMatch?.[1]) {
        return {
            username: null,
            statusId: webMatch[1],
            raw: trimmed,
        };
    }

    throw new UsageError(
        `Could not extract tweet ID from URL: "${trimmed}". Expected a URL like https://x.com/user/status/12345`,
    );
}
