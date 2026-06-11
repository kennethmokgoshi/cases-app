import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
    auth: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        invoice: { findUnique: vi.fn(), delete: vi.fn() },
    },
    Prisma: {},
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { DELETE } from './route';

const params = Promise.resolve({ id: 'doc-1' });
const req = new Request('http://localhost/api/finance/invoices/doc-1', { method: 'DELETE' });

const staff = { user: { id: 'u1', isAdmin: false, isExecutive: false } };
const admin = { user: { id: 'u2', isAdmin: true, isExecutive: false } };
const exec = { user: { id: 'u3', isAdmin: false, isExecutive: true } };

const quote = { type: 'QUOTE', invoiceNumber: 'QUO-1', convertedToInvoiceId: null, _count: { payments: 0 } };
const invoice = { type: 'INVOICE', invoiceNumber: 'INV-1', convertedToInvoiceId: null, _count: { payments: 0 } };

describe('DELETE /api/finance/invoices/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.invoice.delete).mockResolvedValue({} as any);
    });

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth as any).mockResolvedValue(null);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(401);
        expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when the document does not exist', async () => {
        vi.mocked(auth as any).mockResolvedValue(staff);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(404);
    });

    it('lets a regular staff member delete a quote', async () => {
        vi.mocked(auth as any).mockResolvedValue(staff);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(quote as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(204);
        expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('blocks deleting a quote already converted to an invoice', async () => {
        vi.mocked(auth as any).mockResolvedValue(staff);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...quote, convertedToInvoiceId: 'inv-9' } as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(409);
        expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('forbids a regular staff member from deleting an invoice', async () => {
        vi.mocked(auth as any).mockResolvedValue(staff);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(403);
        expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('lets an admin delete an invoice', async () => {
        vi.mocked(auth as any).mockResolvedValue(admin);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(204);
        expect(prisma.invoice.delete).toHaveBeenCalled();
    });

    it('lets an executive delete an invoice', async () => {
        vi.mocked(auth as any).mockResolvedValue(exec);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(invoice as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(204);
    });

    it('blocks deleting an invoice that has recorded payments', async () => {
        vi.mocked(auth as any).mockResolvedValue(admin);
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ ...invoice, _count: { payments: 2 } } as any);
        const res = await DELETE(req, { params });
        expect(res.status).toBe(409);
        expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });
});
