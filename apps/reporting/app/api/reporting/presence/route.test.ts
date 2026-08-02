import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/reporting/presence/route'
import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    employeePresence: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

const mockSession = {
  user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' },
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000)
}

describe('GET /api/reporting/presence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.employeePresence.updateMany).mockResolvedValue({ count: 0 } as any)
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/reporting/presence'))
    expect(response.status).toBe(401)
  })

  it('keeps AVAILABLE staff active within the 1hr short-idle window', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findMany).mockResolvedValue([
      {
        userId: 'u1',
        status: 'AVAILABLE',
        lastActivityAt: minutesAgo(10),
        user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@z.co.za', avatarUrl: null },
      },
    ] as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence'))
    const data = await response.json()
    expect(data.total).toBe(1)
    expect(data.online[0].status).toBe('AVAILABLE')
  })

  it('drops AVAILABLE staff idle past the 1hr short-idle cutoff', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findMany).mockResolvedValue([
      {
        userId: 'u1',
        status: 'AVAILABLE',
        lastActivityAt: minutesAgo(90),
        user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@z.co.za', avatarUrl: null },
      },
    ] as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence'))
    const data = await response.json()
    expect(data.total).toBe(0)
  })

  it('keeps a DND status (IN_MEETING) active well past the 1hr short-idle cutoff', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findMany).mockResolvedValue([
      {
        userId: 'u2',
        status: 'IN_MEETING',
        lastActivityAt: minutesAgo(90),
        user: { id: 'u2', firstName: 'C', lastName: 'D', email: 'c@z.co.za', avatarUrl: null },
      },
    ] as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence'))
    const data = await response.json()
    expect(data.total).toBe(1)
    expect(data.online[0].status).toBe('IN_MEETING')
  })

  it('drops a DND status past the 12hr long-idle cutoff', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findMany).mockResolvedValue([
      {
        userId: 'u2',
        status: 'DEEP_FOCUS',
        lastActivityAt: minutesAgo(13 * 60),
        user: { id: 'u2', firstName: 'C', lastName: 'D', email: 'c@z.co.za', avatarUrl: null },
      },
    ] as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence'))
    const data = await response.json()
    expect(data.total).toBe(0)
  })

  it('normalizes legacy ONLINE status to AVAILABLE in the response', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findMany).mockResolvedValue([
      {
        userId: 'u3',
        status: 'ONLINE',
        lastActivityAt: minutesAgo(5),
        user: { id: 'u3', firstName: 'E', lastName: 'F', email: 'e@z.co.za', avatarUrl: null },
      },
    ] as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence'))
    const data = await response.json()
    expect(data.online[0].status).toBe('AVAILABLE')
  })
})
