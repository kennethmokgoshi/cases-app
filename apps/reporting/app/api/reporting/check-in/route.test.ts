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
      findUnique: vi.fn(),
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
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
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

  it('should default the stored status to AVAILABLE when no status is given', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))

    const call = vi.mocked(prisma.employeePresence.upsert).mock.calls[0][0] as any
    expect(call.update.status).toBe('AVAILABLE')
    expect(call.create.status).toBe('AVAILABLE')
  })

  it('should accept a valid status override', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(
      new Request('http://localhost/api/reporting/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DEEP_FOCUS' }),
      })
    )

    const call = vi.mocked(prisma.employeePresence.upsert).mock.calls[0][0] as any
    expect(call.update.status).toBe('DEEP_FOCUS')
  })

  it('should fall back to AVAILABLE for an invalid status value', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(
      new Request('http://localhost/api/reporting/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'NOT_A_REAL_STATUS' }),
      })
    )

    const call = vi.mocked(prisma.employeePresence.upsert).mock.calls[0][0] as any
    expect(call.update.status).toBe('AVAILABLE')
  })

  it('should reject OFFLINE as a check-in status override (not user-selectable)', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(
      new Request('http://localhost/api/reporting/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OFFLINE' }),
      })
    )

    const call = vi.mocked(prisma.employeePresence.upsert).mock.calls[0][0] as any
    expect(call.update.status).toBe('AVAILABLE')
  })

  it('should close a dangling open session (back-dated to last known activity) before creating a new one', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    const staleActivity = new Date('2026-07-29T21:50:00.000Z')
    vi.mocked(prisma.employeePresence.findUnique).mockResolvedValue({ lastActivityAt: staleActivity } as any)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))

    const rawCalls = vi.mocked(prisma.$executeRawUnsafe).mock.calls
    const closeCall = rawCalls.find((c) => String(c[0]).includes('UPDATE "EmployeeSession"'))
    expect(closeCall).toBeTruthy()
    expect(String(closeCall![0])).toContain(staleActivity.toISOString())
    expect(String(closeCall![0])).toContain('"logoutAt" IS NULL')

    const insertCall = rawCalls.find((c) => String(c[0]).includes('INSERT INTO "EmployeeSession"'))
    expect(insertCall).toBeTruthy()
  })

  it('should back-date the dangling-session close to now when no prior presence record exists', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.employeePresence.upsert).mockResolvedValue({} as any)

    await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))

    const rawCalls = vi.mocked(prisma.$executeRawUnsafe).mock.calls
    const closeCall = rawCalls.find((c) => String(c[0]).includes('UPDATE "EmployeeSession"'))
    expect(closeCall).toBeTruthy()
  })

  it('should handle errors gracefully', async () => {
    const mockSession = { user: { id: 'user-123', email: 'john@zenowethu.co.za', userType: 'STAFF' } }
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.employeePresence.upsert).mockRejectedValue(new Error('DB error'))

    const response = await POST(new Request('http://localhost/api/reporting/check-in', { method: 'POST' }))
    expect(response.status).toBe(500)

    const data = await response.json()
    expect(data.error).toBe('Failed to check in')
  })
})