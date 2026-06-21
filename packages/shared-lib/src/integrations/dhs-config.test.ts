import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFindMany = vi.hoisted(() => vi.fn())
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    systemSettings: {
      findMany: mockFindMany,
    },
  },
}))

vi.mock('../logger', () => ({
  logger: mockLogger,
}))

import { getDHSCredentials, invalidateDHSCredentialsCache } from './dhs-config'

const originalEnv = { ...process.env }

describe('getDHSCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateDHSCredentialsCache()
    delete process.env.DHS_USERNAME
    delete process.env.DHS_PASSWORD
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns credentials from the database when present', async () => {
    mockFindMany.mockResolvedValue([
      { key: 'dhs_username', value: 'NCRDC3693' },
      { key: 'dhs_password', value: 'monthly-rotated-secret' },
    ])

    const creds = await getDHSCredentials()

    expect(creds).toEqual({ username: 'NCRDC3693', password: 'monthly-rotated-secret' })
  })

  it('falls back to environment variables when the DB has no DHS settings', async () => {
    mockFindMany.mockResolvedValue([])
    process.env.DHS_USERNAME = 'env-user'
    process.env.DHS_PASSWORD = 'env-pass'

    const creds = await getDHSCredentials()

    expect(creds).toEqual({ username: 'env-user', password: 'env-pass' })
  })

  it('throws (no hardcoded fallback) when nothing is configured', async () => {
    mockFindMany.mockResolvedValue([])

    await expect(getDHSCredentials()).rejects.toThrow(/DHS credentials are not configured/)
  })

  it('still throws when the DB lookup fails and no env vars are set', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'))

    await expect(getDHSCredentials()).rejects.toThrow(/DHS credentials are not configured/)
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('returns exactly the DB password with no baked-in fallback contamination', async () => {
    mockFindMany.mockResolvedValue([
      { key: 'dhs_username', value: 'NCRDC3693' },
      { key: 'dhs_password', value: 'a-monthly-rotated-value' },
    ])

    const creds = await getDHSCredentials()

    // The returned password must be exactly what the DB held — proving there is
    // no hardcoded default merged in. (Guards against reintroducing a fallback.)
    expect(creds.password).toBe('a-monthly-rotated-value')
  })
})
