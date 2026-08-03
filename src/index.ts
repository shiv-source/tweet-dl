/**
 * tweet-dl — Library API
 *
 * Usage:
 *   import { run, parseTweetUrl, extractVideo, HttpClient, CookieJar } from 'tweet-dl';
 */

// ── Pipeline ────────────────────────────────────────────
export { run } from './main.js';
export type { RunOptions } from './main.js';

// @deprecated Use RunOptions instead. Kept for backward compat.
export type { DownloadOptions } from './core/types.js';

// ── Extraction ──────────────────────────────────────────
export { parseTweetUrl } from './tweet/url.js';
export { extractVideo } from './tweet/extractor.js';
export { XClient } from './tweet/client.js';
export { extractVideoInfo } from './tweet/video-info.js';
export { fetchSyndication } from './tweet/syndication.js';
export { unwrapGraphQLResponse } from './tweet/graphql.js';

// ── HLS ─────────────────────────────────────────────────
export {
  parseMasterPlaylist,
  parseMediaPlaylist,
  resolveUri,
} from './hls/m3u8.js';
export { selectVariant, validateQuality } from './hls/selector.js';
export { downloadSegments } from './hls/downloader.js';
export type { DownloaderOptions } from './hls/downloader.js';

// ── Media ───────────────────────────────────────────────
export { mergeSegments, downloadDirect } from './media/merge.js';
export { findFfmpeg, runFfmpeg } from './media/ffmpeg.js';

// ── HTTP ────────────────────────────────────────────────
export { HttpClient } from './http/client.js';
export type { HttpClientOptions, RequestHeaders } from './http/client.js';
export { CookieJar } from './http/cookiejar.js';
export { downloadFile, createTempDir, removeDir } from './http/download.js';
export type { ProgressCallback } from './http/download.js';

// ── Cookies ─────────────────────────────────────────────
export { parseNetscapeCookies, loadCookiesFromFile } from './cookies/netscape.js';

// ── Utilities ───────────────────────────────────────────
export { resolveOutputPath } from './util/path.js';
export { asyncPool } from './util/pool.js';

// ── Errors ──────────────────────────────────────────────
export {
  TwdlError,
  UsageError,
  AuthRequiredError,
  NoVideoError,
  FfmpegMissingError,
  DownloadError,
  MergeError,
  NetworkError,
} from './core/errors.js';

// ── Logging ─────────────────────────────────────────────
export { createLogger } from './logger.js';
export type { Logger, LogLevel } from './logger.js';

// ── Types ───────────────────────────────────────────────
export type {
  TweetUrl,
  Variant,
  VideoInfo,
  StreamVariant,
  Segment,
  MediaPlaylist,
  Cookie,
  BrowserName,
  Quality,
} from './core/types.js';

// ── Constants ───────────────────────────────────────────
export {
  BEARER_TOKEN,
  QUERY_ID,
  VALID_QUALITIES,
  VALID_BROWSERS,
  DEFAULT_CONCURRENCY,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  GRAPHQL_FEATURES,
  USER_AGENT,
  API_BASE,
  SYNDICATION_BASE,
} from './core/config.js';
