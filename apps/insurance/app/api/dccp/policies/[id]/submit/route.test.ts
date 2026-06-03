import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
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
    capturePolicy: vi.fn(),
  },
}))

describe('POST /api/dccp/policies/[id]/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if unauthorized', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null)
    const request = new Request('http://localhost')
    const response = await POST(request, { params: Promise.resolve({ id: 'test-id' }) })
    expect(response.status).toBe(401)
  })

  it('should submit policy and update status to SUBMITTED', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)
    
    vi.mocked(prisma.dCCPPolicy.findUnique).mockResolvedValueOnce({
      id: 'test-id',
      status: 'DRAFT',
      policyType: 'AIP',
      clientFirstName: 'John',
      clientLastName: 'Doe',
      clientIdNumber: '9001015009087',
      clientPhone: '0821234567',
      bankName: 'FNB',
      accountNumber: '123456789',
      aipCoverAmount: 5000,
      employerName: 'ACME Corp',
    } as any)

    vi.mocked(dccpService.capturePolicy).mockResolvedValueOnce({
      success: true,
      policyNumber: 'AIP-123456',
    })

    const request = new Request('http://localhost')
    const response = await POST(request, { params: Promise.resolve({ id: 'test-id' }) })
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.policyNumber).toBe('AIP-123456')
    expect(prisma.dCCPPolicy.update).toHaveBeenCalledWith({
      where: { id: 'test-id' },
      data: { status: 'SUBMITTED', policyNumber: 'AIP-123456' }
    })
  })
})
