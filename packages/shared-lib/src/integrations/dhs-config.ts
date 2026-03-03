import { prisma } from '@zenowethu/database';
import { logger } from '../logger';

interface DHSCredentials {
    username: string;
    password: string;
}

let credentialsCache: DHSCredentials | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 60000;

export async function getDHSCredentials(): Promise<DHSCredentials> {
    const now = Date.now();

    if (credentialsCache && (now - lastFetchTime) < CACHE_TTL) {
        return credentialsCache;
    }

    try {
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'dhs' },
            select: { key: true, value: true }
        });

        const settingsMap: Record<string, string> = {};
        for (const setting of settings) {
            settingsMap[setting.key] = setting.value;
        }

        credentialsCache = {
            username: settingsMap['dhs_username'] || process.env.DHS_USERNAME || 'NCRDC3693',
            password: settingsMap['dhs_password'] || process.env.DHS_PASSWORD || 'ZDMilitary@D2025' };

        lastFetchTime = now;
        logger.info('[DHS Config] Credentials loaded:', {
            username: credentialsCache.username,
            source: settingsMap['dhs_username'] ? 'database' : 'environment'
        });

        return credentialsCache;
    } catch (error) {
        logger.error('[DHS Config] Failed to fetch credentials from DB:', error);

        return {
            username: process.env.DHS_USERNAME || 'NCRDC3693',
            password: process.env.DHS_PASSWORD || 'ZDMilitary@D2025' };
    }
}

export function invalidateDHSCredentialsCache(): void {
    credentialsCache = null;
    lastFetchTime = 0;
    logger.info('[DHS Config] Credentials cache invalidated');
}
