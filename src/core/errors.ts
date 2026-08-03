/**
 * Typed error hierarchy for tweet-dl.
 * Every non-success exit is a TwdlError subclass with a distinct exit code.
 */

export abstract class TwdlError extends Error {
    abstract readonly exitCode: number;

    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = this.constructor.name;
    }
}

/** Bad input: unparseable URL, invalid quality, invalid browser name. */
export class UsageError extends TwdlError {
    readonly exitCode = 2;
}

/** Authentication required: protected/NSFW tweet, 403. */
export class AuthRequiredError extends TwdlError {
    readonly exitCode = 3;
}

/** No video found in the tweet. */
export class NoVideoError extends TwdlError {
    readonly exitCode = 4;
}

/** FFmpeg not found on system and no fallback available. */
export class FfmpegMissingError extends TwdlError {
    readonly exitCode = 5;
}

/** Unrecoverable download failure after retries. */
export class DownloadError extends TwdlError {
    readonly exitCode = 1;
}

/** FFmpeg merge step failed. */
export class MergeError extends TwdlError {
    readonly exitCode = 1;
}

/** Network-level failure after retries. */
export class NetworkError extends TwdlError {
    readonly exitCode = 1;
}
