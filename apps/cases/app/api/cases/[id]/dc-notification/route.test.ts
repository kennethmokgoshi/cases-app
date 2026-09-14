import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/dc', () => ({
    sendDcRequestNotification: vi.fn(),
}));

import { auth } from '@zenowethu/shared-lib';
import { sendDcRequestNotification } from '@zenowethu/shared-lib/src/dc';
import { POST } from './route';

const staff = { user: { id: 'staff-1' } };
const params = Promise.resolve({ id: 'case-1' });

const request = (body: unknown) =>
    new Request('http://localhost/api/cases/case-1/dc-notification', {
        method: 'POST',
        body: JSON.stringify(body),
    });

const sent = {
    ok: true,
    dcEmail: 'dc@firm.co.za',
    ccEmails: [],
    mandateSummary: 'signed POA + ID copy attached',
    missingMandate: [],
};

describe('POST /api/cases/[id]/dc-notification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue(staff as never);
        vi.mocked(sendDcRequestNotification).mockResolvedValue(sent as never);
    });

    it('returns 401 when signed out', async () => {
        vi.mocked(auth).mockResolvedValueOnce(null as never);

        const res = await POST(request({ type: 'INVOICE_REQUEST' }), { params });

        expect(res.status).toBe(401);
        expect(sendDcRequestNotification).not.toHaveBeenCalled();
    });

    it('rejects an unknown request type', async () => {
        const res = await POST(request({ type: 'SOMETHING_ELSE' }), { params });

        expect(res.status).toBe(400);
        expect(sendDcRequestNotification).not.toHaveBeenCalled();
    });

    it('sends the invoice request and reports the attached mandate', async () => {
        const res = await POST(request({ type: 'INVOICE_REQUEST' }), { params });
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.mandateSummary).toBe('signed POA + ID copy attached');
        expect(body.missingMandate).toEqual([]);
        expect(sendDcRequestNotification).toHaveBeenCalledWith({
            caseId: 'case-1',
            type: 'INVOICE_REQUEST',
            actorUserId: 'staff-1',
        });
    });

    it('passes the missing mandate back so staff can chase the document', async () => {
        vi.mocked(sendDcRequestNotification).mockResolvedValueOnce({
            ...sent,
            mandateSummary: 'ID copy attached; signed POA MISSING from the case',
            missingMandate: ['POA'],
        } as never);

        const body = await (await POST(request({ type: 'FILE_REQUEST' }), { params })).json();

        expect(body.missingMandate).toEqual(['POA']);
        expect(body.mandateSummary).toContain('signed POA MISSING');
    });

    it('maps a missing DC email to 400', async () => {
        vi.mocked(sendDcRequestNotification).mockResolvedValueOnce({
            ok: false,
            failure: 'NO_DC_EMAIL',
            error: 'Debt counsellor email not found',
            dcEmail: null,
            ccEmails: [],
            mandateSummary: '',
            missingMandate: [],
        } as never);

        const res = await POST(request({ type: 'INVOICE_REQUEST' }), { params });

        expect(res.status).toBe(400);
    });

    it('maps a missing case to 404 and a provider failure to 500', async () => {
        vi.mocked(sendDcRequestNotification).mockResolvedValueOnce({
            ok: false, failure: 'CASE_NOT_FOUND', error: 'Case not found',
            dcEmail: null, ccEmails: [], mandateSummary: '', missingMandate: [],
        } as never);
        expect((await POST(request({ type: 'FILE_REQUEST' }), { params })).status).toBe(404);

        vi.mocked(sendDcRequestNotification).mockResolvedValueOnce({
            ok: false, failure: 'SEND_FAILED', error: 'SMTP 550',
            dcEmail: 'dc@firm.co.za', ccEmails: [], mandateSummary: '', missingMandate: [],
        } as never);
        expect((await POST(request({ type: 'FILE_REQUEST' }), { params })).status).toBe(500);
    });
});
