import { FfmpegMissingError, MergeError } from '../core/errors.js';
import type { Logger } from '../logger.js';
import { spawn } from 'node:child_process';

/**
 * Locate the ffmpeg binary on the system.
 *
 * Try order:
 * 1. System ffmpeg (via `which`/`where`)
 * 2. Optional ffmpeg-static package
 */
export async function findFfmpeg(logger?: Logger): Promise<string> {
    // Try system ffmpeg
    try {
        const path = await which('ffmpeg');
        if (path) {
            logger?.debug(`Found system ffmpeg: ${path}`);
            return path;
        }
    } catch {
        // Fall through to static
    }

    // Try ffmpeg-static (optional dependency)
    try {
        const ffmpegStatic = await import('ffmpeg-static');

        const mod = ffmpegStatic as unknown as { default: unknown; path?: string };
        const staticPath: string | undefined = typeof mod.default === 'string' ? mod.default : mod.path;
        if (staticPath) {
            logger?.debug(`Using bundled ffmpeg: ${staticPath}`);
            return staticPath;
        }
    } catch {
        logger?.debug('ffmpeg-static not available.');
    }

    throw new FfmpegMissingError(
        'FFmpeg is required but was not found.\n' +
            'Install ffmpeg on your system:\n' +
            '  macOS:  brew install ffmpeg\n' +
            '  Ubuntu: sudo apt install ffmpeg\n' +
            'Or install the optional dependency: npm install ffmpeg-static',
    );
}

/** Spawn ffmpeg with the given arguments and return when complete. */
export function runFfmpeg(ffmpegPath: string, args: string[], logger?: Logger): Promise<void> {
    return new Promise((resolve, reject) => {
        logger?.debug(`Running: ${ffmpegPath} ${args.join(' ')}`);

        const proc = spawn(ffmpegPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 300_000, // 5-minute timeout — kill hung ffmpeg
        });

        let stderr = '';

        proc.stdout.on('data', (chunk: Buffer) => {
            logger?.debug(`ffmpeg: ${chunk.toString().trim()}`);
        });

        proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        proc.on('error', (err: Error) => {
            reject(new FfmpegMissingError(`Failed to start ffmpeg: ${err.message}`));
        });

        proc.on('close', (code: number | null) => {
            if (code === 0) {
                resolve();
            } else {
                const exitInfo = code === null ? 'killed by signal (timeout?)' : `code ${code}`;
                reject(new MergeError(`FFmpeg exited with ${exitInfo}:\n${stderr.slice(-500)}`));
            }
        });
    });
}

/** Find executable path using `which` (or `where` on Windows). */
function which(cmd: string): Promise<string | null> {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    return new Promise((resolve) => {
        const proc = spawn(whichCmd, [cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        proc.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
        });
        proc.on('close', (code: number | null) => {
            if (code === 0 && output.trim()) {
                resolve(output.trim().split('\n')[0] ?? null);
            } else {
                resolve(null);
            }
        });
        proc.on('error', () => {
            resolve(null);
        });
    });
}
