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

    // Environment variables act as a local-dev / fallback source.
    let username = process.env.DHS_USERNAME || '';
    let password = process.env.DHS_PASSWORD || '';
    let source: 'database' | 'environment' = 'environment';

    // Prefer credentials stored in the database (Admin → Settings → DHS).
    try {
        const settings = await prisma.systemSettings.findMany({
            where: { category: 'dhs' },
            select: { key: true, value: true }
        });

        const settingsMap: Record<string, string> = {};
        for (const setting of settings) {
            settingsMap[setting.key] = setting.value;
        }

        if (settingsMap['dhs_username']) username = settingsMap['dhs_username'];
        if (settingsMap['dhs_password']) { password = settingsMap['dhs_password']; source = 'database'; }
    } catch (error) {
        logger.error('[DHS Config] Failed to fetch credentials from DB; using environment variables if present:', error);
    }

    // No hardcoded fallback: the DHS portal password is rotated monthly and never
    // reused, so a baked-in default would be both a credential leak in source
    // control and always stale. Fail loudly rather than attempt a doomed login.
    if (!username || !password) {
        throw new Error(
            'DHS credentials are not configured. Set them in Admin → Settings ' +
            '(stored as SystemSettings category "dhs": dhs_username / dhs_password), ' +
            'or provide DHS_USERNAME / DHS_PASSWORD environment variables.'
        );
    }

    credentialsCache = { username, password };
    lastFetchTime = now;
    logger.info('[DHS Config] Credentials loaded:', { username, source });

    return credentialsCache;
}

export function invalidateDHSCredentialsCache(): void {
    credentialsCache = null;
    lastFetchTime = 0;
    logger.info('[DHS Config] Credentials cache invalidated');
}
