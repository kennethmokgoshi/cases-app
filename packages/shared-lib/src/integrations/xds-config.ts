import { logger } from '../logger';

interface XDSCredentials {
    username: string;
    password: string;
    portalUrl: string;
}

let credentialsCache: XDSCredentials | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 60000;

export async function getXDSCredentials(): Promise<XDSCredentials> {
    const now = Date.now();

    if (credentialsCache && (now - lastFetchTime) < CACHE_TTL) {
        return credentialsCache;
    }

    try {
        const { prisma } = require('@zenowethu/database');
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'xds' },
            select: { key: true, value: true }
        });

        const settingsMap: Record<string, string> = {};
        for (const setting of settings) {
            settingsMap[setting.key] = setting.value;
        }

        credentialsCache = {
            username: settingsMap['xds_username'] || process.env.XDS_USERNAME || '',
            password: settingsMap['xds_password'] || process.env.XDS_PASSWORD || '',
            portalUrl: settingsMap['xds_portal_url'] || process.env.XDS_PORTAL_URL || 'https://portal.xds.co.za'
        };

        lastFetchTime = now;
        logger.info('[XDS Config] Credentials loaded:', {
            username: credentialsCache.username,
            portalUrl: credentialsCache.portalUrl,
            source: settingsMap['xds_username'] ? 'database' : 'environment'
        });

        return credentialsCache;
    } catch (error) {
        logger.error('[XDS Config] Failed to fetch credentials from DB:', error);

        return {
            username: process.env.XDS_USERNAME || '',
            password: process.env.XDS_PASSWORD || '',
            portalUrl: process.env.XDS_PORTAL_URL || 'https://portal.xds.co.za'
        };
    }
}

export function invalidateXDSCredentialsCache(): void {
    credentialsCache = null;
    lastFetchTime = 0;
    logger.info('[XDS Config] Credentials cache invalidated');
}
