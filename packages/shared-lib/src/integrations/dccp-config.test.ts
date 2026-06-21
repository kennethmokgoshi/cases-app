import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFindUnique = vi.hoisted(() => vi.fn())
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    dCCPCredential: {
      findUnique: mockFindUnique,
    },
  },
}))

vi.mock('../logger', () => ({
  logger: mockLogger,
}))

import { encryptSecret } from '../security/encryption'
import { getDCCPCredentials, invalidateDCCPCredentialsCache } from './dccp-config'

const originalEnv = { ...process.env }

describe('getDCCPCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateDCCPCredentialsCache('user-1')
    process.env.DCCP_CREDENTIAL_ENCRYPTION_KEY = 'test-key-material'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('decrypts encrypted DB credentials before returning them to the service layer', async () => {
    mockFindUnique.mockResolvedValue({
      username: 'dccp-user',
      password: encryptSecret('dccp-password'),
      portalUrl: 'https://portal.example.test',
      isActive: true,
    })

    const credentials = await getDCCPCredentials('user-1')

    expect(credentials).toEqual({
      username: 'dccp-user',
      password: 'dccp-password',
      portalUrl: 'https://portal.example.test',
    })
  })

  it('supports legacy plaintext records so existing credentials do not break on rollout', async () => {
    mockFindUnique.mockResolvedValue({
      username: 'legacy-user',
      password: 'legacy-password',
      portalUrl: null,
      isActive: true,
    })

    const credentials = await getDCCPCredentials('user-1')

    expect(credentials?.password).toBe('legacy-password')
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[DCCP Config] Credential is stored in legacy plaintext format; it will be encrypted on next save',
      { userId: 'user-1' },
    )
  })
})
