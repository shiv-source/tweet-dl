import * as path from 'node:path';
import { parseTweetUrl } from './tweet/url.js';
import { XClient } from './tweet/client.js';
import { extractVideo } from './tweet/extractor.js';
import { parseMasterPlaylist, parseMediaPlaylist } from './hls/m3u8.js';
import { selectVariant, validateQuality } from './hls/selector.js';
import { downloadSegments } from './hls/downloader.js';
import { mergeSegments, downloadDirect } from './media/merge.js';
import { createTempDir, removeDir } from './http/download.js';
import { HttpClient } from './http/client.js';
import { CookieJar } from './http/cookiejar.js';
import { loadCookiesFromFile } from './cookies/netscape.js';
import { resolveOutputPath } from './util/path.js';
import { createLogger } from './logger.js';
import { DownloadError, UsageError } from './core/errors.js';
import { DEFAULT_CONCURRENCY } from './core/config.js';
import type { VideoInfo, Cookie, Quality } from './core/types.js';
import type { Logger } from './logger.js';

/** Library-friendly options for the download pipeline. */
export interface RunOptions {
  /** Tweet URL to download from. */
  tweetUrl: string;
  /** Output file path. Defaults to ./video-{timestamp}.mp4. */
  output?: string;
  /** Video quality. Defaults to 'best'. */
  quality?: Quality;
  /** Path to cookies.txt (Netscape format). */
  cookies?: string;
  /** Browser to extract cookies from (stub — not yet implemented). */
  cookiesFromBrowser?: string;
  /** Pre-parsed cookies for programmatic use. */
  cookieArray?: Cookie[];
  /** Progress callback: (completed, total). Called per segment. */
  onProgress?: (downloadedSegments: number, total: number) => void;
  /** AbortSignal to cancel downloads. */
  signal?: AbortSignal;
  /** Logger instance. Defaults to silent. */
  logger?: Logger;
}

/**
 * Main entry point — library-friendly.
 *
 * No CLI coupling (no process.exit, no SIGINT handlers, no cli-progress).
 * CLI-specific glue lives in cli.ts.
 *
 * @example
 * ```ts
 * import { run } from 'tweet-dl';
 * await run({ tweetUrl: 'https://x.com/user/status/12345', quality: '720p' });
 * ```
 */
export async function run(options: RunOptions): Promise<void> {
  const logger = options.logger ?? createLogger(false);

  // Validate quality if provided
  const quality = options.quality ?? 'best';
  validateQuality(quality);

  // Parse URL
  const parsed = parseTweetUrl(options.tweetUrl);
  logger.info(`Tweet ID: ${parsed.statusId}`);

  // Load cookies — programmatic cookies OR file OR browser
  const cookieJar = new CookieJar();

  if (options.cookieArray && options.cookieArray.length > 0) {
    cookieJar.addAll(options.cookieArray);
  } else if (options.cookies && options.cookiesFromBrowser) {
    throw new UsageError('Use either --cookies or --cookies-from-browser, not both.');
  } else if (options.cookies) {
    logger.info(`Loading cookies from: ${options.cookies}`);
    loadCookiesFromFile(options.cookies, cookieJar);
  } else if (options.cookiesFromBrowser) {
    await loadCookiesFromBrowser(options.cookiesFromBrowser, cookieJar, logger);
  }

  // Create HTTP client
  const http = new HttpClient({ cookieJar, logger });

  // Extract video info via X API
  const xClient = new XClient(http, cookieJar, logger);
  const videoInfo = await extractVideo(parsed.statusId, xClient, http, logger);

  // Resolve output path
  const outputPath = resolveOutputPath(options.output);
  logger.info(`Output: ${outputPath}`);

  // Direct MP4 (no HLS)
  if (isDirectMp4(videoInfo)) {
    logger.info('Downloading direct MP4 (no HLS available)...');
    await downloadDirect(videoInfo.m3u8Url, outputPath, http, logger);
    logger.info(`Done! Saved to ${outputPath}`);
    return;
  }

  // HLS flow
  logger.info('Fetching HLS master playlist...');
  const masterResponse = await http.get(videoInfo.m3u8Url);
  if (!masterResponse.ok) {
    throw new DownloadError(`Failed to fetch master playlist: HTTP ${masterResponse.status}`);
  }
  const masterText = await masterResponse.text();
  const variants = parseMasterPlaylist(masterText, videoInfo.m3u8Url);

  if (variants.length === 0) {
    logger.info('No variants found — treating as direct media playlist.');
    await downloadAndMerge(
      http,
      { url: videoInfo.m3u8Url, audioUrl: null },
      outputPath,
      options.signal,
      options.onProgress,
      logger,
    );
    return;
  }

  const selected = selectVariant(variants, quality, logger);

  if (selected.audioUrl) {
    logger.info('Separate audio track detected — will download and merge.');
  } else {
    logger.info('Audio is muxed with video stream.');
  }

  await downloadAndMerge(http, selected, outputPath, options.signal, options.onProgress, logger);
}

