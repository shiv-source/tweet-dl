import { NoVideoError } from '../core/errors.js';
import type { VideoInfo, Variant } from '../core/types.js';
import type { Logger } from '../logger.js';

/**
 * Extract VideoInfo from an unwrapped tweet result object.
 *
 * The expected path:
 *   tweet.legacy.extended_entities.media[]
 *     → video_info.variants[] (m3u8 and mp4)
 *     → media_url_https (fallback for images)
 *     → ext_media_availability.status
 */
export function extractVideoInfo(tweetResult: Record<string, unknown>, logger?: Logger): VideoInfo {
    const legacy = tweetResult.legacy;
    if (!legacy || typeof legacy !== 'object') {
        throw new NoVideoError('Tweet has no legacy data. Cannot extract media.');
    }

    const extendedEntities = (legacy as Record<string, unknown>).extended_entities;
    if (!extendedEntities || typeof extendedEntities !== 'object') {
        throw new NoVideoError('Tweet does not contain any media.');
    }

    const media = (extendedEntities as Record<string, unknown>).media;
    if (!Array.isArray(media) || media.length === 0) {
        throw new NoVideoError('Tweet has no media attachments.');
    }

    // Find the first video entry
    for (const item of media) {
        if (typeof item !== 'object' || item === null) continue;

        const mediaItem = item as Record<string, unknown>;
        const mediaType = mediaItem.type;
        if (mediaType !== 'video' && mediaType !== 'animated_gif') continue;

        // Check availability
        const availability = mediaItem.ext_media_availability as Record<string, unknown> | undefined;
        if (availability && typeof availability === 'object' && availability.status === 'Unavailable') {
            logger?.warn('Media availability status is Unavailable — may be a live stream or private.');
            // Still try to download — might be accessible
        }

        const videoInfo = mediaItem.video_info as Record<string, unknown> | undefined;
        if (!videoInfo || typeof videoInfo !== 'object') {
            logger?.debug('Media item has no video_info — skipping to next item.');
            continue;
        }

        const variants = videoInfo.variants;
        if (!Array.isArray(variants) || variants.length === 0) {
            throw new NoVideoError('Video tweet has no downloadable variants.');
        }

        const durationMs = parseNumericField(videoInfo.duration_millis);

        const parsed: Variant[] = [];
        for (const v of variants) {
            if (typeof v !== 'object' || v === null) continue;
            const variantObj = v as Record<string, unknown>;
            const url = variantObj.url;
            const contentType = variantObj.content_type;
            const bitrate = variantObj.bitrate;

            if (typeof url !== 'string') continue;

            // Only accept known video content types
            if (contentType === 'application/x-mpegURL') {
                parsed.push({ url, contentType: 'application/x-mpegURL', bitrate: undefined });
            } else if (contentType === 'video/mp4') {
                parsed.push({
                    url,
                    contentType: 'video/mp4',
                    bitrate: typeof bitrate === 'number' ? bitrate : undefined,
                });
            }
            // Skip unknown types (thumbnails, images, etc.) silently
        }

        const m3u8 = parsed.find((v) => v.contentType === 'application/x-mpegURL');
        const mp4s = parsed.filter((v) => v.contentType === 'video/mp4');

        // Extract dimensions
        const dimensions = extractDimensions(mediaItem);

        if (m3u8) {
            logger?.debug(`Found m3u8: ${m3u8.url}`);
            return {
                m3u8Url: m3u8.url,
                mp4Variants: mp4s,
                durationMs,
                dimensions,
            };
        }

        // No m3u8 — use direct MP4
        if (mp4s.length > 0) {
            // Sort by bitrate descending, pick best
            mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
            const best = mp4s[0];
            if (!best) throw new NoVideoError('MP4 variant list is empty.');
            logger?.warn('No HLS stream found. Using direct MP4 download (no quality selection).');
            return {
                m3u8Url: best.url, // Will be treated as direct download
                mp4Variants: mp4s,
                durationMs,
                dimensions,
            };
        }

        throw new NoVideoError('Video tweet has no downloadable video formats.');
    }

    throw new NoVideoError('No video media found in this tweet (may be images only).');
}

/** Extract dimensions from media object. */
function extractDimensions(media: Record<string, unknown>): { width: number; height: number } | null {
    const originalInfo = media.original_info;
    if (originalInfo && typeof originalInfo === 'object') {
        const w = (originalInfo as Record<string, unknown>).width;
        const h = (originalInfo as Record<string, unknown>).height;
        if (typeof w === 'number' && typeof h === 'number') {
            return { width: w, height: h };
        }
    }

    // Fallback: parse from sizes
    const sizes = media.sizes;
    if (sizes && typeof sizes === 'object') {
        const large = (sizes as Record<string, unknown>).large;
        if (large && typeof large === 'object') {
            const w = (large as Record<string, unknown>).w;
            const h = (large as Record<string, unknown>).h;
            if (typeof w === 'number' && typeof h === 'number') {
                return { width: w, height: h };
            }
        }
    }

    return null;
}

/** Parse a numeric field that may be string or number from API responses. */
function parseNumericField(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}
