/** Parsed and validated tweet URL. */
export interface TweetUrl {
    /** The numeric tweet status ID. */
    statusId: string;
    /** The username from the URL, if present. */
    username: string | null;
    /** The original raw URL. */
    raw: string;
}

/** CLI argument + option values after parsing. */
export interface DownloadOptions {
    tweetUrl: string;
    output?: string;
    quality: string;
    cookies?: string;
    cookiesFromBrowser?: string;
    verbose: boolean;
    showProgress: boolean;
}

/** A single video variant from the X API. */
export interface Variant {
    url: string;
    contentType: 'application/x-mpegURL' | 'video/mp4';
    bitrate?: number;
}

/** Parsed video information from a tweet. */
export interface VideoInfo {
    /** The selected m3u8 playlist URL (master playlist). */
    m3u8Url: string;
    /** All available video/mp4 direct URLs, for fallback. */
    mp4Variants: Variant[];
    /** Video duration in milliseconds. */
    durationMs: number;
    /** Video dimensions (width, height). */
    dimensions: { width: number; height: number } | null;
}

/** A stream variant from an HLS master playlist. */
export interface StreamVariant {
    /** Absolute URL to the media playlist. */
    url: string;
    /** Bandwidth in bits per second. */
    bandwidth: number;
    /** Resolution width. */
    width: number | null;
    /** Resolution height. */
    height: number | null;
    /** Codec string. */
    codecs: string | null;
    /** Audio group ID (references EXT-X-MEDIA:TYPE=AUDIO). */
    audioGroup: string | null;
    /** Resolved URL to the audio media playlist, if audio is separate. */
    audioUrl: string | null;
}

/** A single segment from an HLS media playlist. */
export interface Segment {
    /** Absolute URL to the segment file. */
    url: string;
    /** Duration in seconds. */
    duration: number;
    /** Zero-based sequence number. */
    sequence: number;
}

/** A parsed HLS media playlist. */
export interface MediaPlaylist {
    /** All segments in order. */
    segments: Segment[];
    /** Optional init segment URL (for fMP4 with EXT-X-MAP). */
    initSegment: string | null;
    /** Target duration from the playlist (seconds). */
    targetDuration: number;
    /** Whether the playlist has an EXT-X-ENDLIST tag (live vs VOD). */
    ended: boolean;
}

/** A parsed cookie. */
export interface Cookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: Date | null;
    httpOnly: boolean;
    secure: boolean;
}

/** Supported browsers for cookie extraction. */
export type BrowserName = 'chrome' | 'firefox' | 'edge';

/** Quality option values. */
export type Quality = 'best' | '1080p' | '720p' | '480p';
