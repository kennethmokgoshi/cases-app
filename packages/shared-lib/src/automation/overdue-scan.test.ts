import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            findMany: vi.fn(),
            update: vi.fn(),
        },
        user: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
        workflowLog: {
            create: vi.fn(),
        },
        caseComment: {
            create: vi.fn(),
        },
        inAppNotification: {
            createMany: vi.fn(),
        },
    },
}));

vi.mock('../notifications/service', () => ({
    sendStatusChangeNotification: vi.fn().mockResolvedValue({
        emailSuccess: true,
        smsSuccess: false,
        whatsappSuccess: false,
        telegramSuccess: false,
        errors: [],
    }),
}));

import { prisma } from '@zenowethu/database';
import { sendStatusChangeNotification } from '../notifications/service';
import { runOverdueScan } from './overdue-scan';

// Helper to create a mock case
function makeMockCase(overrides: Record<string, unknown> = {}) {
    const statusEntryDate = new Date();
    statusEntryDate.setDate(statusEntryDate.getDate() - 10); // 10 days ago

    return {
        id: 'case-001',
        fileNumber: 'ZEN-001',
        status: 'REQUESTED_VIA_DHS',
        statusEntryDate,
        nextUpdate: null,
        isOverdue: false,
        daysInStatus: 0,
        acquisitionType: 'B2B',
        partnerName: 'Letsatsi',
        services: JSON.stringify(['debt_review_flag_removal']),
        assignedToId: null,
        dcEmail: 'dc@example.com',
        lastKnownEmail: null,
        debtCounsellorName: 'Test DC',
        client: {
            id: 'client-001',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phone: '0821234567',
            idNumber: '8001015009087',
        },
        workflowLogs: [],
        ...overrides,
    };
}

describe('runOverdueScan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'admin-001' });
        (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'admin-001' }]);
        (prisma.case.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
        (prisma.workflowLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
        (prisma.caseComment.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
        (prisma.inAppNotification.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
    });

    it('sends DC follow-up email when REQUESTED_VIA_DHS SLA exceeded', async () => {
        const mockCase = makeMockCase({ status: 'REQUESTED_VIA_DHS' }); // SLA is 7 days, we're at 10
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCase]);

        const result = await runOverdueScan();

        expect(result.overdueFound).toBe(1);
        expect(result.dcFollowups).toBe(1);
        expect(result.actioned).toBe(1);
        expect(sendStatusChangeNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 'REQUEST_FILE_DC',
                dcEmail: 'dc@example.com',
                caseId: 'case-001',
            })
        );
    });

    it('sends consumer follow-up when OUTSTANDING_DOCS SLA exceeded', async () => {
        const mockCase = makeMockCase({ status: 'OUTSTANDING_DOCS', dcEmail: null }); // SLA is 5 days
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCase]);

        const result = await runOverdueScan();

        expect(result.consumerFollowups).toBe(1);
        expect(sendStatusChangeNotification).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 'OUTSTANDING_DOCS',
                clientEmail: 'john@example.com',
            })
        );
    });

    it('creates staff alert for DECLINED_VIA_DHS', async () => {
        const mockCase = makeMockCase({ status: 'DECLINED_VIA_DHS' }); // SLA is 3 days, we're at 10
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCase]);

        const result = await runOverdueScan();

        expect(result.staffAlerts).toBe(1);
        expect(prisma.inAppNotification.createMany).toHaveBeenCalled();
        // No email to DC or consumer for staff-alert type
        expect(sendStatusChangeNotification).not.toHaveBeenCalled();
    });

    it('skips DC follow-up if already sent within cooldown period', async () => {
        const recentLog = {
            action: 'OVERDUE_DC_FOLLOWUP',
            timestamp: new Date(), // sent today
        };
        const mockCase = makeMockCase({
            status: 'REQUESTED_VIA_DHS',
            workflowLogs: [recentLog],
        });
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCase]);

        const result = await runOverdueScan();

        expect(result.skipped).toBe(1);
        expect(result.actioned).toBe(0);
        expect(sendStatusChangeNotification).not.toHaveBeenCalled();
    });

    it('skips cases not yet past SLA', async () => {
        const recentStatusEntry = new Date(); // just now — 0 days in status
        const mockCase = makeMockCase({
            status: 'REQUESTED_VIA_DHS',
            statusEntryDate: recentStatusEntry,
        });
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCase]);

        const result = await runOverdueScan();

        expect(result.overdueFound).toBe(0);
        expect(result.actioned).toBe(0);
    });

    it('skips CANCELLED cases entirely', async () => {
        const mockCase = makeMockCase({ status: 'CANCELLED' });
        // CANCELLED is in SKIP_CODES so the DB query excludes it — simulate empty result
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await runOverdueScan();

        expect(result.scanned).toBe(0);
        expect(result.overdueFound).toBe(0);
    });

    it('falls back to staff alert when DC follow-up has no DC email', async () => {
        const mockCase = makeMockCase({
            status: 'REQUESTED_VIA_DHS',
            dcEmail: null,
            lastKnownEmail: null,
        });
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockCase]);

        const result = await runOverdueScan();

        // Skipped DC followup, but staff alert created
        expect(result.skipped).toBe(1);
        expect(sendStatusChangeNotification).not.toHaveBeenCalled();
        expect(prisma.inAppNotification.createMany).toHaveBeenCalled();
    });

    it('returns correct summary counts for multiple cases', async () => {
        const cases = [
            makeMockCase({ id: 'c1', fileNumber: 'Z-001', status: 'REQUESTED_VIA_DHS' }),
            makeMockCase({ id: 'c2', fileNumber: 'Z-002', status: 'OUTSTANDING_DOCS', dcEmail: null }),
            makeMockCase({ id: 'c3', fileNumber: 'Z-003', status: 'DECLINED_VIA_DHS' }),
        ];
        (prisma.case.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(cases);

        const result = await runOverdueScan();

        expect(result.scanned).toBe(3);
        expect(result.overdueFound).toBe(3);
        expect(result.dcFollowups).toBe(1);
        expect(result.consumerFollowups).toBe(1);
        expect(result.staffAlerts).toBe(1);
        expect(result.actioned).toBe(3);
    });
});
