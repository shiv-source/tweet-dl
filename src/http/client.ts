import type { CookieJar } from './cookiejar.js';
import { NetworkError } from '../core/errors.js';
import { MAX_RETRIES, RETRY_DELAY_MS, REQUEST_TIMEOUT_MS, USER_AGENT } from '../core/config.js';
import type { Logger } from '../logger.js';

/** Headers that may be set on every request. */
export type RequestHeaders = Record<string, string>;

/** Options for the HttpClient. */
export interface HttpClientOptions {
    /** Cookie jar for automatic Cookie header injection. */
    cookieJar?: CookieJar;
    /** Extra headers added to every request. */
    baseHeaders?: RequestHeaders;
    /** User-Agent override. */
    userAgent?: string;
    /** Request timeout in ms. */
    timeout?: number;
    /** Logger instance. */
    logger?: Logger;
}

/**
 * Thin typed wrapper around global fetch with retry, cookie injection,
 * and timeout support (via AbortController).
 */
export class HttpClient {
    private readonly cookieJar?: CookieJar;
    private readonly baseHeaders: RequestHeaders;
    private readonly userAgent: string;
    private readonly timeout: number;
    private readonly logger?: Logger;

    constructor(options: HttpClientOptions = {}) {
        this.cookieJar = options.cookieJar;
        this.baseHeaders = options.baseHeaders ?? {};
        this.userAgent = options.userAgent ?? USER_AGENT;
        this.timeout = options.timeout ?? REQUEST_TIMEOUT_MS;
        this.logger = options.logger;
    }

    /**
     * Perform a GET request with retry and automatic cookie injection.
     */
    async get(url: string, extraHeaders?: RequestHeaders): Promise<Response> {
        return this.requestWithRetry(url, {
            method: 'GET',
            headers: this.buildHeaders(url, extraHeaders),
        });
    }

    /**
     * Perform a POST request with JSON body.
     */
    async post(url: string, body?: unknown, extraHeaders?: RequestHeaders): Promise<Response> {
        const headers = this.buildHeaders(url, extraHeaders);
        return this.requestWithRetry(url, {
            method: 'POST',
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    }

    private buildHeaders(url: string, extra?: RequestHeaders): Record<string, string> {
        const headers: Record<string, string> = {
            'User-Agent': this.userAgent,
            Accept: '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            ...this.baseHeaders,
            ...extra,
        };

        // Inject cookies from jar
        if (this.cookieJar) {
            const cookieHeader = this.cookieJar.cookieHeaderFor(url);
            if (cookieHeader) {
                headers.Cookie = cookieHeader;
            }
        }

        return headers;
    }

    private async requestWithRetry(url: string, init: RequestInit): Promise<Response> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => {
                    controller.abort();
                }, this.timeout);

                const response = await fetch(url, {
                    ...init,
                    signal: controller.signal,
                });
                clearTimeout(timer);

                // Retry on server errors and rate limits
                if (attempt < MAX_RETRIES && (response.status >= 500 || response.status === 429)) {
                    const delay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
                    this.logger?.debug(
                        `Retry ${attempt + 1}/${MAX_RETRIES} after ${response.status}, waiting ${Math.round(delay)}ms`,
                    );
                    await sleep(delay);
                    continue;
                }

                return response;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));

                // Don't retry on abort/timeout unless we have retries left
                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
                    this.logger?.debug(
                        `Request failed (attempt ${attempt + 1}), retrying in ${Math.round(delay)}ms: ${lastError.message}`,
                    );
                    await sleep(delay);
                }
            }
        }

        throw new NetworkError(
            `Request to ${url} failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown error'}`,
        );
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
