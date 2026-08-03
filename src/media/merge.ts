import * as fs from 'node:fs';
import * as path from 'node:path';
import { findFfmpeg, runFfmpeg } from './ffmpeg.js';
import { MergeError } from '../core/errors.js';
import type { Logger } from '../logger.js';

/**
 * Merge downloaded HLS video and optional audio segments into a single MP4 file.
 *
 * @param videoPaths - Absolute paths to video segment files, in order
 * @param videoInit - Optional init segment path for video (fMP4 with EXT-X-MAP)
 * @param audioPaths - Absolute paths to audio segment files (empty if audio is muxed)
 * @param audioInit - Optional init segment path for audio
 * @param outputPath - Destination MP4 file path
 * @param logger - Logger instance
 */
export async function mergeSegments(
    videoPaths: string[],
    videoInit: string | null,
    audioPaths: string[],
    audioInit: string | null,
    outputPath: string,
    logger?: Logger,
): Promise<void> {
    if (videoPaths.length === 0) {
        throw new MergeError('No video segments to merge.');
    }

    const ffmpegPath = await findFfmpeg(logger);
    const hasAudio = audioPaths.length > 0;
    logger?.info(
        `Merging ${videoPaths.length} video` +
            (hasAudio ? ` + ${audioPaths.length} audio` : '') +
            ` segments into ${outputPath}...`,
    );

    // Ensure output directory exists
    const outDir = path.dirname(outputPath);
    if (outDir) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    if (hasAudio) {
        await mergeWithAudio(ffmpegPath, videoPaths, videoInit, audioPaths, audioInit, outputPath, logger);
    } else if (videoInit) {
        // fMP4 video-only: use concat protocol
        await mergeFmp4(ffmpegPath, videoInit, videoPaths, outputPath, logger);
    } else {
        // TS video-only: use concat demuxer
        await mergeTs(ffmpegPath, videoPaths, outputPath, logger);
    }

    logger?.info(`Video saved: ${outputPath}`);
}

/** Merge video + audio using dual-input ffmpeg. */
async function mergeWithAudio(
    ffmpegPath: string,
    videoPaths: string[],
    videoInit: string | null,
    audioPaths: string[],
    audioInit: string | null,
    outputPath: string,
    logger?: Logger,
): Promise<void> {
    const videoInput = buildConcatInput(videoInit, videoPaths);
    const audioInput = buildConcatInput(audioInit, audioPaths);

    const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        videoInput,
        '-i',
        audioInput,
        '-c',
        'copy',
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
    ];

    await runFfmpeg(ffmpegPath, args, logger);
}

/** Build a concat protocol input string for a set of segments + optional init. */
function buildConcatInput(initPath: string | null, segments: string[]): string {
    const parts = initPath ? [initPath, ...segments] : segments;
    return `concat:${parts.map((p) => p.replace(/'/g, "'\\''")).join('|')}`;
}

/** Merge fMP4 segments (video-only) using concat protocol. */
async function mergeFmp4(
    ffmpegPath: string,
    initPath: string,
    segments: string[],
    outputPath: string,
    logger?: Logger,
): Promise<void> {
    const concatInput = buildConcatInput(initPath, segments);

    const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        concatInput,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
    ];

    await runFfmpeg(ffmpegPath, args, logger);
}

/** Merge TS segments (video-only) using concat demuxer with stream copy. */
async function mergeTs(ffmpegPath: string, segments: string[], outputPath: string, logger?: Logger): Promise<void> {
    const first = segments[0];
    if (!first) throw new MergeError('Segment list is empty.');
    const listDir = path.dirname(first);
    const listPath = path.join(listDir, 'concat-list.txt');

    const entries = segments.map((p) => `file '${p}'`);
    fs.writeFileSync(listPath, entries.join('\n'), 'utf-8');

    const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
    ];

    try {
        await runFfmpeg(ffmpegPath, args, logger);
    } finally {
        try {
            fs.unlinkSync(listPath);
        } catch {
            /* best effort */
        }
    }
}

/**
 * Download a single direct MP4 file (no HLS segments).
 * Used as fallback when the tweet has no m3u8 variant.
 * Streams to disk instead of buffering in memory.
 */
export async function downloadDirect(
    url: string,
    outputPath: string,
    http: { get: (url: string) => Promise<Response> },
    logger?: Logger,
): Promise<void> {
    logger?.info(`Downloading direct MP4 from: ${url}`);
    const response = await http.get(url);
    if (!response.ok) {
        throw new MergeError(`Failed to download direct MP4: HTTP ${response.status}`);
    }

    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    const destStream = fs.createWriteStream(outputPath);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
        reader = response.body?.getReader();
        if (!reader) {
            throw new MergeError(`No response body for ${url}`);
        }
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            await new Promise<void>((resolve, reject) => {
                const onError = (err: Error) => {
                    destStream.destroy();
                    reject(err);
                };
                destStream.once('error', onError);
                if (destStream.write(chunk.value)) {
                    destStream.removeListener('error', onError);
                    resolve();
                } else {
                    destStream.once('drain', () => {
                        destStream.removeListener('error', onError);
                        resolve();
                    });
                }
            });
        }
        await new Promise<void>((resolve, reject) => {
            destStream.once('error', reject);
            destStream.end(() => {
                resolve();
            });
        });
        await reader.cancel();
    } catch (_err) {
        destStream.destroy();
        if (reader) {
            await reader.cancel().catch(() => {
                /* best effort */
            });
        }
        try {
            fs.unlinkSync(outputPath);
        } catch {
            /* best effort */
        }
        throw _err;
    }

    logger?.info(`Video saved: ${outputPath}`);
}
