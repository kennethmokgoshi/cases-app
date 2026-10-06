import { NextResponse } from 'next/server';
import { auth } from './auth';

/**
 * Server-side role guards for API route handlers.
 *
 * The app middleware only proves a request carries *a* session. Referrer and
 * B2B-partner portal users are ordinary `User` rows (`userType` REFERRER /
 * B2B_PARTNER) that pass that check, so any route that returns internal data
 * must call one of these. Fails closed: missing session, missing flags or an
 * unknown userType all deny.
 */

import { decideAccess, type GuardUser, type GuardLevel } from './access-decision';

export type { GuardUser, GuardLevel, GuardDecision } from './access-decision';
export { decideAccess } from './access-decision';

/** `response` is set (and `user` null) when access is denied: `if (guard.response) return guard.response;` */
export type GuardResult<U> = { user: U | null; response: NextResponse | null };

async function guard(level: GuardLevel): Promise<GuardResult<GuardUser & { id: string }>> {
    const session = await auth();
    const user = session?.user as GuardUser | undefined;
    const decision = decideAccess(user, level);
    if (!decision.ok) {
        return {
            user: null,
            response: NextResponse.json({ error: decision.error }, { status: decision.status }),
        };
    }
    return { user: user as GuardUser & { id: string }, response: null };
}

/** Internal staff only — rejects referrer / B2B-partner portal users. */
export const requireStaff = () => guard('staff');
/** Staff with isAdmin, isExecutive, isSeniorManager or isManager. */
export const requireManager = () => guard('manager');
/** Staff with isAdmin. */
export const requireAdmin = () => guard('admin');
