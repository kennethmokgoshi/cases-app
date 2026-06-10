import { prisma } from '@zenowethu/database';
import { logger } from '../logger';

export interface SMTPCredentials {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
}

let credentialsCache: SMTPCredentials | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 60000;

function fromEnv(): SMTPCredentials {
    return {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        username: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
        fromEmail: process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '',
    };
}

export async function getSMTPCredentials(): Promise<SMTPCredentials> {
    const now = Date.now();

    if (credentialsCache && (now - lastFetchTime) < CACHE_TTL) {
        return credentialsCache;
    }

    try {
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'smtp' },
            select: { key: true, value: true }
        });

        const settingsMap: Record<string, string> = {};
        for (const setting of settings) {
            settingsMap[setting.key] = setting.value;
        }

        const env = fromEnv();
        credentialsCache = {
            host: settingsMap['smtp_host'] || env.host,
            port: settingsMap['smtp_port'] ? parseInt(settingsMap['smtp_port']) : env.port,
            secure: settingsMap['smtp_secure'] ? settingsMap['smtp_secure'] === 'true' : env.secure,
            username: settingsMap['smtp_user'] || env.username,
            password: settingsMap['smtp_password'] || env.password,
            fromEmail: settingsMap['smtp_from'] || env.fromEmail,
        };

        lastFetchTime = now;
        logger.info('[SMTP Config] Credentials loaded:', {
            host: credentialsCache.host,
            username: credentialsCache.username,
            source: settingsMap['smtp_user'] ? 'database' : 'environment'
        });

        return credentialsCache;
    } catch (error) {
        logger.error('[SMTP Config] Failed to fetch credentials from DB:', error);
        return fromEnv();
    }
}

export function invalidateSMTPCredentialsCache(): void {
    credentialsCache = null;
    lastFetchTime = 0;
    logger.info('[SMTP Config] Credentials cache invalidated');
}
