import { logger } from '../logger';

interface GHLCredentials {
    apiKey: string;
    locationId: string;
    email?: string;
    password?: string;
}

let credentialsCache: GHLCredentials | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL = 60000;

export async function getGHLCredentials(): Promise<GHLCredentials> {
    const now = Date.now();

    if (credentialsCache && (now - lastFetchTime) < CACHE_TTL) {
        return credentialsCache;
    }

    try {
        const { prisma } = require('@zenowethu/database');
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'ghl' },
            select: { key: true, value: true }
        });

        const settingsMap: Record<string, string> = {};
        for (const setting of settings) {
            settingsMap[setting.key] = setting.value;
        }

        credentialsCache = {
            apiKey: settingsMap['ghl_api_key'] || process.env.GHL_API_KEY || '',
            locationId: settingsMap['ghl_location_id'] || process.env.GHL_LOCATION_ID || '',
            email: settingsMap['ghl_email'] || process.env.GHL_EMAIL || '',
            password: settingsMap['ghl_password'] || process.env.GHL_PASSWORD || '' };

        lastFetchTime = now;
        logger.info('[GHL Config] Credentials loaded');

        return credentialsCache;
    } catch (error) {
        logger.error('[GHL Config] Failed to fetch credentials from DB:', error);

        return {
            apiKey: process.env.GHL_API_KEY || '',
            locationId: process.env.GHL_LOCATION_ID || '',
            email: process.env.GHL_EMAIL || '',
            password: process.env.GHL_PASSWORD || '' };
    }
}

export function invalidateGHLCredentialsCache(): void {
    credentialsCache = null;
    lastFetchTime = 0;
    logger.info('[GHL Config] Credentials cache invalidated');
}
