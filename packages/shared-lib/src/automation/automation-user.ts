/**
 * System Automation User — "Kenny Mokgoshi"
 *
 * All Puppeteer/AI automation case updates are attributed to this dedicated
 * system user so the "Last Updated By" column shows a real name and timestamp
 * instead of "—". The account is created on first use, is locked
 * (isLocked: true) so it can never log in, and has a random unrecoverable
 * password.
 */

import { prisma } from '@zenowethu/database';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { createLogger } from '../logger';

const logger = createLogger('automation/automation-user');

export const AUTOMATION_USER_EMAIL = 'automation@zenowethu.co.za';
export const AUTOMATION_USER_USERNAME = 'kenny.mokgoshi';
export const AUTOMATION_USER_FIRST_NAME = 'Kenny';
export const AUTOMATION_USER_LAST_NAME = 'Mokgoshi';

let cachedUserId: string | null = null;

/** Test-only: reset the in-process cache. */
export function __resetAutomationUserCache(): void {
    cachedUserId = null;
}

/**
 * Returns the user ID of the "Kenny Mokgoshi" system automation user,
 * creating the user on first call. Returns null if the user cannot be
 * resolved (DB error) — callers should fall back to omitting attribution
 * rather than failing the automation run.
 */
export async function getAutomationUserId(): Promise<string | null> {
    if (cachedUserId) return cachedUserId;

    try {
        const existing = await prisma.user.findUnique({
            where: { email: AUTOMATION_USER_EMAIL },
            select: { id: true },
        });
        if (existing) {
            cachedUserId = existing.id;
            return existing.id;
        }

        const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
        try {
            const created = await prisma.user.create({
                data: {
                    username: AUTOMATION_USER_USERNAME,
                    firstName: AUTOMATION_USER_FIRST_NAME,
                    lastName: AUTOMATION_USER_LAST_NAME,
                    email: AUTOMATION_USER_EMAIL,
                    password,
                    isAdmin: false,
                    isLocked: true,
                    emailNotificationsEnabled: false,
                    userType: 'SYSTEM',
                    role: 'MEMBER',
                },
                select: { id: true },
            });
            logger.info(
                `Created system automation user "${AUTOMATION_USER_FIRST_NAME} ${AUTOMATION_USER_LAST_NAME}" (${created.id})`
            );
            cachedUserId = created.id;
            return created.id;
        } catch (createErr) {
            // Unique-constraint race: another process created the user between
            // our lookup and create — re-fetch instead of failing.
            const raced = await prisma.user.findUnique({
                where: { email: AUTOMATION_USER_EMAIL },
                select: { id: true },
            });
            if (raced) {
                cachedUserId = raced.id;
                return raced.id;
            }
            throw createErr;
        }
    } catch (err) {
        logger.error('Failed to resolve system automation user:', err);
        return null;
    }
}
