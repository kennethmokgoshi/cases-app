import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/reporting/check-out/route'
import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    employeePresence: {
      upsert: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}))

const mockSession = {
  user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' },
}

describe('POST /api/reporting/check-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await POST(new Request('http://localhost/api/reporting/check-out', { method: 'POST' }))
    expect(response.status).toBe(401)
  })

  it('should mark presence OFFLINE and return presence data', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    const mockPresence = {
      userId: 'user-123',
      status: 'OFFLINE',
      user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    }
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue(mockPresence as any)

    const response = await POST(new Request('http://localhost/api/reporting/check-out', { method: 'POST' }))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.presence.status).toBe('OFFLINE')
  })

  it('should close only the single most recently opened session, not every dangling one', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(new Request('http://localhost/api/reporting/check-out', { method: 'POST' }))

    const rawCalls = vi.mocked(prisma.$executeRawUnsafe).mock.calls
    expect(rawCalls).toHaveLength(1)
    const sql = String(rawCalls[0][0])
    expect(sql).toContain('ORDER BY "loginAt" DESC')
    expect(sql).toContain('LIMIT 1')
    expect(sql).toContain('"logoutAt" IS NULL')
  })

  it('should handle errors gracefully', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockRejectedValue(new Error('DB error'))

    const response = await POST(new Request('http://localhost/api/reporting/check-out', { method: 'POST' }))
    expect(response.status).toBe(500)

    const data = await response.json()
    expect(data.error).toBe('Failed to check out')
  })
})
