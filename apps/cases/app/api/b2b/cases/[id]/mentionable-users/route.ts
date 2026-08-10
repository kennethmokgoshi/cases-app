import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { canB2BAccessCase, getMentionableUsersForB2B } from '@/lib/b2b-case-access';

const logger = createLogger('api/b2b/cases/[id]/mentionable-users');

// GET - Search users a B2B partner may @mention on this case (staff on the
// case + other users at their own partner org). Used by the B2B comment box's
// mention autocomplete.
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (session.user.userType !== 'B2B_PARTNER' || !session.user.b2bPartnerId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await params;
        const hasAccess = await canB2BAccessCase(id, session.user.b2bPartnerId);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const query = (searchParams.get('q') || '').trim().toLowerCase();
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 25);

        const candidates = await getMentionableUsersForB2B(id, session.user.b2bPartnerId);

        const filtered = candidates
            .filter(u => u.id !== session.user.id)
            .filter(u => {
                if (!query) return true;
                return (
                    u.firstName.toLowerCase().includes(query) ||
                    u.lastName.toLowerCase().includes(query) ||
                    `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
                    u.username.toLowerCase().includes(query)
                );
            })
            .slice(0, limit)
            .map(u => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username }));

        return NextResponse.json(filtered);
    } catch (error) {
        logger.error('Error searching mentionable users:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
