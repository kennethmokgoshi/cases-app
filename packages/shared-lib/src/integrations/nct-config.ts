import { logger } from '../logger';

interface NCTCredentials {
    username: string;
    password: string;
    baseUrl: string;
}

let credentialsCache: NCTCredentials | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 60000;

export async function getNCTCredentials(): Promise<NCTCredentials> {
    const now = Date.now();

    if (credentialsCache && (now - lastFetchTime) < CACHE_TTL) {
        return credentialsCache;
    }

    try {
        const { prisma } = require('@zenowethu/database');
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'nct' },
            select: { key: true, value: true }
        });

        const settingsMap: Record<string, string> = {};
        for (const setting of settings) {
            settingsMap[setting.key] = setting.value;
        }

        credentialsCache = {
            username: settingsMap['nct_username'] || process.env.NCT_USERNAME || '',
            password: settingsMap['nct_password'] || process.env.NCT_PASSWORD || '',
            baseUrl: settingsMap['nct_url'] || 'https://www.thenct.org.za'
        };

        lastFetchTime = now;
        logger.info('[NCT Config] Credentials loaded:', {
            username: credentialsCache.username,
            source: settingsMap['nct_username'] ? 'database' : 'environment'
        });

        return credentialsCache;
    } catch (error) {
        logger.error('[NCT Config] Failed to fetch credentials from DB:', error);

        return {
            username: process.env.NCT_USERNAME || '',
            password: process.env.NCT_PASSWORD || '',
            baseUrl: 'https://www.thenct.org.za'
        };
    }
}

export function invalidateNCTCredentialsCache(): void {
    credentialsCache = null;
    lastFetchTime = 0;
    logger.info('[NCT Config] Credentials cache invalidated');
}
