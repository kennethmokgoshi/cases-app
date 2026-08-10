import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@zenowethu/shared-lib';
import { sendEmailWithAttachments } from '@/lib/email-with-attachments';

vi.mock('@zenowethu/database', () => ({
    prisma: {
        case:        { findUnique: vi.fn() },
        user:        { findUnique: vi.fn() },
        document:    { create: vi.fn() },
        caseComment: { create: vi.fn() },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    renderBrandedEmail: (html: string) => html,
    touchCaseAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@zenowethu/shared-lib/src/poa/poa-generator', () => ({
    generateStandardPoa: vi.fn().mockResolvedValue(Buffer.from('standard-pdf')),
    generateWesbankPoa:  vi.fn().mockResolvedValue(Buffer.from('wesbank-pdf')),
}));

vi.mock('@zenowethu/shared-lib/src/poa/signing-service', () => ({
    createPoaSigningToken: vi.fn().mockResolvedValue('tok_123'),
}));

vi.mock('@zenowethu/shared-lib/src/integrations/ghl-service', () => ({
    GhlService: { sendMessage: vi.fn() },
}));

vi.mock('@/lib/email-with-attachments', () => ({
    sendEmailWithAttachments: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir:     vi.fn().mockResolvedValue(undefined),
}));

const CLIENT = {
    id: 'client-1',
    firstName: 'Mlangeni',
    lastName:  'Nthabiseng',
    idNumber:  '8001015009087',
    email:     'client@example.com',
    phone:     '0781545353',
    whatsappNumber: null,
    address:   '1 Central Road',
};

const CASE_RECORD = {
    id: 'case-1',
    debtCounsellorName: 'Some DC',
    ncrdcNo: 'NCRDC1234',
    dcMobile: '0820000000',
    client: CLIENT,
    jointClient: null,
};

function makeRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/cases/case-1/poa', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });
}

const params = { params: Promise.resolve({ id: 'case-1' }) };

describe('POST /api/cases/[id]/poa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', name: 'Staff' } } as never);
        vi.mocked(prisma.case.findUnique).mockResolvedValue(CASE_RECORD as never);
        vi.mocked(prisma.document.create).mockResolvedValue({ id: 'doc-1' } as never);
        vi.mocked(prisma.caseComment.create).mockResolvedValue({ id: 'comment-1' } as never);
    });

    it('returns 401 when not signed in', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);

        const res = await POST(makeRequest({ type: 'STANDARD', channel: 'EMAIL' }), params);

        expect(res.status).toBe(401);
    });

    it('rejects a send with no channel', async () => {
        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SEND' }), params);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/Channel is required/i);
    });

    it('saves the POA to case documents without sending', async () => {
        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SAVE' }), params);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.savedDocuments).toHaveLength(1);
        expect(json.savedDocuments[0].fileUrl).toContain('/uploads/case-1/');
        expect(sendEmailWithAttachments).not.toHaveBeenCalled();

        expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ caseId: 'case-1', type: 'ZENOWETHU_POA', mimeType: 'application/pdf' }),
        }));
    });

    it('saves without a channel even when the client has no contact details', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValueOnce({
            ...CASE_RECORD,
            client: { ...CLIENT, email: null, phone: null },
        } as never);

        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SAVE' }), params);

        expect(res.status).toBe(200);
        expect((await res.json()).savedDocuments).toHaveLength(1);
    });

    it('sends and saves in one request', async () => {
        vi.mocked(sendEmailWithAttachments).mockResolvedValueOnce({ success: true, messageId: 'm1' });

        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SEND_AND_SAVE', channel: 'EMAIL' }), params);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.sentTo).toEqual(['Mlangeni Nthabiseng']);
        expect(json.savedDocuments).toHaveLength(1);
    });

    it('reports failure — not success — when the email cannot be delivered', async () => {
        vi.mocked(sendEmailWithAttachments).mockResolvedValueOnce({ success: false, error: 'Invalid login' });

        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SEND', channel: 'EMAIL' }), params);
        const json = await res.json();

        expect(res.status).toBe(502);
        expect(json.success).toBe(false);
        expect(json.sentTo).toBeUndefined();
        expect(json.failures[0]).toEqual({
            name: 'Mlangeni Nthabiseng',
            reason: 'Email delivery failed: Invalid login',
        });
    });

    it('still succeeds when the save works but the send fails', async () => {
        vi.mocked(sendEmailWithAttachments).mockResolvedValueOnce({ success: false, error: 'SMTP down' });

        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SEND_AND_SAVE', channel: 'EMAIL' }), params);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.savedDocuments).toHaveLength(1);
        expect(json.sentTo).toBeUndefined();
        expect(json.failures).toHaveLength(1);
    });

    it('returns 422 with missing fields for a Wesbank POA when the staff profile is incomplete', async () => {
        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
            firstName: 'Staff', lastName: 'Member', phone: null, idNumber: null, address: null,
        } as never);

        const res = await POST(makeRequest({ type: 'WESBANK', mode: 'SAVE' }), params);
        const json = await res.json();

        expect(res.status).toBe(422);
        expect(json.missingFields).toEqual(['ID Number', 'Residential Address', 'Phone Number']);
    });

    it('returns 404 for an unknown case', async () => {
        vi.mocked(prisma.case.findUnique).mockResolvedValueOnce(null as never);

        const res = await POST(makeRequest({ type: 'STANDARD', mode: 'SAVE' }), params);

        expect(res.status).toBe(404);
    });
});
