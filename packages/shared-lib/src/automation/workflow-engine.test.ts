import { describe, it, expect, vi, beforeEach } from 'vitest';
import { touchCaseAction, getDHSDocuments, getDHSDocumentUrls, hasDocument, type OverdueCase } from './workflow-engine';
import { prisma } from '@zenowethu/database';
import { addWorkingDays } from '../statuses/workingDays';

// Mock prisma client
vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: {
            update: vi.fn(),
        },
    },
}));

// getDHSDocuments checks the file actually exists on disk — assume present for these tests.
vi.mock('fs', () => ({
    existsSync: vi.fn(() => true),
}));

// Mock workingDays to isolate tests
vi.mock('../statuses/workingDays', () => ({
    addWorkingDays: vi.fn((date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }),
}));

// Mock statuses config
vi.mock('../statuses/statuses', () => ({
    getStatusByCode: vi.fn((code: string) => {
        if (code === 'NEW_LEAD') {
            return { code: 'NEW_LEAD', name: 'New Lead', category: 'BEGINNING', slaEnabled: true, slaDays: 2 };
        }
        if (code === 'NO_SLA_STATUS') {
            return { code: 'NO_SLA_STATUS', name: 'No SLA', category: 'BEGINNING', slaEnabled: false };
        }
        return null;
    }),
}));

describe('touchCaseAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calculates 7 working days for COMMENT action', async () => {
        const caseId = 'case-123';
        const userId = 'user-456';
        
        await touchCaseAction(caseId, 'COMMENT', { userId });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 7);
        expect(prisma.case.update).toHaveBeenCalledWith({
            where: { id: caseId },
            data: {
                updatedAt: expect.any(Date),
                nextUpdate: expect.any(Date),
                updatedById: userId,
            },
        });
    });

    it('calculates status-specific SLA days for STATUS_CHANGE action', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'STATUS_CHANGE', { status: 'NEW_LEAD' });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 2);
    });

    it('falls back to 7 days for STATUS_CHANGE if status has no SLA config', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'STATUS_CHANGE', { status: 'NO_SLA_STATUS' });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 7);
    });

    it('calculates 3 days for DOCUMENT_UPLOAD action', async () => {
        const caseId = 'case-123';
        
        await touchCaseAction(caseId, 'DOCUMENT_UPLOAD');

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 3);
    });

    it('honors customDays if explicitly provided in options', async () => {
        const caseId = 'case-123';

        await touchCaseAction(caseId, 'OTHER', { customDays: 10 });

        expect(addWorkingDays).toHaveBeenCalledWith(expect.any(Date), 10);
    });
});

function makeCase(documents: OverdueCase['documents']): OverdueCase {
    return {
        id: 'case-1',
        fileNumber: 'ZW-001',
        status: 'NOT_REQUESTED_VIA_DHS',
        nextUpdate: null,
        dcEmail: null,
        dcTradingName: null,
        debtCounsellorName: null,
        ncrdcNo: null,
        acquisitionType: 'B2B',
        client: { id: 'client-1', firstName: 'Jane', lastName: 'Doe', idNumber: '9001015800086', email: null, phone: null, whatsappNumber: null },
        documents,
    };
}

describe('getDHSDocuments', () => {
    it('finds staff-uploaded ID/POA type codes', () => {
        const c = makeCase([
            { type: 'ID', fileName: 'id.pdf', fileUrl: '/uploads/id.pdf', uploadedAt: new Date() },
            { type: 'ZENOWETHU_POA', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', uploadedAt: new Date() },
        ]);
        const { idPath, poaPath } = getDHSDocuments(c);
        expect(idPath).not.toBeNull();
        expect(poaPath).not.toBeNull();
    });

    it('finds referrer-portal type codes (ID_DOCUMENT / POWER_OF_ATTORNEY)', () => {
        const c = makeCase([
            { type: 'ID_DOCUMENT', fileName: 'id.pdf', fileUrl: '/uploads/id.pdf', uploadedAt: new Date() },
            { type: 'POWER_OF_ATTORNEY', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', uploadedAt: new Date() },
        ]);
        const { idPath, poaPath } = getDHSDocuments(c);
        expect(idPath).not.toBeNull();
        expect(poaPath).not.toBeNull();
    });

    it('accepts CONSENT_FORM as a POA-equivalent type', () => {
        const c = makeCase([
            { type: 'ID_DOCUMENT', fileName: 'id.pdf', fileUrl: '/uploads/id.pdf', uploadedAt: new Date() },
            { type: 'CONSENT_FORM', fileName: 'consent.pdf', fileUrl: '/uploads/consent.pdf', uploadedAt: new Date() },
        ]);
        const { poaPath } = getDHSDocuments(c);
        expect(poaPath).not.toBeNull();
    });

    it('returns null poaPath when no recognized type is present', () => {
        const c = makeCase([
            { type: 'ID', fileName: 'id.pdf', fileUrl: '/uploads/id.pdf', uploadedAt: new Date() },
            { type: 'BANK_STATEMENT', fileName: 'statement.pdf', fileUrl: '/uploads/statement.pdf', uploadedAt: new Date() },
        ]);
        const { poaPath } = getDHSDocuments(c);
        expect(poaPath).toBeNull();
    });
});

describe('getDHSDocumentUrls', () => {
    it('resolves referrer-portal document types the same way as getDHSDocuments', () => {
        const c = makeCase([
            { type: 'ID_DOCUMENT', fileName: 'id.pdf', fileUrl: '/uploads/id.pdf', uploadedAt: new Date() },
            { type: 'POWER_OF_ATTORNEY', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', uploadedAt: new Date() },
        ]);
        const { idUrl, poaUrl } = getDHSDocumentUrls(c, 'https://app.zenowethu.co.za');
        expect(idUrl).toBe('https://app.zenowethu.co.za/uploads/id.pdf');
        expect(poaUrl).toBe('https://app.zenowethu.co.za/uploads/poa.pdf');
    });
});

describe('hasDocument', () => {
    it('matches by any of the provided type codes', () => {
        const c = makeCase([{ type: 'POWER_OF_ATTORNEY', fileName: 'poa.pdf', fileUrl: '/uploads/poa.pdf', uploadedAt: new Date() }]);
        expect(hasDocument(c, ['POA', 'ZENOWETHU_POA', 'POWER_OF_ATTORNEY', 'CONSENT_FORM'])).toBe(true);
    });

    it('falls back to filename keyword match when type does not match', () => {
        const c = makeCase([{ type: 'OTHER', fileName: 'signed-poa-consent.pdf', fileUrl: '/uploads/x.pdf', uploadedAt: new Date() }]);
        expect(hasDocument(c, ['POA'], ['poa'])).toBe(true);
    });

    it('returns false when neither type nor filename keyword match', () => {
        const c = makeCase([{ type: 'OTHER', fileName: 'unrelated.pdf', fileUrl: '/uploads/x.pdf', uploadedAt: new Date() }]);
        expect(hasDocument(c, ['POA'], ['poa'])).toBe(false);
    });
});
