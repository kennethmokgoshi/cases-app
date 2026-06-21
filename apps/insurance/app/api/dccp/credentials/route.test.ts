import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockFindUnique = vi.hoisted(() => vi.fn())
const mockUpsert = vi.hoisted(() => vi.fn())
const mockDeleteMany = vi.hoisted(() => vi.fn())
const mockInvalidate = vi.hoisted(() => vi.fn())
const mockTestConnection = vi.hoisted(() => vi.fn())
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@zenowethu/shared-lib', () => ({
  auth: mockAuth,
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    dCCPCredential: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
  },
}))

vi.mock('@zenowethu/shared-lib/src/logger', () => ({
  logger: mockLogger,
}))

vi.mock('@zenowethu/shared-lib/src/integrations/dccp-config', () => ({
  invalidateDCCPCredentialsCache: mockInvalidate,
}))

vi.mock('@zenowethu/shared-lib/src/integrations/dccp', () => ({
  dccpService: {
    testConnection: mockTestConnection,
  },
}))

import { decryptSecret, isEncryptedSecret } from '@zenowethu/shared-lib/src/security/encryption'
import { POST } from './route'

const originalEnv = { ...process.env }

describe('POST /api/dccp/credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DCCP_CREDENTIAL_ENCRYPTION_KEY = 'test-key-material'
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockUpsert.mockResolvedValue({
      username: 'dccp-user',
      portalUrl: 'https://portal.example.test',
      updatedAt: new Date('2026-06-16T10:00:00.000Z'),
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('encrypts the portal password before saving credentials', async () => {
    const response = await POST(new Request('http://localhost/api/dccp/credentials', {
      method: 'POST',
      body: JSON.stringify({
        username: 'dccp-user',
        password: 'plain-password',
        portalUrl: 'https://portal.example.test',
      }),
    }))

    expect(response.status).toBe(200)
    const upsertArg = mockUpsert.mock.calls[0][0]

    expect(upsertArg.create.password).not.toBe('plain-password')
    expect(upsertArg.update.password).toBe(upsertArg.create.password)
    expect(isEncryptedSecret(upsertArg.create.password)).toBe(true)
    expect(decryptSecret(upsertArg.create.password)).toBe('plain-password')
    expect(mockInvalidate).toHaveBeenCalledWith('user-1')
  })

  it('returns 401 when the user is not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null)

    const response = await POST(new Request('http://localhost/api/dccp/credentials', {
      method: 'POST',
      body: JSON.stringify({ username: 'u', password: 'p' }),
    }))

    expect(response.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
