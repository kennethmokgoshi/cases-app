import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@zenowethu/shared-lib/src/auth/route-guards', () => ({
    requireStaff: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib/src/financer', async () => {
    const { z } = await import('zod');
    return {
        // Mirror of the real schema (the real module pulls in Prisma). The real
        // schema's own rules are covered in repossession-enquiry.test.ts.
        RepossessionEnquiryInputSchema: z.object({
            action: z.enum(['preview', 'send']),
            creditAccountId: z.string().min(1, 'Choose the vehicle account'),
            vehicleDescription: z.string().optional(),
            registrationNumber: z.string().optional(),
            recipientEmail: z.string().email('Enter a valid financer email address'),
            replyWithinBusinessDays: z.number().int().default(5),
            pauseBusinessDays: z.number().int().default(10),
            saveContact: z.boolean().default(false),
        }),
        prepareRepossessionEnquiry: vi.fn(),
        processRepossessionEnquiry: vi.fn(),
    };
});

import { NextResponse } from 'next/server';
import { requireStaff } from '@zenowethu/shared-lib/src/auth/route-guards';
import { prepareRepossessionEnquiry, processRepossessionEnquiry } from '@zenowethu/shared-lib/src/financer';
import { GET, POST } from './route';

const params = Promise.resolve({ id: 'case-1' });

const post = (body: unknown) =>
    new Request('http://localhost/api/cases/case-1/repossession-enquiry', {
        method: 'POST',
        body: JSON.stringify(body),
    });

const VALID = {
    action: 'send',
    creditAccountId: 'acc-1',
    recipientEmail: 'collections@wesbank.example',
};

describe('/api/cases/[id]/repossession-enquiry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireStaff).mockResolvedValue({ user: { id: 'staff-1' }, response: null } as never);
    });

    describe('GET', () => {
        it('blocks users who are not staff', async () => {
            vi.mocked(requireStaff).mockResolvedValueOnce({
                user: null,
                response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
            } as never);

            const res = await GET(new Request('http://localhost'), { params });

            expect(res.status).toBe(401);
            expect(prepareRepossessionEnquiry).not.toHaveBeenCalled();
        });

        it('returns the modal context', async () => {
            vi.mocked(prepareRepossessionEnquiry).mockResolvedValue({ caseId: 'case-1', accounts: [] } as never);

            const res = await GET(new Request('http://localhost'), { params });

            expect(res.status).toBe(200);
            expect((await res.json()).caseId).toBe('case-1');
        });

        it('returns 404 for an unknown case', async () => {
            vi.mocked(prepareRepossessionEnquiry).mockResolvedValue(null);
            const res = await GET(new Request('http://localhost'), { params });
            expect(res.status).toBe(404);
        });
    });

    describe('POST', () => {
        it('blocks users who are not staff', async () => {
            vi.mocked(requireStaff).mockResolvedValueOnce({
                user: null,
                response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
            } as never);

            const res = await POST(post(VALID), { params });

            expect(res.status).toBe(403);
            expect(processRepossessionEnquiry).not.toHaveBeenCalled();
        });

        it('rejects an invalid email with a readable message', async () => {
            const res = await POST(post({ ...VALID, recipientEmail: 'nope' }), { params });

            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Enter a valid financer email address');
            expect(processRepossessionEnquiry).not.toHaveBeenCalled();
        });

        it('rejects a request with no account chosen', async () => {
            const res = await POST(post({ ...VALID, creditAccountId: '' }), { params });
            expect(res.status).toBe(400);
        });

        it('sends and attributes the action to the signed-in staff member', async () => {
            vi.mocked(processRepossessionEnquiry).mockResolvedValue({
                ok: true,
                sent: true,
                letter: { subject: 's', body: 'b', to: 'x', replyBy: '14 October 2026', pauseUntil: '21 October 2026' },
                mandateSummary: 'signed POA + ID copy attached',
            });

            const res = await POST(post(VALID), { params });
            const body = await res.json();

            expect(res.status).toBe(200);
            expect(body.sent).toBe(true);
            expect(processRepossessionEnquiry).toHaveBeenCalledWith(
                expect.objectContaining({ caseId: 'case-1', actorUserId: 'staff-1' })
            );
        });

        it('returns 422 with the missing documents when the mandate is incomplete', async () => {
            vi.mocked(processRepossessionEnquiry).mockResolvedValue({
                ok: false,
                sent: false,
                failure: 'MANDATE_INCOMPLETE',
                error: 'Cannot send: the case has no signed POA.',
                missingMandate: ['POA'],
            });

            const res = await POST(post(VALID), { params });
            const body = await res.json();

            expect(res.status).toBe(422);
            expect(body.missingMandate).toEqual(['POA']);
        });

        it('returns 502 when the email provider fails', async () => {
            vi.mocked(processRepossessionEnquiry).mockResolvedValue({
                ok: false,
                sent: false,
                failure: 'SEND_FAILED',
                error: 'SMTP down',
            });

            const res = await POST(post(VALID), { params });
            expect(res.status).toBe(502);
        });
    });
});
