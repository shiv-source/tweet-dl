/**
 * Simple leveled logger.
 * - verbose=true  → debug level (everything)
 * - verbose=false → info level (default)
 *
 * Output goes to stderr so stdout remains clean for piping (e.g., --output -)
 * though we don't currently support stdout output for the video.
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
};

export interface Logger {
    error(msg: string): void;
    warn(msg: string): void;
    info(msg: string): void;
    debug(msg: string): void;
    /** Create a child logger with a context prefix. */
    child(context: string): Logger;
}

function format(level: string, msg: string): string {
    const ts = new Date().toISOString();
    return `[${ts}] ${level}: ${msg}`;
}

class ConsoleLogger implements Logger {
    private readonly context: string;

    constructor(
        private readonly level: LogLevel,
        context = '',
    ) {
        this.context = context;
    }

    error(msg: string): void {
        if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.error) {
            process.stderr.write(format('ERROR', this.prefix(msg)) + '\n');
        }
    }

    warn(msg: string): void {
        if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.warn) {
            process.stderr.write(format('WARN', this.prefix(msg)) + '\n');
        }
    }

    info(msg: string): void {
        if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.info) {
            process.stderr.write(format('INFO', this.prefix(msg)) + '\n');
        }
    }

    debug(msg: string): void {
        if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.debug) {
            process.stderr.write(format('DEBUG', this.prefix(msg)) + '\n');
        }
    }

    child(context: string): Logger {
        const newCtx = this.context ? `${this.context}:${context}` : context;
        return new ConsoleLogger(this.level, newCtx);
    }

    private prefix(msg: string): string {
        return this.context ? `[${this.context}] ${msg}` : msg;
    }
}

/**
 * Create a logger. Pass verbose=true for debug-level output.
 * All output goes to stderr.
 */
export function createLogger(verbose: boolean): Logger {
    return new ConsoleLogger(verbose ? 'debug' : 'info');
}
