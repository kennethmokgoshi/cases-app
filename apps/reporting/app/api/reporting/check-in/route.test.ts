import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/reporting/check-in/route'
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

describe('POST /api/reporting/check-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))
    expect(response.status).toBe(401)
  })

  it('should mark user as ONLINE and return presence data', async () => {
    const mockSession = { user: { id: 'user-123' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const mockPresence = {
      userId: 'user-123',
      status: 'ONLINE',
      lastActivityAt: new Date(),
      user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    }
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue(mockPresence as any)

    const response = await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.presence.status).toBe('ONLINE')
    expect(data.presence.user.firstName).toBe('John')
  })

  it('should handle errors gracefully', async () => {
    const mockSession = { user: { id: 'user-123' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockRejectedValue(new Error('DB error'))

    const response = await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))
    expect(response.status).toBe(500)

    const data = await response.json()
    expect(data.error).toBe('Failed to check in')
  })
})