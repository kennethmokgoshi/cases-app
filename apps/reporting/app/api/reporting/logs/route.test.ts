import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/reporting/logs/route'
import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))
vi.mock('@zenowethu/database', () => ({
  prisma: {
    workLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    case: {
      findUnique: vi.fn(),
    },
  },
}))

describe('GET/POST /api/reporting/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('should return 401 if not authenticated', async () => {
      vi.mocked(auth as any).mockResolvedValue(null)

      const response = await GET(new Request('http://localhost/api/reporting/logs'))
      expect(response.status).toBe(401)
    })

    it('should return work logs for authenticated user', async () => {
      const mockSession = { user: { id: 'user-123' } }
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-123',
          category: 'CLIENT_CALLS',
          description: 'Called client about case',
          durationMinutes: 30,
          isVerified: false,
        },
      ]
      vi.mocked(prisma.workLog.findMany).mockResolvedValue(mockLogs as any)

      const response = await GET(new Request('http://localhost/api/reporting/logs'))
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.logs).toHaveLength(1)
      expect(data.logs[0].category).toBe('CLIENT_CALLS')
    })
  })

  describe('POST', () => {
    it('should return 401 if not authenticated', async () => {
      vi.mocked(auth as any).mockResolvedValue(null)

      const response = await POST(
        new Request('http://localhost/api/reporting/logs', {
          method: 'POST',
          body: JSON.stringify({ category: 'CLIENT_CALLS', description: 'Test', durationMinutes: 30 }),
        })
      )
      expect(response.status).toBe(401)
    })

    it('should create a work log with valid data', async () => {
      const mockSession = { user: { id: 'user-123' } }
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const mockLog = {
        id: 'log-1',
        userId: 'user-123',
        category: 'CLIENT_CALLS',
        description: 'Client call',
        durationMinutes: 60,
        fileNumber: null,
      }
      vi.mocked(prisma.case.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.workLog.create).mockResolvedValue(mockLog as any)

      const response = await POST(
        new Request('http://localhost/api/reporting/logs', {
          method: 'POST',
          body: JSON.stringify({
            date: new Date().toISOString(),
            category: 'CLIENT_CALLS',
            description: 'Client call',
            durationMinutes: 60,
          }),
        })
      )

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it('should validate case number if provided', async () => {
      const mockSession = { user: { id: 'user-123' } }
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.case.findUnique).mockResolvedValue(null)

      const response = await POST(
        new Request('http://localhost/api/reporting/logs', {
          method: 'POST',
          body: JSON.stringify({
            date: new Date().toISOString(),
            category: 'CLIENT_CALLS',
            description: 'Test',
            durationMinutes: 60,
            fileNumber: 'ZDM-INVALID',
          }),
        })
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Case not found')
    })
  })
})