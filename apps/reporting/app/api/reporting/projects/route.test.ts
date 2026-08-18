import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as getProjects } from './route'
import { prisma } from '@zenowethu/database'
import { auth } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@zenowethu/database', () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
    },
    caseProject: {
      findMany: vi.fn(),
    },
    workLog: {
      findMany: vi.fn(),
    },
  },
}))

describe('Projects API Route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)
    const req = new Request('http://localhost/api/reporting/projects')
    const res = await getProjects(req)
    expect(res.status).toEqual(401)
  })

  it('returns projects with user-managed projects prioritized on top', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-manager-1', email: 'mgr@zenowethu.co.za', reportingRole: 'manager' },
    } as any)

    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        id: 'proj-other',
        name: 'Other Project',
        description: 'Desc',
        accentColor: '#123456',
        createdAt: new Date(),
        members: [
          { userId: 'user-other', role: 'MEMBER', user: { id: 'user-other', role: 'STAFF' } },
        ],
        _count: { cases: 5, members: 2 },
      },
      {
        id: 'proj-managed',
        name: 'My Managed Project',
        description: 'Managed by me',
        accentColor: '#C4953A',
        createdAt: new Date(),
        members: [
          { userId: 'user-manager-1', role: 'MANAGER', user: { id: 'user-manager-1', role: 'MANAGER' } },
        ],
        _count: { cases: 12, members: 4 },
      },
    ] as any)

    vi.mocked(prisma.caseProject.findMany).mockResolvedValue([])
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([])

    const req = new Request('http://localhost/api/reporting/projects')
    const res = await getProjects(req)
    expect(res.status).toEqual(200)

    const data = await res.json()
    expect(data.projects).toHaveLength(2)
    // Managed project MUST be at the top (index 0)
    expect(data.projects[0].id).toBe('proj-managed')
    expect(data.projects[0].isManagerOfProject).toBe(true)
    expect(data.projects[1].id).toBe('proj-other')
    expect(data.projects[1].isManagerOfProject).toBe(false)
  })
})
