import { Command } from 'commander';
import { run } from './main.js';
import { createProgressBar } from './media/progress.js';
import { createLogger } from './logger.js';
import { TwdlError } from './core/errors.js';
import { VALID_QUALITIES, VALID_BROWSERS } from './core/config.js';
import type { Quality } from './core/types.js';

const program = new Command();

program
  .name('tweet-dl')
  .description('Download videos from Twitter/X posts')
  .version('0.1.0')
  .argument('<tweet-url>', 'URL of the Twitter/X post containing a video')
  .option('-o, --output <path>', 'Output file path (default: ./video-{timestamp}.mp4)')
  .option('-q, --quality <quality>', `Video quality: ${VALID_QUALITIES.join('|')}`, 'best')
  .option('-c, --cookies <path>', 'Path to cookies.txt file (Netscape format)')
  .option(
    '--cookies-from-browser <browser>',
    `Extract cookies from browser: ${VALID_BROWSERS.join('|')}`,
  )
  .option('--verbose', 'Enable verbose logging', false)
  .option('--no-progress', 'Disable progress bar', false)
  .addHelpText(
    'after',
    `
Examples:
  $ tweet-dl https://x.com/user/status/12345
  $ tweet-dl https://x.com/user/status/12345 -q 720p -o my-video.mp4
  $ tweet-dl https://x.com/user/status/12345 -c cookies.txt --verbose

Export cookies from your browser using an extension like "cookies.txt"
(available for Chrome, Firefox, and Edge).`,
  )
  .action(async (tweetUrl: string, options: Record<string, unknown>) => {
    // CLI owns logger creation
    const logger = createLogger(Boolean(options.verbose));

    // CLI owns signal handling — cancels download on Ctrl+C
    const controller = new AbortController();
    let cleaning = false;
    const onSignal = () => {
      if (!cleaning) {
        cleaning = true;
        logger.info('\nInterrupted. Cleaning up...');
        controller.abort();
      }
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    // CLI owns progress bar — created lazily on first progress event
    const showProgress = options.progress !== false;
    const progressBarRef = {
      current: null as { update: (bytes: number) => void; stop: () => void } | null,
    };

    const onProgress = showProgress
      ? (completed: number, total: number) => {
          progressBarRef.current ??= createProgressBar(total, 'Segments');
          progressBarRef.current.update(completed);
        }
      : undefined;

    try {
      await run({
        tweetUrl,
        output: typeof options.output === 'string' ? options.output : undefined,
        quality: (typeof options.quality === 'string' ? options.quality : 'best') as Quality,
        cookies: typeof options.cookies === 'string' ? options.cookies : undefined,
        cookiesFromBrowser:
          typeof options.cookiesFromBrowser === 'string'
            ? options.cookiesFromBrowser
            : undefined,
        signal: controller.signal,
        onProgress,
        logger,
      });
      progressBarRef.current?.stop();
    } catch (err) {
      progressBarRef.current?.stop();
      if (err instanceof TwdlError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exit(err.exitCode);
      }
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    }
  });

// Early validation for quality flag
program.on('option:quality', (value: string) => {
  if (!VALID_QUALITIES.includes(value as (typeof VALID_QUALITIES)[number])) {
    process.stderr.write(
      `Error: Invalid quality "${value}". Must be one of: ${VALID_QUALITIES.join(', ')}\n`,
    );
    process.exit(2);
  }
});

program.parse();
