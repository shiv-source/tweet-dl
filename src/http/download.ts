import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { HttpClient } from './client.js';
import { DownloadError } from '../core/errors.js';
import type { Logger } from '../logger.js';

/** Callback for download progress. */
export type ProgressCallback = (bytesDownloaded: number, totalBytes: number | null) => void;

/**
 * Download a file from `url` to `destPath`, streaming the response body.
 * Calls `onProgress` with cumulative bytes.
 */
export async function downloadFile(
    http: HttpClient,
    url: string,
    destPath: string,
    onProgress?: ProgressCallback,
    logger?: Logger,
): Promise<void> {
    const response = await http.get(url);

    if (!response.ok) {
        throw new DownloadError(`Failed to download ${url}: HTTP ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

    // Ensure parent directory exists
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });

    const destStream = fs.createWriteStream(destPath);
    let downloaded = 0;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
        reader = response.body?.getReader();
        if (!reader) {
            throw new DownloadError(`No response body for ${url}`);
        }

        for (;;) {
            const chunk: { done: boolean; value?: Uint8Array } = await reader.read();
            if (chunk.done) break;
            const value = chunk.value;
            if (!value) continue;

            // Write chunk to file — always register error handler first
            await new Promise<void>((resolve, reject) => {
                const onError = (err: Error) => {
                    destStream.destroy();
                    reject(err);
                };
                destStream.once('error', onError);
                const ok = destStream.write(value);
                if (ok) {
                    destStream.removeListener('error', onError);
                    resolve();
                } else {
                    destStream.once('drain', () => {
                        destStream.removeListener('error', onError);
                        resolve();
                    });
                }
            });

            downloaded += value.byteLength;
            onProgress?.(downloaded, totalBytes);
        }

        await new Promise<void>((resolve, reject) => {
            destStream.once('error', reject);
            destStream.end(() => {
                resolve();
            });
        });

        // Cancel the reader to release the connection
        await reader.cancel();
    } catch (err) {
        // Clean up partial file on error
        destStream.destroy();
        if (reader) {
            await reader.cancel().catch(() => {
                /* best effort */
            });
        }
        try {
            fs.unlinkSync(destPath);
        } catch {
            // Best effort
        }
        throw err;
    }

    logger?.debug(`Downloaded ${downloaded} bytes to ${destPath}`);
}

/** Create a temporary directory for downloads. */
export function createTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tweet-dl-'));
    return dir;
}

/** Remove a directory and all its contents. */
export function removeDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}
