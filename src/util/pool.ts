/**
 * Simple async concurrency pool.
 *
 * Runs async tasks with a concurrency cap.
 * Equivalent to a minimal p-limit — avoids an extra dependency.
 */
export async function asyncPool<T>(
    concurrency: number,
    items: T[],
    fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
    if (concurrency < 1 || !Number.isFinite(concurrency)) {
        throw new Error(`Invalid concurrency: ${concurrency}. Must be >= 1.`);
    }
    let index = 0;

    async function worker(): Promise<void> {
        while (index < items.length) {
            const i = index++;
            if (i >= items.length) break;
            const item = items[i];
            if (item === undefined) break;
            await fn(item, i);
        }
    }

    const workers: Promise<void>[] = [];
    const count = Math.min(concurrency, items.length);
    for (let w = 0; w < count; w++) {
        workers.push(worker());
    }
    await Promise.all(workers);
}
