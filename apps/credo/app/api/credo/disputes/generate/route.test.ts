import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { prisma } from '@zenowethu/database';
import { auth } from '@/auth';
import { generateDisputeLetter } from '@zenowethu/shared-lib';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
    prisma: {
        consumerAccount: {
            findUnique: vi.fn(),
        },
        credoDocument: {
            create: vi.fn(),
        },
    },
}));

vi.mock('@zenowethu/shared-lib', () => ({
    generateDisputeLetter: vi.fn(),
}));

describe('POST /api/credo/disputes/generate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 if user is not authenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null);
        const req = new NextRequest('http://localhost/api', { method: 'POST' });
        
        const response = await POST(req);
        
        expect(response.status).toBe(401);
    });

    it('returns 404 if consumer not found', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue(null);
        const req = new NextRequest('http://localhost/api', { method: 'POST' });
        
        const response = await POST(req);
        
        expect(response.status).toBe(404);
    });

    it('returns 422 for invalid body', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue({ id: 'user-123' } as any);
        const req = new NextRequest('http://localhost/api', { 
            method: 'POST',
            body: JSON.stringify({ type: 'INVALID_TYPE' }) // Missing required fields
        });
        
        const response = await POST(req);
        
        expect(response.status).toBe(422);
    });

    it('generates PDF and creates document record on success', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'user-123' } } as any);
        vi.mocked(prisma.consumerAccount.findUnique).mockResolvedValue({ 
            id: 'user-123',
            firstName: 'John',
            lastName: 'Doe',
            idNumber: '9001015009087'
        } as any);
        
        // Mock PDF bytes
        vi.mocked(generateDisputeLetter).mockResolvedValue(new Uint8Array([1, 2, 3]));
        vi.mocked(prisma.credoDocument.create).mockResolvedValue({} as any);

        const req = new NextRequest('http://localhost/api', { 
            method: 'POST',
            body: JSON.stringify({ 
                type: 'PRESCRIBED_DEBT_NOTICE',
                creditorName: 'Test Bank',
                accountNumber: '123456',
                disputeGrounds: ['Test ground']
            })
        });
        
        const response = await POST(req);
        const json = await response.json();
        
        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        
        expect(generateDisputeLetter).toHaveBeenCalledWith('PRESCRIBED_DEBT_NOTICE', expect.objectContaining({
            clientFullName: 'John Doe',
            clientIdNumber: '9001015009087',
            creditorName: 'Test Bank',
            accountNumber: '123456',
            disputeGrounds: ['Test ground']
        }));
        
        expect(prisma.credoDocument.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                consumerId: 'user-123',
                mimeType: 'application/pdf',
                size: 3,
                category: 'DISPUTE_LETTER'
            })
        }));
    });
});
