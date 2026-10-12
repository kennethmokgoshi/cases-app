import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPoaSigningToken,
  resolveSigningToken,
  completePoaSigning,
  POA_TOKEN_TTL_HOURS,
} from './signing-service';
import { prisma } from '@zenowethu/database';

// Mock prisma
vi.mock('@zenowethu/database', () => ({
  prisma: {
    poaSigningRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    document: {
      create: vi.fn(),
    },
    credoDocument: {
      create: vi.fn(),
    },
    caseComment: {
      create: vi.fn(),
    },
  },
}));

describe('POA Signing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPoaSigningToken', () => {
    it('should create a signing token with correct expiry', async () => {
      const mockToken = 'test-token-12345';

      vi.mocked(prisma.poaSigningRequest.create).mockResolvedValueOnce({
        token: mockToken,
        id: 'sig-123',
        poaType: 'STANDARD',
        channel: 'EMAIL',
        caseId: 'case-1',
        clientId: 'client-1',
        consumerId: null,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        signedAt: null,
        signedPdfPath: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = await createPoaSigningToken({
        poaType: 'STANDARD',
        channel: 'EMAIL',
        caseId: 'case-1',
        clientId: 'client-1',
      });

      expect(token).toBe(mockToken);
      expect(prisma.poaSigningRequest.create).toHaveBeenCalledOnce();

      const callData = vi.mocked(prisma.poaSigningRequest.create).mock.calls[0][0];
      expect(callData.data).toMatchObject({
        poaType: 'STANDARD',
        channel: 'EMAIL',
        caseId: 'case-1',
        clientId: 'client-1',
        status: 'PENDING',
      });

      // Verify expiry is ~72 hours in future
      const expiresAtDate = callData.data.expiresAt instanceof Date
        ? callData.data.expiresAt
        : new Date(callData.data.expiresAt as string);
      const expiryTime = expiresAtDate.getTime();
      const nowTime = Date.now();
      const diffHours = (expiryTime - nowTime) / (60 * 60 * 1000);
      expect(diffHours).toBeGreaterThan(71);
      expect(diffHours).toBeLessThan(73);
    });
  });

  describe('resolveSigningToken', () => {
    it('should return token record if valid and not expired', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const mockRecord: any = {
        id: 'sig-123',
        token: 'valid-token',
        status: 'PENDING',
        poaType: 'STANDARD',
        channel: 'EMAIL',
        expiresAt: futureDate,
        signedAt: null,
        caseId: 'case-1',
        clientId: 'client-1',
        consumerId: null,
        client: {
          firstName: 'John',
          lastName: 'Doe',
          idNumber: '1234567890123',
          email: 'john@example.com',
          phone: '0712345678',
          address: '123 Main St',
        },
        consumer: null,
        case: {
          fileNumber: 'FILE001',
          debtCounsellorName: 'Jane Smith',
          ncrdcNo: 'NCRDC001',
          dcMobile: '0787654321',
        },
      };

      vi.mocked(prisma.poaSigningRequest.findUnique).mockResolvedValueOnce(mockRecord);

      const result = await resolveSigningToken('valid-token');

      expect('record' in result).toBe(true);
      if ('record' in result) {
        expect(result.record.status).toBe('PENDING');
        expect(result.record.client?.firstName).toBe('John');
      }
    });

    it('should return error if token not found', async () => {
      vi.mocked(prisma.poaSigningRequest.findUnique).mockResolvedValueOnce(null);

      const result = await resolveSigningToken('invalid-token');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.status).toBe(404);
        expect(result.error).toContain('not found');
      }
    });

    it('should mark token as expired if past expiry time', async () => {
      const pastDate = new Date(Date.now() - 1000);

      const mockRecord: any = {
        id: 'sig-123',
        token: 'expired-token',
        status: 'PENDING',
        poaType: 'STANDARD',
        channel: 'EMAIL',
        expiresAt: pastDate,
        signedAt: null,
        caseId: 'case-1',
        clientId: 'client-1',
        consumerId: null,
        client: null,
        consumer: null,
        case: null,
      };

      vi.mocked(prisma.poaSigningRequest.findUnique).mockResolvedValueOnce(mockRecord);

      const result = await resolveSigningToken('expired-token');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.status).toBe(410);
      }

      // Should have called update to mark as EXPIRED
      expect(prisma.poaSigningRequest.update).toHaveBeenCalledOnce();
      const updateCall = vi.mocked(prisma.poaSigningRequest.update).mock.calls[0][0];
      expect(updateCall.data.status).toBe('EXPIRED');
    });

    it('should reject if already signed', async () => {
      const mockRecord: any = {
        id: 'sig-123',
        token: 'signed-token',
        status: 'SIGNED',
        poaType: 'STANDARD',
        channel: 'EMAIL',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        signedAt: new Date(),
        caseId: 'case-1',
        clientId: 'client-1',
        consumerId: null,
        client: null,
        consumer: null,
        case: null,
      };

      vi.mocked(prisma.poaSigningRequest.findUnique).mockResolvedValueOnce(mockRecord);

      const result = await resolveSigningToken('signed-token');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.status).toBe(409);
        expect(result.error).toContain('already been signed');
      }
    });
  });

  describe('completePoaSigning — Sections 5 & 6 confirmation', () => {
    const pendingStandard = {
      id: 'sig-1', token: 'tok', status: 'PENDING', poaType: 'STANDARD', channel: 'EMAIL',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), signedAt: null,
      caseId: 'case-1', clientId: 'client-1', consumerId: null,
      client: null, consumer: null, case: null,
    };

    it('refuses a Standard POA with no confirmations when they are required', async () => {
      vi.mocked(prisma.poaSigningRequest.findUnique).mockResolvedValueOnce(pendingStandard as never);

      const result = await completePoaSigning({
        token: 'tok', signatureImage: 'data:image/png;base64,AAAA',
        ipAddress: '1.1.1.1', userAgent: 'ua', requireConfirmations: true,
      });

      expect('error' in result && result.status).toBe(400);
      expect(prisma.poaSigningRequest.update).not.toHaveBeenCalled();
    });

    it('refuses when only one of the two sections was confirmed', async () => {
      vi.mocked(prisma.poaSigningRequest.findUnique).mockResolvedValueOnce(pendingStandard as never);

      const result = await completePoaSigning({
        token: 'tok', signatureImage: 'data:image/png;base64,AAAA',
        ipAddress: '1.1.1.1', userAgent: 'ua', requireConfirmations: true,
        confirmations: { checklist: true, declarations: false },
      });

      expect('error' in result && result.status).toBe(400);
    });
  });

  describe('Token TTL', () => {
    it('should have 72 hour TTL', () => {
      expect(POA_TOKEN_TTL_HOURS).toBe(72);
    });
  });
});
