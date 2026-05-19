import { describe, it, expect } from 'vitest';

// Inline the filtering logic so we can test it without Prisma
interface Comment {
    activityType: string;
    activityData: string | null;
    content: string;
    isInternal: boolean;
    createdAt: Date;
}

interface TestCase {
    id: string;
    fileNumber: string;
    status: string;
    client: { firstName: string; lastName: string; email: string | null; phone: string | null } | null;
    comments: Comment[];
}

function filterUnanswered(cases: TestCase[], thresholdMs: number, now: Date) {
    const threshold = new Date(now.getTime() - thresholdMs);

    return cases.filter(c => {
        const inbound = c.comments
            .filter(cm => cm.activityType === 'INBOUND_MESSAGE')
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        if (inbound.length === 0) return false;
        const latestInbound = inbound[0];
        if (latestInbound.createdAt > threshold) return false; // too recent to flag yet

        return !c.comments.some(
            cm => cm.activityType === 'AUTO_REPLY' && cm.createdAt > latestInbound.createdAt
        );
    });
}

const NOW = new Date('2026-05-19T10:00:00Z');
const THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

function hoursAgo(h: number) {
    return new Date(NOW.getTime() - h * 60 * 60 * 1000);
}

describe('unanswered emails filter', () => {
    it('flags a case with an old inbound and no auto-reply', () => {
        const cases: TestCase[] = [{
            id: 'case-1', fileNumber: 'ZN001', status: 'ACTIVE',
            client: { firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: null },
            comments: [
                { activityType: 'INBOUND_MESSAGE', activityData: null, content: 'Hello', isInternal: false, createdAt: hoursAgo(5) },
            ],
        }];

        const result = filterUnanswered(cases, THRESHOLD_MS, NOW);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('case-1');
    });

    it('does NOT flag a case where auto-reply was sent after the inbound', () => {
        const inboundAt = hoursAgo(5);
        const cases: TestCase[] = [{
            id: 'case-2', fileNumber: 'ZN002', status: 'ACTIVE',
            client: null,
            comments: [
                { activityType: 'INBOUND_MESSAGE', activityData: null, content: 'Hello', isInternal: false, createdAt: inboundAt },
                { activityType: 'AUTO_REPLY',      activityData: null, content: 'Hi!',   isInternal: true,  createdAt: hoursAgo(4) },
            ],
        }];

        const result = filterUnanswered(cases, THRESHOLD_MS, NOW);
        expect(result).toHaveLength(0);
    });

    it('does NOT flag a case where inbound is too recent (within threshold)', () => {
        const cases: TestCase[] = [{
            id: 'case-3', fileNumber: 'ZN003', status: 'ACTIVE',
            client: null,
            comments: [
                { activityType: 'INBOUND_MESSAGE', activityData: null, content: 'Hello', isInternal: false, createdAt: hoursAgo(1) },
            ],
        }];

        const result = filterUnanswered(cases, THRESHOLD_MS, NOW);
        expect(result).toHaveLength(0);
    });

    it('flags when there is an auto-reply BEFORE the latest inbound (reply to older message)', () => {
        // Client sent a new message after the auto-reply — still unanswered
        const firstInbound = hoursAgo(8);
        const autoReply    = hoursAgo(7);
        const secondInbound = hoursAgo(5);

        const cases: TestCase[] = [{
            id: 'case-4', fileNumber: 'ZN004', status: 'ACTIVE',
            client: null,
            comments: [
                { activityType: 'INBOUND_MESSAGE', activityData: null, content: 'First',  isInternal: false, createdAt: firstInbound },
                { activityType: 'AUTO_REPLY',      activityData: null, content: 'Reply',  isInternal: true,  createdAt: autoReply },
                { activityType: 'INBOUND_MESSAGE', activityData: null, content: 'Second', isInternal: false, createdAt: secondInbound },
            ],
        }];

        const result = filterUnanswered(cases, THRESHOLD_MS, NOW);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('case-4');
    });

    it('does NOT flag a case with no inbound messages', () => {
        const cases: TestCase[] = [{
            id: 'case-5', fileNumber: 'ZN005', status: 'ACTIVE',
            client: null,
            comments: [
                { activityType: 'NOTE', activityData: null, content: 'Internal note', isInternal: true, createdAt: hoursAgo(3) },
            ],
        }];

        const result = filterUnanswered(cases, THRESHOLD_MS, NOW);
        expect(result).toHaveLength(0);
    });

    it('sorts by urgency — longest wait first when sort applied', () => {
        const cases: TestCase[] = [
            {
                id: 'case-newer', fileNumber: 'ZN006', status: 'ACTIVE',
                client: null,
                comments: [{ activityType: 'INBOUND_MESSAGE', activityData: null, content: 'Hi', isInternal: false, createdAt: hoursAgo(3) }],
            },
            {
                id: 'case-older', fileNumber: 'ZN007', status: 'ACTIVE',
                client: null,
                comments: [{ activityType: 'INBOUND_MESSAGE', activityData: null, content: 'Hi', isInternal: false, createdAt: hoursAgo(10) }],
            },
        ];

        const result = filterUnanswered(cases, THRESHOLD_MS, NOW)
            .sort((a, b) => {
                const aInbound = a.comments.filter(c => c.activityType === 'INBOUND_MESSAGE')[0];
                const bInbound = b.comments.filter(c => c.activityType === 'INBOUND_MESSAGE')[0];
                return aInbound.createdAt.getTime() - bInbound.createdAt.getTime(); // oldest first
            });

        expect(result[0].id).toBe('case-older');
        expect(result[1].id).toBe('case-newer');
    });
});
