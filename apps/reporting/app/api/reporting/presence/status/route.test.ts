import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from '@/app/api/reporting/presence/status/route'
import { auth } from '@/lib/auth'
import { prisma } from '@zenowethu/database'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    employeePresence: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

const mockSession = {
  user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' },
}

describe('GET /api/reporting/presence/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/reporting/presence/status'))
    expect(response.status).toBe(401)
  })

  it('should return OFFLINE when no presence record exists', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findUnique).mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/reporting/presence/status'))
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.status).toBe('OFFLINE')
  })

  it('should normalize a legacy ONLINE status to AVAILABLE', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findUnique).mockResolvedValue({
      status: 'ONLINE',
      lastActivityAt: new Date(),
      checkedInAt: new Date(),
    } as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence/status'))
    const data = await response.json()
    expect(data.status).toBe('AVAILABLE')
  })

  it('should return a valid catchy status unchanged', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findUnique).mockResolvedValue({
      status: 'DEEP_FOCUS',
      lastActivityAt: new Date(),
      checkedInAt: new Date(),
    } as any)

    const response = await GET(new Request('http://localhost/api/reporting/presence/status'))
    const data = await response.json()
    expect(data.status).toBe('DEEP_FOCUS')
  })
})

describe('PATCH /api/reporting/presence/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function patchRequest(body: unknown) {
    return new Request('http://localhost/api/reporting/presence/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('should return 401 if not authenticated', async () => {
    vi.mocked(auth as any).mockResolvedValue(null)

    const response = await PATCH(patchRequest({ status: 'DEEP_FOCUS' }))
    expect(response.status).toBe(401)
  })

  it('should return 400 for an invalid status value', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const response = await PATCH(patchRequest({ status: 'BUSY' }))
    expect(response.status).toBe(400)
    expect(prisma.employeePresence.upsert).not.toHaveBeenCalled()
  })

  it('should reject OFFLINE — it is not user-selectable', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)

    const response = await PATCH(patchRequest({ status: 'OFFLINE' }))
    expect(response.status).toBe(400)
  })

  it('should update the presence status for the authenticated user only', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    const mockPresence = {
      userId: 'user-123',
      status: 'IN_MEETING',
      user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    }
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue(mockPresence as any)

    const response = await PATCH(patchRequest({ status: 'IN_MEETING' }))
    expect(response.status).toBe(200)

    const call = vi.mocked(prisma.employeePresence.upsert).mock.calls[0][0] as any
    expect(call.where.userId).toBe('user-123')
    expect(call.update.status).toBe('IN_MEETING')

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.presence.status).toBe('IN_MEETING')
  })

  it('should handle errors gracefully', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockRejectedValue(new Error('DB error'))

    const response = await PATCH(patchRequest({ status: 'AVAILABLE' }))
    expect(response.status).toBe(500)
  })
})
