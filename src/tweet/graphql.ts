import { AuthRequiredError, NoVideoError, DownloadError } from '../core/errors.js';
import type { Logger } from '../logger.js';

/**
 * Unwrap the deeply nested GraphQL TweetResultByRestId response.
 *
 * The response shape (from yt-dlp/gallery-dl patterns):
 *   data.tweetResult.result
 *     | TweetWithVisibilityResults { tweet: { legacy: { extended_entities: ... } } }
 *     | TweetTombstone { tombstone: { text: ... } }
 *     | TweetUnavailable { reason: "NsfwLoggedOut" | "Protected" | ... }
 *
 * Returns the unwrapped tweet result object, or throws.
 */
export function unwrapGraphQLResponse(data: Record<string, unknown>, logger?: Logger): Record<string, unknown> {
    const graphqlData = data.data;
    if (!graphqlData || typeof graphqlData !== 'object') {
        throw new DownloadError('Unexpected GraphQL response: missing data field.');
    }

    const tweetResult = (graphqlData as Record<string, unknown>).tweetResult;
    if (!tweetResult || typeof tweetResult !== 'object') {
        throw new DownloadError('Unexpected GraphQL response: missing tweetResult.');
    }

    const result = (tweetResult as Record<string, unknown>).result;
    if (!result || typeof result !== 'object') {
        throw new DownloadError('Unexpected GraphQL response: missing result.');
    }

    return unwrapResult(result as Record<string, unknown>, logger);
}

/**
 * Handle the various result wrapper types.
 */
function unwrapResult(result: Record<string, unknown>, logger?: Logger): Record<string, unknown> {
    const typename = result.__typename;

    // Case 1: TweetWithVisibilityResults — unwrap to inner tweet
    if (typename === 'TweetWithVisibilityResults') {
        logger?.debug('Unwrapping TweetWithVisibilityResults...');
        const tweet = result.tweet;
        if (tweet && typeof tweet === 'object') {
            return tweet as Record<string, unknown>;
        }
        throw new DownloadError('TweetWithVisibilityResults had no inner tweet.');
    }

    // Case 2: Tweet (normal case) — returned directly
    if (typename === 'Tweet') {
        return result;
    }

    // If no __typename but has 'legacy', it's already unwrapped
    if (result.legacy) {
        return result;
    }

    // Case 3: TweetTombstone — deleted/unavailable
    if (typename === 'TweetTombstone') {
        const tombstone = result.tombstone;
        const tombstoneText =
            tombstone && typeof tombstone === 'object'
                ? ((): string => {
                      const t = (tombstone as Record<string, unknown>).text;
                      return typeof t === 'string' ? t : '';
                  })()
                : '';
        throw new NoVideoError(`Tweet unavailable: ${tombstoneText || 'This tweet is unavailable.'}`);
    }

    // Case 4: TweetUnavailable
    if (typename === 'TweetUnavailable') {
        const reason = typeof result.reason === 'string' ? result.reason : 'Unknown';

        if (
            reason === 'NsfwLoggedOut' ||
            reason === 'NsfwHighSensitivity' ||
            reason === 'Protected' ||
            reason === 'Suspended' ||
            reason === 'Banned'
        ) {
            throw new AuthRequiredError(
                `This tweet requires authentication (${reason}). Use -c cookies.txt or --cookies-from-browser.`,
            );
        }

        throw new DownloadError(`Tweet unavailable: ${reason}`);
    }

    // Unknown wrapper — attempt to proceed
    logger?.warn(`Unknown result type: ${typeof typename === 'string' ? typename : 'undefined'}`);
    return result;
}
