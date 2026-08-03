import { HttpClient } from '../http/client.js';
import { CookieJar } from '../http/cookiejar.js';
import { BEARER_TOKEN, API_BASE, API_BASE_LEGACY, QUERY_ID, GRAPHQL_FEATURES } from '../core/config.js';
import { AuthRequiredError, NetworkError } from '../core/errors.js';
import type { Logger } from '../logger.js';

/**
 * X/Twitter API client.
 *
 * Handles:
 * - Guest token activation and caching (`POST /1.1/guest/activate.json`)
 * - CSRF token generation + injection
 * - GraphQL GET request building (TweetResultByRestId)
 * - Authenticated session vs guest mode (based on presence of auth_token cookie)
 */
export class XClient {
    private readonly http: HttpClient;
    private readonly cookieJar: CookieJar;
    private readonly logger: Logger | undefined;
    private guestToken: string | null = null;

    constructor(http: HttpClient, cookieJar: CookieJar, logger?: Logger) {
        this.http = http;
        this.cookieJar = cookieJar;
        this.logger = logger;
    }

    /** True if we have an auth_token cookie (logged-in session). */
    get isAuthenticated(): boolean {
        return this.cookieJar.hasAuthToken();
    }

    /**
     * Ensure we have a guest token. Skipped if already authenticated.
     * Activate a new guest token via the legacy API.
     */
    async ensureGuestToken(): Promise<void> {
        if (this.isAuthenticated) {
            this.logger?.debug('Using authenticated session, skipping guest token.');
            return;
        }

        if (this.guestToken) {
            return; // Already cached
        }

        this.logger?.debug('Activating guest token...');
        const response = await this.http.post(`${API_BASE_LEGACY}/1.1/guest/activate.json`, undefined, {
            Authorization: `Bearer ${BEARER_TOKEN}`,
            'Content-Type': 'application/json',
        });

        if (!response.ok) {
            throw new NetworkError(`Failed to activate guest token: HTTP ${response.status}`);
        }

        const data = (await response.json()) as Record<string, unknown>;
        const token = data.guest_token;
        if (typeof token !== 'string' || !token) {
            throw new NetworkError('Guest token missing from activation response.');
        }

        this.guestToken = token;
        this.logger?.debug('Guest token activated.');
    }

    /**
     * Refresh the guest token (discard cached token and re-activate).
     * Used when we get a 401 during extraction.
     */
    async refreshGuestToken(): Promise<void> {
        this.guestToken = null;
        this.logger?.debug('Refreshing guest token...');
        await this.ensureGuestToken();
    }

    /**
     * Fetch the TweetResultByRestId GraphQL endpoint for a given tweet ID.
     * Returns the raw parsed JSON response.
     */
    async fetchTweetResult(tweetId: string): Promise<Record<string, unknown>> {
        const variables = JSON.stringify({
            tweetId,
            withCommunity: false,
            includePromotedContent: false,
            withVoice: false,
        });

        const features = JSON.stringify(GRAPHQL_FEATURES);
        const fieldToggles = JSON.stringify({
            withArticleRichTextState: false,
        });

        const params = new URLSearchParams({
            variables,
            features,
            fieldToggles,
        });

        const url = `${API_BASE}/i/api/graphql/${QUERY_ID}/TweetResultByRestId?${params.toString()}`;
        this.logger?.debug(`Fetching tweet: ${url}`);

        // Build auth headers
        const headers: Record<string, string> = {
            Authorization: `Bearer ${BEARER_TOKEN}`,
            'X-Twitter-Client-Language': 'en',
        };

        if (this.isAuthenticated) {
            headers['X-Twitter-Auth-Type'] = 'OAuth2Session';
            headers['X-Twitter-Active-User'] = 'yes';
        } else if (this.guestToken) {
            headers['X-Guest-Token'] = this.guestToken;
        }

        // CSRF token: use ct0 cookie if available, otherwise generate random
        const ct0 = this.cookieJar.get('ct0', 'x.com');
        const csrfToken = ct0?.value ?? generateCsrfToken();
        headers['X-Csrf-Token'] = csrfToken;
        headers.Referer = 'https://x.com/';

        const response = await this.http.get(url, headers);

        if (response.status === 401 && !this.isAuthenticated) {
            // Guest token likely expired — refresh and retry once
            this.logger?.debug('Got 401, refreshing guest token...');
            await this.refreshGuestToken();
            if (this.guestToken) {
                headers['X-Guest-Token'] = this.guestToken;
            }
            const retryResponse = await this.http.get(url, headers);
            if (!retryResponse.ok) {
                throw new NetworkError(`GraphQL request failed after token refresh: HTTP ${retryResponse.status}`);
            }
            return (await retryResponse.json()) as Record<string, unknown>;
        }

        if (!response.ok) {
            if (response.status === 403) {
                throw new AuthRequiredError(
                    'Access denied (HTTP 403). This tweet may be protected or require login. Use -c cookies.txt.',
                );
            }
            throw new NetworkError(`GraphQL request failed: HTTP ${response.status}`);
        }

        return (await response.json()) as Record<string, unknown>;
    }
}

/** Generate a random 32-character hex CSRF token. */
function generateCsrfToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
