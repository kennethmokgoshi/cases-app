import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/finance/fee-document-service', () => ({
    sendFeeDocument: vi.fn(),
}));

import { POST } from './route';
import { auth } from '@zenowethu/shared-lib';
import { sendFeeDocument } from '@zenowethu/shared-lib/src/finance/fee-document-service';

const mockAuth = vi.mocked(auth);
const mockSend = vi.mocked(sendFeeDocument);

const ctx = { params: Promise.resolve({ id: 'case-1', documentId: 'doc-1' }) };
const request = (body: unknown) =>
    new Request('http://localhost/api/cases/case-1/fee-documents/doc-1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('POST /api/cases/[id]/fee-documents/[documentId]/send', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never);
    });

    it('401 when signed out', async () => {
        mockAuth.mockResolvedValue(null as never);
        const res = await POST(request({}), ctx);
        expect(res.status).toBe(401);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends and returns the status change', async () => {
        mockSend.mockResolvedValue({ ok: true, recipient: 'jane@dc.test', statusChange: { moved: true, toStatus: 'POP_SENT_TO_DC' } });

        const res = await POST(request({ note: 'Paid in full' }), ctx);

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true, recipient: 'jane@dc.test' });
        expect(mockSend).toHaveBeenCalledWith({ caseId: 'case-1', documentId: 'doc-1', note: 'Paid in full', userId: 'u1' });
    });

    it('maps a failed email to 502 and a missing recipient to 422', async () => {
        mockSend.mockResolvedValueOnce({ ok: false, failure: 'SEND_FAILED', error: 'SMTP down' });
        expect((await POST(request({}), ctx)).status).toBe(502);

        mockSend.mockResolvedValueOnce({ ok: false, failure: 'NO_RECIPIENT', error: 'No DC email' });
        const res = await POST(request({}), ctx);
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ error: 'No DC email', failure: 'NO_RECIPIENT' });
    });

    it('422 on an invalid body', async () => {
        const res = await POST(request({ note: 'x'.repeat(3000) }), ctx);
        expect(res.status).toBe(422);
        expect(mockSend).not.toHaveBeenCalled();
    });
});