/**
 * Download HLS segments from video + optional audio playlists, merge into MP4.
 * Library-friendly: no signal handlers, uses AbortSignal + callback.
 */
async function downloadAndMerge(
  http: HttpClient,
  variant: { url: string; audioUrl: string | null },
  outputPath: string,
  signal: AbortSignal | undefined,
  onProgress: ((downloadedSegments: number, total: number) => void) | undefined,
  logger: Logger,
): Promise<void> {
  const tempDir = createTempDir();

  try {
    signal?.throwIfAborted();

    // Parse video playlist
    const response = await http.get(variant.url);
    if (!response.ok) {
      throw new DownloadError(`Failed to fetch media playlist: HTTP ${response.status}`);
    }
    const playlistText = await response.text();
    const playlist = parseMediaPlaylist(playlistText, variant.url);
    const totalSegments =
      playlist.segments.length + (variant.audioUrl ? playlist.segments.length : 0);
    logger.info(
      `Found ${playlist.segments.length} video segments` +
        (variant.audioUrl ? ` + audio` : '') +
        ` (target: ${playlist.targetDuration}s each)`,
    );

    // Download video segments
    const videoDir = path.join(tempDir, 'video');
    signal?.throwIfAborted();
    const videoResult = await downloadSegments(http, variant.url, videoDir, {
      concurrency: DEFAULT_CONCURRENCY,
      signal,
      onProgress: (completed, _total) => {
        onProgress?.(completed, totalSegments);
      },
    }, logger);

    // Download audio segments
    let audioSegmentPaths: string[] = [];
    let audioInitPath: string | null = null;

    if (variant.audioUrl) {
      signal?.throwIfAborted();
      logger.info('Downloading audio track...');
      const audioDir = path.join(tempDir, 'audio');
      const audioResult = await downloadSegments(http, variant.audioUrl, audioDir, {
        concurrency: DEFAULT_CONCURRENCY,
        signal,
        onProgress: (completed, _total) => {
          onProgress?.(videoResult.segmentPaths.length + completed, totalSegments);
        },
      }, logger);
      audioSegmentPaths = audioResult.segmentPaths;
      audioInitPath = audioResult.initSegmentPath;
    }

    signal?.throwIfAborted();
    logger.info(
      `Downloaded ${videoResult.segmentPaths.length} video` +
        (audioSegmentPaths.length ? ` + ${audioSegmentPaths.length} audio` : '') +
        ` segments.`,
    );

    // Merge
    logger.info('Merging with ffmpeg...');
    await mergeSegments(
      videoResult.segmentPaths,
      videoResult.initSegmentPath,
      audioSegmentPaths,
      audioInitPath,
      outputPath,
      logger,
    );

    logger.info(`Done! Saved to ${outputPath}`);
  } finally {
    removeDir(tempDir);
  }
}

/** Check if the VideoInfo represents a direct MP4 (not HLS). */
function isDirectMp4(videoInfo: VideoInfo): boolean {
  return !videoInfo.m3u8Url.includes('.m3u8') && videoInfo.m3u8Url.includes('video.twimg.com');
}

/** Load cookies from a browser profile. (Phase 3 — currently stubbed.) */
function loadCookiesFromBrowser(_browser: string, _jar: CookieJar, _logger: Logger): Promise<void> {
  return Promise.reject(
    new UsageError(
      'Browser cookie extraction is not yet implemented. Use -c cookies.txt instead.\n' +
        'Export cookies from your browser using a browser extension like "cookies.txt".',
    ),
  );
}
