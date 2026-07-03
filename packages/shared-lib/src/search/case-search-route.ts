// Reusable Next.js route handler for the global case search used by the
// TopBar SearchWithSuggestions component in every app. Each app wires it in
// one line so the search behaviour (case-insensitive matching on file number,
// name, surname, ID number, phone and email; recent cases on empty query;
// soft-deleted cases excluded) stays identical across the monorepo:
//
//   // apps/<app>/app/api/cases/search/route.ts
//   import { createCaseSearchRoute } from '@zenowethu/shared-lib/src/search/case-search-route';
//   export const { GET } = createCaseSearchRoute();
//
// Node-only — do not import from the package root.

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '../auth';
import { createLogger } from '../logger';

const logger = createLogger('api/cases/search');

export type CaseSearchSuggestion = {
    id: string;
    fileNumber: string;
    clientName: string;
    clientIdNumber: string;
    status: string;
    project: string;
};

const caseInclude = {
    client: true,
    projects: {
        where: { isPrimary: true },
        include: { project: true },
    },
} as const;

export async function searchCases(query: string | undefined): Promise<CaseSearchSuggestion[]> {
    const cases = !query
        ? await prisma.case.findMany({
            where: { deletedAt: { equals: null } },
            take: 5,
            include: caseInclude,
            orderBy: { updatedAt: 'desc' },
        })
        : await prisma.case.findMany({
            where: {
                deletedAt: { equals: null },
                OR: [
                    { fileNumber: { contains: query, mode: 'insensitive' } },
                    { client: { firstName: { contains: query, mode: 'insensitive' } } },
                    { client: { lastName: { contains: query, mode: 'insensitive' } } },
                    { client: { idNumber: { contains: query, mode: 'insensitive' } } },
                    { client: { phone: { contains: query, mode: 'insensitive' } } },
                    { client: { email: { contains: query, mode: 'insensitive' } } },
                ],
            },
            take: 10,
            include: caseInclude,
            orderBy: { updatedAt: 'desc' },
        });

    return cases.map((c) => ({
        id: c.id,
        fileNumber: c.fileNumber,
        clientName: `${c.client.firstName} ${c.client.lastName}`,
        clientIdNumber: c.client.idNumber,
        status: c.status,
        project: c.projects[0]?.project?.name || 'No Project',
    }));
}

export function createCaseSearchRoute() {
    async function GET(request: Request) {
        try {
            const session = await auth();
            if (!session?.user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const query = searchParams.get('q')?.trim();

            if (query && query.length < 2) {
                return NextResponse.json([]);
            }

            return NextResponse.json(await searchCases(query));
        } catch (error) {
            logger.error('Error searching cases:', error);
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }
    }

    return { GET };
}
