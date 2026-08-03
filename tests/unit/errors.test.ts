import { describe, it, expect } from 'vitest';
import {
    TwdlError,
    UsageError,
    AuthRequiredError,
    NoVideoError,
    FfmpegMissingError,
    DownloadError,
    MergeError,
    NetworkError,
} from '../../src/core/errors';

describe('error hierarchy', () => {
    it('UsageError exits 2', () => {
        const err = new UsageError('bad input');
        expect(err).toBeInstanceOf(TwdlError);
        expect(err.exitCode).toBe(2);
        expect(err.message).toBe('bad input');
    });

    it('AuthRequiredError exits 3', () => {
        const err = new AuthRequiredError('need auth');
        expect(err.exitCode).toBe(3);
    });

    it('NoVideoError exits 4', () => {
        const err = new NoVideoError('no video');
        expect(err.exitCode).toBe(4);
    });

    it('FfmpegMissingError exits 5', () => {
        const err = new FfmpegMissingError('no ffmpeg');
        expect(err.exitCode).toBe(5);
    });

    it('DownloadError exits 1', () => {
        const err = new DownloadError('download fail');
        expect(err.exitCode).toBe(1);
    });

    it('MergeError exits 1', () => {
        const err = new MergeError('merge fail');
        expect(err.exitCode).toBe(1);
    });

    it('NetworkError exits 1', () => {
        const err = new NetworkError('network fail');
        expect(err.exitCode).toBe(1);
    });

    it('each error has the correct name', () => {
        expect(new UsageError('').name).toBe('UsageError');
        expect(new AuthRequiredError('').name).toBe('AuthRequiredError');
        expect(new NoVideoError('').name).toBe('NoVideoError');
        expect(new FfmpegMissingError('').name).toBe('FfmpegMissingError');
        expect(new DownloadError('').name).toBe('DownloadError');
        expect(new MergeError('').name).toBe('MergeError');
        expect(new NetworkError('').name).toBe('NetworkError');
    });
});
