import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { prisma } from '@zenowethu/database'
import { auth } from '@zenowethu/shared-lib'
import { dccpService } from '@zenowethu/shared-lib/src/integrations/dccp'

vi.mock('@zenowethu/database', () => ({
  prisma: {
    dCCPPolicy: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
}))

vi.mock('@zenowethu/shared-lib/src/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@zenowethu/shared-lib/src/integrations/dccp', () => ({
  dccpService: {
    getPolicyStatus: vi.fn(),
  },
}))

describe('GET /api/dccp/policies/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if unauthorized', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null)
    const request = new Request('http://localhost')
    const response = await GET(request, { params: { id: 'test-id' } })
    expect(response.status).toBe(401)
  })

  it('should sync and return latest status', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)
    
    vi.mocked(prisma.dCCPPolicy.findUnique).mockResolvedValueOnce({
      id: 'test-id',
      policyNumber: 'AIP-123456',
      status: 'SUBMITTED',
    } as any)

    vi.mocked(dccpService.getPolicyStatus).mockResolvedValueOnce({
      policyNumber: 'AIP-123456',
      status: 'ACTIVE',
    })

    const request = new Request('http://localhost')
    const response = await GET(request, { params: { id: 'test-id' } })
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.status).toBe('ACTIVE')
    expect(data.policyNumber).toBe('AIP-123456')
    
    expect(prisma.dCCPPolicy.update).toHaveBeenCalledWith({
      where: { id: 'test-id' },
      data: { status: 'ACTIVE' }
    })
  })
})
