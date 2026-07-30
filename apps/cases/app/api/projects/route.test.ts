import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        project: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        projectMember: {
            findMany: vi.fn(),
        },
        caseProject: {
            groupBy: vi.fn(),
        },
    },
}));

import { auth } from '@zenowethu/shared-lib/src/auth';
import { prisma } from '@zenowethu/database';
import { GET } from './route';

const projectGraph = [
    { id: 'referrals-root', name: 'Referrals', type: 'ACQUISITION_SOURCE', clientType: 'B2C', parentId: null },
    { id: 'kenneth-referrer', name: 'Kenneth Mokgoshi', type: 'REFERRER', clientType: null, parentId: 'referrals-root' },
    { id: 'ruphas-referrer', name: 'Ruphas Ruphy', type: 'REFERRER', clientType: null, parentId: 'referrals-root' },
    { id: 'ruphas-year', name: '2026', type: 'YEAR', clientType: null, parentId: 'ruphas-referrer' },
];

describe('GET /api/projects memberOnly', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({
            user: {
                id: 'user-kenneth',
                role: 'MEMBER',
                isAdmin: false,
                userType: 'STAFF',
                b2bPartnerId: null,
            },
        } as never);

        vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
            { projectId: 'referrals-root' },
            { projectId: 'kenneth-referrer' },
        ] as never);

        vi.mocked(prisma.project.findMany).mockImplementation((async (args: unknown) => {
            const query = args as { where?: { id?: { in?: string[] } }; select?: Record<string, boolean> };
            if (query.select?.parentId && query.select?.type && !query.select?.name) {
                return projectGraph.map(({ id, parentId, type }) => ({ id, parentId, type })) as never;
            }

            const ids = query.where?.id?.in || [];
            return projectGraph
                .filter((project) => ids.includes(project.id))
                .map((project) => ({
                    ...project,
                    referrer: project.type === 'REFERRER'
                        ? {
                            id: `${project.id}-record`,
                            firstName: project.name.split(' ')[0],
                            lastName: project.name.split(' ').slice(1).join(' '),
                        }
                        : null,
                    children: [],
                })) as never;
        }) as never);
    });

    it('keeps non-member referrer sub-projects out of the new-case project tree', async () => {
        const res = await GET(new Request('http://localhost/api/projects?memberOnly=true') as never);

        expect(res.status).toBe(200);
        const json = await res.json();
        const projectNames = json.independent.map((project: { name: string }) => project.name);

        expect(projectNames).toContain('Referrals');
        expect(projectNames).toContain('Kenneth Mokgoshi');
        expect(projectNames).not.toContain('Ruphas Ruphy');

        const finalProjectQuery = vi.mocked(prisma.project.findMany).mock.calls.at(-1)?.[0] as {
            where?: { id?: { in?: string[] } };
        };
        expect(finalProjectQuery.where?.id?.in).toContain('kenneth-referrer');
        expect(finalProjectQuery.where?.id?.in).not.toContain('ruphas-referrer');
        expect(finalProjectQuery.where?.id?.in).not.toContain('ruphas-year');
    });

    it('includes branch subprojects in children select query when memberOnly is set', async () => {
        const res = await GET(new Request('http://localhost/api/projects?memberOnly=true&t=subproject-test') as never);
        expect(res.status).toBe(200);

        const finalProjectQuery = vi.mocked(prisma.project.findMany).mock.calls.at(-1)?.[0] as {
            select?: { children?: { where?: { id?: { in?: string[] } } } };
        };

        // Ensure children.where.id.in contains all allowed project IDs (including branches), not just explicit member IDs
        expect(finalProjectQuery.select?.children?.where?.id?.in).toBeDefined();
        expect(finalProjectQuery.select?.children?.where?.id?.in).toContain('kenneth-referrer');
    });
});

describe('GET /api/projects?flat=true&all=true (admin list)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'admin-1', role: 'ADMIN', isAdmin: true, userType: 'STAFF', b2bPartnerId: null },
        } as never);

        vi.mocked(prisma.project.findMany).mockResolvedValue([
            { id: 'p1', name: 'Alpha', parentId: null, _count: { children: 2 }, members: [{ userId: 'u1', role: 'MANAGER' }] },
            { id: 'p2', name: 'Beta', parentId: 'p1', _count: { children: 0 }, members: [] },
        ] as never);

        // Cast around Prisma's groupBy generic, which trips TS's circular-type
        // guard (TS2615) when vi.mocked tries to resolve its signature.
        (prisma.caseProject.groupBy as unknown as { mockResolvedValue: (v: unknown) => void })
            .mockResolvedValue([{ projectId: 'p1', _count: { caseId: 5 } }]);
    });

    it('returns a slim payload without the members->user join or parent/children includes', async () => {
        const res = await GET(new Request('http://localhost/api/projects?flat=true&all=true') as never);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(Array.isArray(json)).toBe(true);

        const query = vi.mocked(prisma.project.findMany).mock.calls[0]?.[0] as {
            include?: Record<string, unknown>;
        };
        // The expensive user join is gone — only userId/role are selected.
        expect(query.include?.members).toEqual({ select: { userId: true, role: true } });
        // The tree is rebuilt client-side, so these includes must not be fetched.
        expect(query.include).not.toHaveProperty('parent');
        expect(query.include).not.toHaveProperty('children');
        expect(query.include?._count).toEqual({ select: { children: true } });
    });

    it('still merges active case counts into each project', async () => {
        const res = await GET(new Request('http://localhost/api/projects?flat=true&all=true') as never);
        const json = await res.json();

        const alpha = json.find((p: { id: string }) => p.id === 'p1');
        const beta = json.find((p: { id: string }) => p.id === 'p2');
        expect(alpha._count.cases).toBe(5);
        expect(alpha._count.children).toBe(2);
        expect(beta._count.cases).toBe(0);
    });
});
