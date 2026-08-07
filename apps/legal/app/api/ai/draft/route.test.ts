import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case: { findUnique: vi.fn() },
        legalLetter: { create: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    draftLegalDocument: vi.fn(),
    getAutonomyDecision: vi.fn(),
    sendManualMessage: vi.fn(),
}));

import type { NextRequest } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, draftLegalDocument, getAutonomyDecision, sendManualMessage } from '@zenowethu/shared-lib';
import { POST } from './route';

const db = prisma as unknown as {
    case: { findUnique: ReturnType<typeof vi.fn> };
    legalLetter: { create: ReturnType<typeof vi.fn> };
    caseComment: { create: ReturnType<typeof vi.fn> };
};
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockedDraft = draftLegalDocument as unknown as ReturnType<typeof vi.fn>;
const mockedAutonomy = getAutonomyDecision as unknown as ReturnType<typeof vi.fn>;
const mockedSend = sendManualMessage as unknown as ReturnType<typeof vi.fn>;

function request(body: Record<string, unknown>): NextRequest {
    return new Request('https://legal.zenowethu.co.za/api/ai/draft', {
        method: 'POST',
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

const baseCase = {
    id: 'case-1',
    client: {
        firstName: 'Sipho',
        lastName: 'Dlamini',
        idNumber: '8001015009087',
        address: '1 Main Street',
        email: 'sipho@example.com',
    },
    fileNumber: 'ZDM-2026-001',
    documents: [
        { id: 'doc1', type: 'ID', fileUrl: '/uploads/case-1/id.pdf' },
        { id: 'doc2', type: 'ZENOWETHU_POA', fileUrl: '/uploads/case-1/poa.pdf' },
    ],
    LegalMatter: [{ id: 'matter-1', matterType: 'PRESCRIPTION', creditorName: 'ABC Bank', accountNumber: '12345' }],
};

const draftResult = {
    subject: 'Notice of Prescription — Sipho Dlamini',
    content: 'Dear ABC Bank, ...',
    recipientName: 'ABC Bank',
    recipientDetails: 'disputes@abcbank.co.za',
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.CASES_APP_URL = 'https://cases.zenowethu.co.za';
    mockedAuth.mockResolvedValue({ user: { id: 'staff1' } });
    db.case.findUnique.mockResolvedValue(baseCase);
    db.legalLetter.create.mockImplementation(async ({ data }: any) => ({ id: 'letter-1', ...data }));
    db.caseComment.create.mockResolvedValue({});
    mockedDraft.mockResolvedValue(draftResult);
    mockedSend.mockResolvedValue({ emailSuccess: true, errors: [] });
});

describe('POST /api/ai/draft — prescribed account dispute (PRESCRIPTION_NOTICE)', () => {
    it('attaches the signed POA and ID when autopilot sends the letter to the creditor', async () => {
        mockedAutonomy.mockResolvedValue({ shouldExecute: true, reason: 'autopilot', level: 'AUTOPILOT' });

        const res = await POST(request({ caseId: 'case-1', documentType: 'PRESCRIPTION_NOTICE' }));
        expect(res.status).toBe(200);

        expect(mockedSend).toHaveBeenCalledTimes(1);
        const [, channel, recipient, , , options] = mockedSend.mock.calls[0];
        expect(channel).toBe('EMAIL');
        expect(recipient).toBe('disputes@abcbank.co.za');
        expect(options.attachments).toEqual([
            'https://cases.zenowethu.co.za/uploads/case-1/id.pdf',
            'https://cases.zenowethu.co.za/uploads/case-1/poa.pdf',
        ]);
    });

    it('does not send anything when the autonomy decision is manual/co-pilot', async () => {
        mockedAutonomy.mockResolvedValue({ shouldExecute: false, reason: 'manual', level: 'MANUAL' });

        const res = await POST(request({ caseId: 'case-1', documentType: 'PRESCRIPTION_NOTICE' }));
        expect(res.status).toBe(200);
        expect(mockedSend).not.toHaveBeenCalled();
    });

    it('sends with an empty attachments list when the case has no POA/ID on file yet', async () => {
        db.case.findUnique.mockResolvedValue({ ...baseCase, documents: [] });
        mockedAutonomy.mockResolvedValue({ shouldExecute: true, reason: 'autopilot', level: 'AUTOPILOT' });

        await POST(request({ caseId: 'case-1', documentType: 'PRESCRIPTION_NOTICE' }));

        const [, , , , , options] = mockedSend.mock.calls[0];
        expect(options.attachments).toEqual([]);
    });
});
