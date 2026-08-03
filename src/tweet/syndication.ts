import { GOOGLEBOT_UA, SYNDICATION_BASE } from '../core/config.js';
import { DownloadError, NoVideoError } from '../core/errors.js';
import type { VideoInfo } from '../core/types.js';
import type { Logger } from '../logger.js';
import { extractVideoInfo } from './video-info.js';

/**
 * Syndication endpoint fallback.
 *
 * This endpoint serves tweet data to Googlebot and other crawlers.
 * It requires no guest token — just a Googlebot User-Agent.
 *
 * URL: https://cdn.syndication.twimg.com/tweet-result?id={tweetId}&token={token}
 *
 * The token is a trivial checksum; yt-dlp computes it as:
 *   token = hex((tweetId / 15 * 10) + 3) — approximate, often works without token too.
 *
 * Response shape: similar to GraphQL result.tweetResult, with mediaDetails instead of
 * extended_entities. The video variants are in mediaDetails[].media_key → variants[].
 */
export async function fetchSyndication(
    tweetId: string,
    fetchFn: typeof globalThis.fetch,
    logger?: Logger,
): Promise<VideoInfo> {
    logger?.debug('Trying syndication endpoint fallback...');

    // Try with token
    const token = computeSyndicationToken(tweetId);
    const url = `${SYNDICATION_BASE}/tweet-result?id=${tweetId}&token=${token}`;

    const response = await fetchFn(url, {
        headers: {
            'User-Agent': GOOGLEBOT_UA,
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new DownloadError(`Syndication endpoint returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return extractFromSyndication(data, logger);
}

/** Compute the simple checksum token for the syndication endpoint. */
function computeSyndicationToken(tweetId: string): string {
    // yt-dlp formula: hex(int((int(tweetId) / 15 * 10) + 3))
    // Guard against non-numeric IDs (shouldn't happen given url.ts validation)
    if (!/^\d+$/.test(tweetId)) return '3';
    try {
        const id = BigInt(tweetId);
        const val = Number((id / 15n) * 10n + 3n);
        return val.toString(16);
    } catch {
        return '3';
    }
}

/**
 * Extract VideoInfo from syndication endpoint response.
 *
 * The response shape:
 *   { mediaDetails: [{ media_key: "...", ... }] } with nested variant URLs
 *   OR the GraphQL-like shape with legacy.extended_entities
 */
function extractFromSyndication(data: Record<string, unknown>, logger?: Logger): VideoInfo {
    // Strategy 1: Check mediaDetails array (primary format)
    const mediaDetails = data.mediaDetails;
    if (Array.isArray(mediaDetails) && mediaDetails.length > 0) {
        logger?.debug('Extracting video from mediaDetails...');
        return extractFromMediaDetails(mediaDetails, logger);
    }

    // Strategy 2: Check top-level video object (alternate format)
    const video = data.video;
    if (video && typeof video === 'object') {
        logger?.debug('Extracting video from top-level video object...');
        return extractFromMediaDetails([video], logger);
    }

    // Strategy 3: Try standard video-info extraction (GraphQL-like shape)
    logger?.debug('Trying standard video extraction from syndication response...');
    return extractVideoInfo(data, logger);
}

function extractFromMediaDetails(mediaDetails: unknown[], logger?: Logger): VideoInfo {
    for (const item of mediaDetails) {
        if (typeof item !== 'object' || item === null) continue;
        const mediaItem = item as Record<string, unknown>;

        // Skip non-video items (X includes thumbnail images in mediaDetails)
        const mediaType = mediaItem.type;
        if (mediaType !== 'video' && mediaType !== 'animated_gif') continue;

        // The syndication response nests variants under video_info
        const videoInfo = (mediaItem.video_info ?? mediaItem) as Record<string, unknown>;
        const rawVariants = videoInfo.variants;
        if (!Array.isArray(rawVariants) || rawVariants.length === 0) continue;

        const m3u8: string[] = [];
        const mp4s: { url: string; bitrate?: number; contentType: 'video/mp4' }[] = [];

        for (const v of rawVariants) {
            if (typeof v !== 'object' || v === null) continue;
            const variant = v as Record<string, unknown>;

            // Syndication uses content_type/url OR type/src depending on path
            const vurl = (variant.url ?? variant.src) as string | undefined;
            const vtype = (variant.content_type ?? variant.type) as string | undefined;
            const bitrate = variant.bitrate as number | undefined;
            const vbr = typeof bitrate === 'number' ? bitrate : undefined;

            if (typeof vurl !== 'string') continue;

            if (vtype === 'application/x-mpegURL') {
                m3u8.push(vurl);
            } else if (vtype === 'video/mp4') {
                mp4s.push({ url: vurl, bitrate: vbr, contentType: 'video/mp4' });
            }
        }

        const durationMs = parseNumericField(videoInfo.duration_millis ?? videoInfo.durationMs);

        if (m3u8.length > 0) {
            const chosen = m3u8[0];
            if (!chosen) throw new NoVideoError('m3u8 variant list is empty.');
            logger?.debug(`Found m3u8 via syndication: ${chosen}`);
            return {
                m3u8Url: chosen,
                mp4Variants: mp4s.map((m) => ({ url: m.url, contentType: m.contentType, bitrate: m.bitrate })),
                durationMs,
                dimensions: null,
            };
        }

        if (mp4s.length > 0) {
            mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
            const best = mp4s[0];
            if (!best) throw new NoVideoError('MP4 variant list is empty.');
            logger?.warn('No HLS in syndication. Using direct MP4.');
            return {
                m3u8Url: best.url,
                mp4Variants: mp4s.map((m) => ({ url: m.url, contentType: m.contentType, bitrate: m.bitrate })),
                durationMs,
                dimensions: null,
            };
        }
    }

    throw new NoVideoError('No video found in syndication response.');
}

function parseNumericField(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}
