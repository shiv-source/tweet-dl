import type { StreamVariant } from '../core/types.js';
import type { Quality } from '../core/types.js';
import { UsageError } from '../core/errors.js';
import { VALID_QUALITIES } from '../core/config.js';
import type { Logger } from '../logger.js';

/**
 * Select a stream variant from a master playlist based on requested quality.
 *
 * Rules:
 * - "best": pick the variant with the highest BANDWIDTH.
 * - "1080p" / "720p" / "480p": pick the variant whose height is closest
 *   (≤ requested height). If no variant at or below, pick the lowest available.
 * - Reject audio-only variants (no video codec in CODECS).
 */
export function selectVariant(variants: StreamVariant[], quality: Quality, logger?: Logger): StreamVariant {
    // Validate quality value
    if (!VALID_QUALITIES.includes(quality)) {
        throw new UsageError(`Invalid quality "${quality}". Must be one of: ${VALID_QUALITIES.join(', ')}`);
    }

    // Filter out audio-only variants (no video codec)
    // X master playlists often list codecs as "mp4a.40.2,avc1.4D4015" (audio first)
    const videoCodecPattern = /avc1|hvc1|hev1|vp\d|av01|theora/i;
    const videoVariants = variants.filter((v) => {
        if (!v.codecs) return true; // Unknown — assume video
        return videoCodecPattern.test(v.codecs);
    });

    if (videoVariants.length === 0) {
        throw new UsageError('No video variants found in stream. Audio-only streams are not supported.');
    }

    if (quality === 'best') {
        // Max bandwidth
        videoVariants.sort((a, b) => b.bandwidth - a.bandwidth);
        const best = videoVariants[0];
        if (!best) {
            const first = variants[0];
            if (!first) throw new UsageError('No video variants in stream.');
            return first; // Should never happen; safe fallback
        }
        logger?.info(
            `Selected best quality: ${best.width ?? '?'}x${best.height ?? '?'} ` +
                `at ${Math.round(best.bandwidth / 1000)} kbps`,
        );
        return best;
    }

    // Height-based selection
    const targetHeight = parseInt(quality, 10);

    // Sort by bandwidth descending, then find closest ≤ target
    videoVariants.sort((a, b) => b.bandwidth - a.bandwidth);

    let selected: StreamVariant | null = null;
    for (const v of videoVariants) {
        if (v.height !== null && v.height <= targetHeight) {
            selected = v;
            break;
        }
    }

    if (!selected) {
        // No variant at or below target — pick the lowest available
        videoVariants.sort((a, b) => (a.height ?? 9999) - (b.height ?? 9999));
        const fallback = videoVariants[0];
        if (!fallback) throw new UsageError('No video variants available.');
        selected = fallback;
        logger?.warn(
            `No variant at or below ${quality}. Falling back to ` +
                `${selected.width ?? '?'}x${selected.height ?? '?'}`,
        );
    } else {
        logger?.info(
            `Selected quality: ${selected.width ?? '?'}x${selected.height ?? '?'} ` +
                `at ${Math.round(selected.bandwidth / 1000)} kbps`,
        );
    }

    return selected;
}

/** Validate that a quality string is known. */
export function validateQuality(value: string): asserts value is Quality {
    if (!VALID_QUALITIES.includes(value as Quality)) {
        throw new UsageError(`Invalid quality "${value}". Must be one of: ${VALID_QUALITIES.join(', ')}`);
    }
}
