/**
 * Structured logger for Zenowethu Cases System
 *
 * Usage (server-side only — API routes, server components):
 *
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
 *
 * Environment:
 *   - Development : pretty-printed coloured output to stdout
 *   - Production  : single-line JSON to stdout (for log aggregators)
 *
 * Override log level at runtime:
 *   LOG_LEVEL=debug  (default: debug in dev, info in prod)
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const isCI = process.env.CI === 'true';

// Permissive log-function type that covers both calling conventions:
//   logger.info('message')
//   logger.info('message', extraArg)
//   logger.info({ key: value }, 'message')
// Pino v10 introduces overloads with `msg?: never` that break the second form.
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

export const logger = pino({
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

    // Development: human-readable coloured output (but not in CI to avoid worker thread issues)
    ...(isDev && !isCI && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname,env',
                messageFormat: '{module} › {msg}',
                levelFirst: false } } }),

    // Production or CI: structured JSON with ISO timestamp (synchronous, no worker threads)
    ...((! isDev || isCI) && {
        formatters: {
            level: (label: string) => ({ level: label }) },
        timestamp: pino.stdTimeFunctions.isoTime }),

    // Automatic error serialisation: pass `err` or `error` as a field
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err },

    // Fields present on every log line
    base: {
        env: process.env.NODE_ENV,
        ...(process.env.APP_NAME ? { app: process.env.APP_NAME } : {}) } }) as unknown as AppLoggerType;

/**
 * Create a child logger pre-tagged with a module name.
 * The `module` field appears on every log line from that logger.
 *
 * @param module  e.g. 'api/cases/route', 'shared-lib/auth', 'notifications'
 */
export const createLogger = (module: string): AppLoggerType => logger.child({ module });

export type AppLogger = AppLoggerType;
