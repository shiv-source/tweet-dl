import type { VideoInfo } from '../core/types.js';
import { XClient } from './client.js';
import { HttpClient } from '../http/client.js';
import { unwrapGraphQLResponse } from './graphql.js';
import { extractVideoInfo } from './video-info.js';
import { fetchSyndication } from './syndication.js';
import type { Logger } from '../logger.js';
import { AuthRequiredError, DownloadError, NoVideoError } from '../core/errors.js';

/**
 * Video extractor facade.
 *
 * Fallback chain:
 *   1. GraphQL TweetResultByRestId (primary, with guest token or auth)
 *   2. Syndication endpoint (no guest token needed, uses HttpClient for retry/timeout)
 *
 * Normalizes output to VideoInfo.
 */
export async function extractVideo(
    tweetId: string,
    xClient: XClient,
    http: HttpClient,
    logger?: Logger,
): Promise<VideoInfo> {
    // Attempt 1: GraphQL
    try {
        logger?.debug('Attempting GraphQL extraction...');
        await xClient.ensureGuestToken();
        const raw = await xClient.fetchTweetResult(tweetId);
        const unwrapped = unwrapGraphQLResponse(raw, logger);
        const videoInfo = extractVideoInfo(unwrapped, logger);
        logger?.info(
            `Found video: ${videoInfo.durationMs}ms, ` +
                `${videoInfo.dimensions?.width ?? '?'}x${videoInfo.dimensions?.height ?? '?'}`,
        );
        return videoInfo;
    } catch (err) {
        logger?.warn(`GraphQL extraction failed: ${err instanceof Error ? err.message : String(err)}`);

        // Short-circuit for auth/no-video — don't try syndication
        if (err instanceof AuthRequiredError || err instanceof NoVideoError) {
            throw err;
        }

        // Don't try syndication if GraphQL had a valid response structure (query-ID rotation)
        // but no video data — the syndication endpoint likely has the same issue
    }

    // Attempt 2: Syndication (uses HttpClient for timeout + retries)
    try {
        logger?.debug('Attempting syndication extraction...');
        // Wrap fetch through HttpClient for proper retry/timeout
        const syndicationFetch: typeof globalThis.fetch = (url, init) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : '';
            const method = init?.method ?? 'GET';
            if (method === 'GET') {
                return http.get(urlStr);
            }
            // POST for syndication shouldn't happen, but handle it
            return http.get(urlStr);
        };
        const videoInfo = await fetchSyndication(tweetId, syndicationFetch, logger);
        logger?.info('Video extracted via syndication fallback.');
        return videoInfo;
    } catch (err) {
        logger?.error(`Syndication fallback also failed: ${err instanceof Error ? err.message : String(err)}`);
        // Preserve the original error if it's typed
        if (err instanceof DownloadError) throw err;
        throw new DownloadError(
            'Could not extract video from this tweet. The tweet may be private, deleted, or rate-limited. Try providing cookies with -c.',
        );
    }
}
