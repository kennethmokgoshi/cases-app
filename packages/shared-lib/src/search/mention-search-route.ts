// Reusable Next.js route handler for @mention autocomplete (users + groups).
// Node-only — do not import from package root.
//
// The org is small (tens of users, a handful of groups), so this returns the
// full mentionable set in one call rather than filtering server-side per
// keystroke. Callers are expected to cache the result client-side and filter
// locally as the user types — see ActivityTab's mention dropdown.

import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth } from '../auth';
import { createLogger } from '../logger';

const logger = createLogger('api/users/search');

export type MentionUserSuggestion = {
    kind: 'user';
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    organization: string;
};

export type MentionGroupSuggestion = {
    kind: 'group';
    id: string;
    name: string;
    memberCount: number;
};

export type MentionSuggestion = MentionUserSuggestion | MentionGroupSuggestion;

export async function searchMentionSuggestions(): Promise<MentionSuggestion[]> {
    const [users, groups] = await Promise.all([
        prisma.user.findMany({
            where: { isLocked: false },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                username: true,
                organization: true,
            },
            orderBy: { firstName: 'asc' },
        }),
        prisma.userGroup.findMany({
            select: { id: true, name: true, _count: { select: { members: true } } },
            orderBy: { name: 'asc' },
        }),
    ]);

    const groupSuggestions: MentionGroupSuggestion[] = groups.map(g => ({
        kind: 'group',
        id: g.id,
        name: g.name,
        memberCount: g._count.members,
    }));

    const userSuggestions: MentionUserSuggestion[] = users.map(u => ({ kind: 'user', ...u }));

    // Groups first — mentioning a whole team is usually the more deliberate action.
    return [...groupSuggestions, ...userSuggestions];
}

export function createMentionSearchRoute() {
    async function GET(request: Request) {
        try {
            const session = await auth();
            if (!session?.user?.id) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            return NextResponse.json(await searchMentionSuggestions());
        } catch (error) {
            logger.error('Error fetching mention suggestions:', error);
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }
    }

    return { GET };
}
