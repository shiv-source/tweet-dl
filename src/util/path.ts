import * as path from 'node:path';
import { UsageError } from '../core/errors.js';

/** Characters to strip from filenames. */
// eslint-disable-next-line no-control-regex
const RESERVED_CHARS = /[\x00-\x1f<>:"|?*]/g;

/**
 * Build the output file path.
 * If the user specified one, sanitize and validate it.
 * Otherwise, generate a default: ./video-{YYYYMMDD-HHmmss}.mp4
 */
export function resolveOutputPath(userPath?: string): string {
    if (userPath) {
        // Separate directory from filename so we only sanitize the filename part
        const dir = path.dirname(userPath);
        let base = path.basename(userPath);

        // Sanitize: strip null bytes and reserved characters from filename only
        base = base.replace(RESERVED_CHARS, '').trim();

        if (!base) {
            throw new UsageError('Output path is empty after sanitization.');
        }

        // Ensure .mp4 extension
        if (!base.toLowerCase().endsWith('.mp4')) {
            base = base + '.mp4';
        }

        return path.resolve(dir, base);
    }

    // Generate default path
    const ts = timestamp();
    return path.resolve(`video-${ts}.mp4`);
}

/** Generate a human-readable timestamp: YYYYMMDD-HHmmss */
function timestamp(): string {
    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}-${h}${min}${s}`;
}
