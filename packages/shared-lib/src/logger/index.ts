/**
 * Structured logger for Zenowethu Cases System
 *
 * Uses console-based logging that works in both server and client contexts.
 * Compatible with Next.js Turbopack bundler (no native Node.js dependencies).
 *
 * For server-only pino logging, import from '@zenowethu/shared-lib/src/logger/pino'
 *
 * Usage:
 *   import { createLogger } from '@zenowethu/shared-lib';
 *   const log = createLogger('api/cases/route');
 *
 *   log.info('Case fetched');
 *   log.info({ caseId, userId }, 'Case fetched');
 *   log.warn({ caseId }, 'SLA deadline approaching');
 *   log.error({ err: error }, 'Failed to create case');
 *
 * Log levels (lowest → highest severity):
 *   trace | debug | info | warn | error | fatal
 */

// Permissive log-function type that covers both calling conventions:
//   logger.info('message')
//   logger.info('message', extraArg)
//   logger.info({ key: value }, 'message')
interface AppLogFn {
    (msg: string, ...args: any[]): void;
    (obj: object, msg?: string, ...args: any[]): void;
}

export interface AppLoggerType {
    trace: AppLogFn;
    debug: AppLogFn;
    info: AppLogFn;
    warn: AppLogFn;
    error: AppLogFn;
    fatal: AppLogFn;
    child: (bindings: object) => AppLoggerType;
}

/**
 * Console-based logger that works in both server and client contexts.
 * Outputs structured JSON in production, readable prefixed logs in development.
 */
function createConsoleLogger(prefix?: string): AppLoggerType {
    const isProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

    const fmt = (method: (...args: any[]) => void, level: string) =>
        (...args: any[]) => {
            if (isProd) {
                // Structured JSON output for log aggregators
                const ts = new Date().toISOString();
                const first = args[0];
                if (typeof first === 'object' && first !== null && !(first instanceof Error)) {
                    const msg = args[1] || '';
                    method(JSON.stringify({ level, time: ts, ...(prefix ? { module: prefix } : {}), ...first, msg }));
                } else {
                    method(JSON.stringify({ level, time: ts, ...(prefix ? { module: prefix } : {}), msg: args.join(' ') }));
                }
            } else {
                if (prefix) method(`[${prefix}]`, ...args);
                else method(...args);
            }
        };

    return {
        trace: fmt(console.debug, 'trace') as AppLogFn,
        debug: fmt(console.debug, 'debug') as AppLogFn,
        info: fmt(console.info, 'info') as AppLogFn,
        warn: fmt(console.warn, 'warn') as AppLogFn,
        error: fmt(console.error, 'error') as AppLogFn,
        fatal: fmt(console.error, 'fatal') as AppLogFn,
        child: (bindings: object) =>
            createConsoleLogger(prefix ? `${prefix}:${Object.values(bindings).join(':')}` : Object.values(bindings).join(':')),
    };
}

export const logger: AppLoggerType = createConsoleLogger();

/**
 * Create a child logger pre-tagged with a module name.
 * The `module` field appears on every log line from that logger.
 *
 * @param module  e.g. 'api/cases/route', 'shared-lib/auth', 'notifications'
 */
export const createLogger = (module: string): AppLoggerType => logger.child({ module });

export type AppLogger = AppLoggerType;
