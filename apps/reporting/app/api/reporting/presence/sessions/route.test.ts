import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/reporting/presence/sessions/route'
import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(),
  },
}))

describe('GET /api/reporting/presence/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/reporting/presence/sessions'))
    expect(response.status).toBe(401)
  })

  it('should return empty stats and default predictions if no sessions exist for executive', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-123', email: 'exec@zenowethu.co.za', userType: 'STAFF', reportingRole: 'executive' },
    } as any)

    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([])

    const response = await GET(new Request('http://localhost/api/reporting/presence/sessions'))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.sessions).toEqual([])
    expect(data.stats.totalSessions).toBe(0)
    expect(data.predictions.dayHours).toBe(8)
  })

  it('should calculate statistics and predictions correctly for executive based on mock sessions', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-123', email: 'exec@zenowethu.co.za', userType: 'STAFF', reportingRole: 'executive' },
    } as any)

    const loginTime = new Date()
    const logoutTime = new Date(loginTime.getTime() + 120 * 60 * 1000) // 2 hours later

    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        id: 'sess-1',
        userId: 'user-123',
        loginAt: loginTime.toISOString(),
        logoutAt: logoutTime.toISOString(),
      },
    ])

    const response = await GET(new Request('http://localhost/api/reporting/presence/sessions'))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.stats.totalSessions).toBe(1)
    expect(data.stats.averageMinutes).toBe(120)
    expect(data.predictions.dayHours).toBe(2)
    expect(data.predictions.weekHours).toBe(10)
  })

  it('should return null predictions for manager/staff roles', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-123', email: 'manager@zenowethu.co.za', userType: 'STAFF', reportingRole: 'manager' },
    } as any)

    const loginTime = new Date()
    const logoutTime = new Date(loginTime.getTime() + 120 * 60 * 1000)

    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      {
        id: 'sess-1',
        userId: 'user-123',
        loginAt: loginTime.toISOString(),
        logoutAt: logoutTime.toISOString(),
      },
    ])

    const response = await GET(new Request('http://localhost/api/reporting/presence/sessions'))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.predictions).toBeNull()
    expect(data.stats.totalSessions).toBe(1)
  })
})
