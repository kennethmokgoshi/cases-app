import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger } from '@zenowethu/shared-lib';
import { auth } from '@zenowethu/shared-lib/src/auth';

const logger = createLogger('api/dashboard/unanswered-emails');

export interface UnansweredCase {
    caseId: string;
    fileNumber: string;
    status: string;
    clientName: string;
    clientEmail: string | null;
    clientPhone: string | null;
    lastInboundAt: Date;
    lastInboundContent: string;
    channel: string | null;
    hoursSinceInbound: number;
}

/**
 * Find cases where a client or DC sent an inbound message that has received no
 * subsequent auto-reply or staff reply within the configured threshold.
 * Staff use this to intervene manually when the AI declined to reply or a
 * complex query needs human attention.
 *
 * Query params:
 *   threshold   — hours before flagging (default 2)
 *   lookbackHours — how far back to search (default 48)
 */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const thresholdHours = Math.max(1, parseInt(searchParams.get('threshold') || '2'));
        const lookbackHours  = Math.max(1, parseInt(searchParams.get('lookbackHours') || '48'));

        const lookback   = new Date(Date.now() - lookbackHours  * 60 * 60 * 1000);
        const threshold  = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

        // Fetch cases that have at least one inbound message in the lookback window
        const cases = await prisma.case.findMany({
            where: {
                deletedAt: null,
                comments: {
                    some: {
                        activityType: 'INBOUND_MESSAGE',
                        isInternal:   false,
                        createdAt:    { gte: lookback },
                    },
                },
            },
            select: {
                id:         true,
                fileNumber: true,
                status:     true,
                client: {
                    select: {
                        firstName: true,
                        lastName:  true,
                        email:     true,
                        phone:     true,
                    },
                },
                comments: {
                    where: {
                        activityType: { in: ['INBOUND_MESSAGE', 'AUTO_REPLY'] },
                        createdAt:    { gte: lookback },
                    },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        activityType: true,
                        activityData: true,
                        content:      true,
                        isInternal:   true,
                        createdAt:    true,
                    },
                },
            },
        });

        const unanswered: UnansweredCase[] = [];

        for (const c of cases) {
            const inboundComments = c.comments.filter(cm => cm.activityType === 'INBOUND_MESSAGE');
            if (inboundComments.length === 0) continue;

            // Most recent inbound (comments are ordered desc)
            const latestInbound = inboundComments[0];

            // Only flag if older than the threshold (give the AI time to respond)
            if (latestInbound.createdAt > threshold) continue;

            // Flag if no auto-reply was sent AFTER this inbound message
            const hasReply = c.comments.some(
                cm => cm.activityType === 'AUTO_REPLY' && cm.createdAt > latestInbound.createdAt
            );
            if (hasReply) continue;

            let channel: string | null = null;
            try {
                const data = latestInbound.activityData ? JSON.parse(latestInbound.activityData) : null;
                channel = data?.channel ?? null;
            } catch {
                // activityData not parseable — leave channel null
            }

            const hoursSinceInbound = Math.floor(
                (Date.now() - latestInbound.createdAt.getTime()) / (1000 * 60 * 60)
            );

            unanswered.push({
                caseId:              c.id,
                fileNumber:          c.fileNumber,
                status:              c.status,
                clientName:          `${c.client?.firstName ?? ''} ${c.client?.lastName ?? ''}`.trim(),
                clientEmail:         c.client?.email ?? null,
                clientPhone:         c.client?.phone ?? null,
                lastInboundAt:       latestInbound.createdAt,
                lastInboundContent:  latestInbound.content,
                channel,
                hoursSinceInbound,
            });
        }

        // Sort most urgent (longest wait) first
        unanswered.sort((a, b) => b.hoursSinceInbound - a.hoursSinceInbound);

        logger.info(`[UnansweredEmails] Found ${unanswered.length} cases needing attention (threshold=${thresholdHours}h, lookback=${lookbackHours}h)`);

        return NextResponse.json({
            count:       unanswered.length,
            thresholdHours,
            lookbackHours,
            cases:       unanswered,
        });
    } catch (error: any) {
        logger.error('[UnansweredEmails] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch unanswered emails' }, { status: 500 });
    }
}
