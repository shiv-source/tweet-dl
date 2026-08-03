import * as path from 'node:path';
import { HttpClient } from '../http/client.js';
import { downloadFile } from '../http/download.js';
import { parseMediaPlaylist } from './m3u8.js';
import { DownloadError } from '../core/errors.js';
import { MAX_RETRIES, RETRY_DELAY_MS, DEFAULT_CONCURRENCY } from '../core/config.js';
import type { Segment } from '../core/types.js';
import type { Logger } from '../logger.js';

/** Options for the HLS downloader. */
export interface DownloaderOptions {
    /** Concurrency limit for segment downloads. */
    concurrency?: number;
    /** Callback for per-segment progress. */
    onProgress?: (completed: number, total: number) => void;
    /** AbortSignal to cancel in-progress downloads. */
    signal?: AbortSignal;
}

/**
 * Download all HLS segments from a media playlist URL.
 *
 * 1. Fetch and parse the media playlist
 * 2. Download each segment to a temp directory (concurrently)
 * 3. Return the sorted local paths and optional init segment path
 */
export async function downloadSegments(
    http: HttpClient,
    playlistUrl: string,
    outputDir: string,
    options: DownloaderOptions = {},
    logger?: Logger,
): Promise<{ segmentPaths: string[]; initSegmentPath: string | null }> {
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

    // Fetch and parse the media playlist
    logger?.debug(`Fetching media playlist: ${playlistUrl}`);
    const response = await http.get(playlistUrl);
    if (!response.ok) {
        throw new DownloadError(`Failed to fetch media playlist: HTTP ${response.status}`);
    }

    const playlistText = await response.text();
    const playlist = parseMediaPlaylist(playlistText, playlistUrl);
    logger?.debug(`Parsed ${playlist.segments.length} segments`);

    if (!playlist.ended) {
        logger?.warn('Live stream detected (no #EXT-X-ENDLIST). Download may be truncated.');
    }

    // Download init segment if present (fMP4)
    let initSegmentPath: string | null = null;
    if (playlist.initSegment) {
        const initPath = path.join(outputDir, 'init.mp4');
        logger?.debug(`Downloading init segment: ${playlist.initSegment}`);
        await downloadFile(http, playlist.initSegment, initPath, undefined, logger);
        initSegmentPath = initPath;
    }

    // Download segments concurrently
    const segmentPaths = await downloadSegmentBatch(http, playlist.segments, outputDir, concurrency, options, logger);

    return { segmentPaths, initSegmentPath };
}

async function downloadSegmentBatch(
    http: HttpClient,
    segments: Segment[],
    outputDir: string,
    concurrency: number,
    options: DownloaderOptions,
    logger?: Logger,
): Promise<string[]> {
    // Guard against invalid concurrency
    const workerCount = Math.max(1, Math.min(concurrency, segments.length));
    const results: (string | undefined)[] = new Array<string | undefined>(segments.length);
    let completed = 0;
    const total = segments.length;

    const signal = options.signal;

    // Use AbortController if no external signal provided
    const controller = signal ? undefined : new AbortController();
    const abortSignal = signal ?? controller?.signal;

    let index = 0;
    const errors: Error[] = [];

    async function worker(): Promise<void> {
        while (index < segments.length) {
            if (abortSignal?.aborted) return;

            const i = index++;
            if (i >= segments.length) break;

            const segment = segments[i];
            if (!segment) continue;

            // Check for cancellation
            if (abortSignal?.aborted) return;

            const destPath = path.join(outputDir, `seg-${String(i).padStart(6, '0')}.ts`);

            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                if (abortSignal?.aborted) return;
                try {
                    await downloadFile(http, segment.url, destPath, undefined, logger);
                    results[i] = destPath;
                    completed++;
                    options.onProgress?.(completed, total);
                    break;
                } catch (err) {
                    if (attempt === MAX_RETRIES - 1) {
                        errors.push(err instanceof Error ? err : new Error(String(err)));
                        controller?.abort();
                        return;
                    }
                    const delay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
                    logger?.debug(`Retry segment ${i} (attempt ${attempt + 2}/${MAX_RETRIES})`);
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        }
    }

    // Start workers
    const workers: Promise<void>[] = [];
    for (let w = 0; w < workerCount; w++) {
        workers.push(worker());
    }
    await Promise.allSettled(workers);

    // Report the first error if any worker failed
    const firstError = errors[0];
    if (firstError) {
        throw new DownloadError(`Segment download failed: ${firstError.message}`, {
            cause: firstError,
        });
    }

    return results.filter((r): r is string => typeof r === 'string');
}
