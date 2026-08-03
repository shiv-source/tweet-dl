import cliProgress from 'cli-progress';

/**
 * Create a CLI progress bar for download progress.
 * Returns a function to call with current byte count.
 */
export function createProgressBar(
    totalBytes: number | null,
    label: string,
): { update: (bytes: number) => void; stop: () => void } {
    const bar = new cliProgress.SingleBar(
        {
            format: `${label} [{bar}] {percentage}% | {value}/{total} | ETA: {eta_formatted}`,
            clearOnComplete: true,
            hideCursor: true,
            fps: 10,
            etaBuffer: 20,
        },
        cliProgress.Presets.shades_classic,
    );

    bar.start(totalBytes ?? 0, 0, { speed: 'N/A' });

    const startTime = Date.now();

    return {
        update(bytes: number) {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? formatBytes(bytes / elapsed) : 'N/A';
            bar.update(bytes, { speed });
        },
        stop() {
            bar.stop();
        },
    };
}
function formatBytes(bytesPerSec: number): string {
    if (bytesPerSec >= 1_000_000) return `${(bytesPerSec / 1_000_000).toFixed(1)} MB`;
    if (bytesPerSec >= 1_000) return `${(bytesPerSec / 1_000).toFixed(0)} KB`;
    return `${Math.round(bytesPerSec)} B`;
}
