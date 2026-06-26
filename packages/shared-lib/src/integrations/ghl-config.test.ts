import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted stubs ────────────────────────────────────────────────────────────
// vi.mock() is hoisted above const declarations; use vi.hoisted() so that
// mockFindMany is available when the factory runs.

const mockFindMany = vi.hoisted(() => vi.fn());

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@zenowethu/database', () => ({
    prisma: {
        systemSettings: { findMany: mockFindMany },
    },
}));

vi.mock('../logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { getGHLCredentials, invalidateGHLCredentialsCache, isGhlEnabled } from './ghl-config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbSettings(apiKey: string, locationId: string) {
    return [
        { key: 'ghl_api_key', value: apiKey },
        { key: 'ghl_location_id', value: locationId },
    ];
}

// ─── getGHLCredentials ────────────────────────────────────────────────────────

describe('getGHLCredentials', () => {
    beforeEach(() => {
        invalidateGHLCredentialsCache();
        vi.clearAllMocks();
        delete process.env.GHL_API_KEY;
        delete process.env.GHL_LOCATION_ID;
        delete process.env.GHL_EMAIL;
        delete process.env.GHL_PASSWORD;
    });

    it('returns credentials loaded from DB settings', async () => {
        mockFindMany.mockResolvedValue(dbSettings('db-api-key', 'db-location-id'));

        const creds = await getGHLCredentials();

        expect(creds.apiKey).toBe('db-api-key');
        expect(creds.locationId).toBe('db-location-id');
    });

    it('falls back to env vars when DB returns empty settings', async () => {
        mockFindMany.mockResolvedValue([]);
        process.env.GHL_API_KEY = 'env-api-key';
        process.env.GHL_LOCATION_ID = 'env-location-id';

        const creds = await getGHLCredentials();

        expect(creds.apiKey).toBe('env-api-key');
        expect(creds.locationId).toBe('env-location-id');
    });

    it('falls back to env vars when DB throws', async () => {
        mockFindMany.mockRejectedValue(new Error('DB connection failed'));
        process.env.GHL_API_KEY = 'env-fallback-key';
        process.env.GHL_LOCATION_ID = 'env-fallback-location';

        const creds = await getGHLCredentials();

        expect(creds.apiKey).toBe('env-fallback-key');
        expect(creds.locationId).toBe('env-fallback-location');
    });

    it('returns empty strings when nothing is configured', async () => {
        mockFindMany.mockRejectedValue(new Error('DB down'));

        const creds = await getGHLCredentials();

        expect(creds.apiKey).toBe('');
        expect(creds.locationId).toBe('');
    });

    it('DB setting takes priority over env var for the same key', async () => {
        process.env.GHL_API_KEY = 'env-key';
        mockFindMany.mockResolvedValue(dbSettings('db-key-wins', 'loc'));

        const creds = await getGHLCredentials();

        expect(creds.apiKey).toBe('db-key-wins');
    });

    it('caches credentials within the TTL window', async () => {
        mockFindMany.mockResolvedValue(dbSettings('cached-key', 'loc'));

        await getGHLCredentials();
        await getGHLCredentials();
        await getGHLCredentials();

        // DB should only be called once; subsequent calls return cached value
        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});

// ─── GHL_ENABLED kill-switch ─────────────────────────────────────────────────

describe('GHL_ENABLED kill-switch', () => {
    beforeEach(() => {
        invalidateGHLCredentialsCache();
        vi.clearAllMocks();
        delete process.env.GHL_API_KEY;
        delete process.env.GHL_LOCATION_ID;
        delete process.env.GHL_ENABLED;
    });

    it('isGhlEnabled() is true by default and false when GHL_ENABLED=false', () => {
        expect(isGhlEnabled()).toBe(true);
        process.env.GHL_ENABLED = 'false';
        expect(isGhlEnabled()).toBe(false);
    });

    it('returns empty credentials and never queries the DB when suspended', async () => {
        process.env.GHL_ENABLED = 'false';
        process.env.GHL_API_KEY = 'env-key';        // present but must be ignored
        process.env.GHL_LOCATION_ID = 'env-loc';
        mockFindMany.mockResolvedValue(dbSettings('db-key', 'db-loc'));

        const creds = await getGHLCredentials();

        expect(creds.apiKey).toBe('');
        expect(creds.locationId).toBe('');
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('resumes normal resolution once the switch is removed', async () => {
        mockFindMany.mockResolvedValue(dbSettings('db-key', 'db-loc'));
        const creds = await getGHLCredentials();
        expect(creds.apiKey).toBe('db-key');
    });
});

// ─── invalidateGHLCredentialsCache ───────────────────────────────────────────

describe('invalidateGHLCredentialsCache', () => {
    beforeEach(() => {
        invalidateGHLCredentialsCache();
        vi.clearAllMocks();
        delete process.env.GHL_API_KEY;
    });

    it('forces a fresh DB fetch on the next call after invalidation', async () => {
        mockFindMany
            .mockResolvedValueOnce(dbSettings('first-key', 'loc'))
            .mockResolvedValueOnce(dbSettings('second-key', 'loc'));

        const first = await getGHLCredentials();
        expect(first.apiKey).toBe('first-key');

        // Second call within TTL — should use cache, not call DB again
        const cached = await getGHLCredentials();
        expect(cached.apiKey).toBe('first-key');
        expect(mockFindMany).toHaveBeenCalledTimes(1);

        // After invalidation, next call must re-fetch from DB
        invalidateGHLCredentialsCache();
        const fresh = await getGHLCredentials();
        expect(fresh.apiKey).toBe('second-key');
        expect(mockFindMany).toHaveBeenCalledTimes(2);
    });
});
