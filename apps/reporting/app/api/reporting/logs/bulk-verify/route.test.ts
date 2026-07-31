import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/reporting/logs/bulk-verify/route'
import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))
vi.mock('@zenowethu/database', () => ({
  prisma: {
    workLog: {
      updateMany: vi.fn(),
    },
  },
}))

describe('POST /api/reporting/logs/bulk-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await POST(
      new Request('http://localhost/api/reporting/logs/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({ logIds: ['log-1'], isVerified: true }),
      })
    )
    expect(response.status).toBe(401)
  })

  it('should return 403 if user is not a manager or admin', async () => {
    const mockSession = { user: { id: 'user-123', email: 'user@zenowethu.co.za', userType: 'STAFF', isAdmin: false, role: 'MEMBER' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const response = await POST(
      new Request('http://localhost/api/reporting/logs/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({ logIds: ['log-1'], isVerified: true }),
      })
    )
    expect(response.status).toBe(403)
  })

  it('should bulk verify logs for managers', async () => {
    const mockSession = { user: { id: 'manager-1', email: 'manager@zenowethu.co.za', userType: 'STAFF', isAdmin: false, role: 'MANAGER' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    vi.mocked(prisma.workLog.updateMany).mockResolvedValue({ count: 3 })

    const response = await POST(
      new Request('http://localhost/api/reporting/logs/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({ logIds: ['log-1', 'log-2', 'log-3'], isVerified: true }),
      })
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.updated).toBe(3)
  })

  it('should require at least one log ID', async () => {
    const mockSession = { user: { id: 'manager-1', email: 'manager@zenowethu.co.za', userType: 'STAFF', isAdmin: true, role: 'MANAGER' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const response = await POST(
      new Request('http://localhost/api/reporting/logs/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({ logIds: [], isVerified: true }),
      })
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('No logs to verify')
  })
})