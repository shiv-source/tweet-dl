import type { StreamVariant, MediaPlaylist, Segment } from '../core/types.js';

/**
 * HLS playlist parser.
 *
 * Parses two types of playlists:
 * - Master playlist: contains `#EXT-X-STREAM-INF` entries pointing to variant playlists
 * - Media playlist: contains `#EXTINF` entries pointing to TS/fMP4 segments
 */

/**
 * Parse a master playlist into StreamVariant[].
 * Also extracts audio tracks from EXT-X-MEDIA tags and links them to variants.
 */
export function parseMasterPlaylist(text: string, baseUrl: string): StreamVariant[] {
    const lines = text.split(/\r?\n/);

    // First pass: collect audio tracks by group ID
    const audioMap = new Map<string, string>();
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#EXT-X-MEDIA:') && trimmed.includes('TYPE=AUDIO')) {
            const attrs = parseAttributes(trimmed.slice('#EXT-X-MEDIA:'.length));
            if (attrs['GROUP-ID'] && attrs.URI) {
                audioMap.set(attrs['GROUP-ID'], resolveUri(attrs.URI, baseUrl));
            }
        }
    }

    // Second pass: parse variants and link audio
    const variants: StreamVariant[] = [];
    let currentVariant: Partial<StreamVariant> | null = null;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
            currentVariant = {};
            const attrs = parseAttributes(trimmed.slice('#EXT-X-STREAM-INF:'.length));

            currentVariant.bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) || 0 : 0;

            if (attrs.RESOLUTION) {
                const [w, h] = attrs.RESOLUTION.split('x');
                currentVariant.width = w ? parseInt(w, 10) : null;
                currentVariant.height = h ? parseInt(h, 10) : null;
            } else {
                currentVariant.width = null;
                currentVariant.height = null;
            }

            currentVariant.codecs = attrs.CODECS ?? null;
            currentVariant.audioGroup = attrs.AUDIO ?? null;
            currentVariant.audioUrl = attrs.AUDIO ? (audioMap.get(attrs.AUDIO) ?? null) : null;
        } else if (trimmed && !trimmed.startsWith('#') && currentVariant) {
            // URI line — complete the variant
            currentVariant.url = resolveUri(trimmed, baseUrl);
            variants.push(currentVariant as StreamVariant);
            currentVariant = null;
        }
    }

    return variants;
}

/** Parse a media playlist into a MediaPlaylist. */
export function parseMediaPlaylist(text: string, baseUrl: string): MediaPlaylist {
    const lines = text.split(/\r?\n/);
    const segments: Segment[] = [];
    let initSegment: string | null = null;
    let targetDuration = 10;
    let ended = false;
    let currentDuration = 0;
    let sequence = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('#EXT-X-TARGETDURATION:')) {
            const td = parseFloat(trimmed.slice('#EXT-X-TARGETDURATION:'.length));
            targetDuration = isNaN(td) ? 10 : td;
        } else if (trimmed === '#EXT-X-ENDLIST') {
            ended = true;
        } else if (trimmed.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
            const seq = parseInt(trimmed.slice('#EXT-X-MEDIA-SEQUENCE:'.length), 10);
            sequence = isNaN(seq) ? 0 : seq;
        } else if (trimmed.startsWith('#EXT-X-MAP:')) {
            // fMP4 init segment
            const attrs = parseAttributes(trimmed.slice('#EXT-X-MAP:'.length));
            if (attrs.URI) {
                initSegment = resolveUri(attrs.URI, baseUrl);
            }
        } else if (trimmed === '#EXTINF:0,') {
            // Often the map-only line — skip
            currentDuration = 0;
        } else if (trimmed.startsWith('#EXTINF:')) {
            const dur = parseFloat(trimmed.slice('#EXTINF:'.length).split(',')[0] ?? '0');
            currentDuration = dur > 0 ? dur : 0.001;
        } else if (trimmed && !trimmed.startsWith('#')) {
            // URI line
            segments.push({
                url: resolveUri(trimmed, baseUrl),
                duration: currentDuration,
                sequence,
            });
            sequence++;
            currentDuration = 0;
        }
    }

    return { segments, initSegment, targetDuration, ended };
}

/** Parse key=value pairs from HLS attribute lines. Values may be quoted. */
function parseAttributes(attrString: string): Record<string, string> {
    const result: Record<string, string> = {};
    // Match KEY=VALUE or KEY="VALUE"
    const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]+))/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(attrString)) !== null) {
        const key = match[1];
        if (!key) continue;
        const value = match[2] ?? match[3] ?? '';
        result[key] = value;
    }
    return result;
}

/** Resolve a potentially-relative URI against a base URL. */
export function resolveUri(uri: string, baseUrl: string): string {
    try {
        return new URL(uri, baseUrl).href;
    } catch {
        return uri;
    }
}
