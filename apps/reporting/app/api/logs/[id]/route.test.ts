import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn()
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    workLog: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    case: {
      findUnique: vi.fn()
    }
  }
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { PATCH, DELETE } from './route';

function makeReq(url: string, method = 'PATCH', body?: unknown) {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

const mockContext = {
  params: Promise.resolve({ id: 'l1' })
};

describe('Logs Dynamic Route (/api/logs/[id])', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PATCH', () => {
    it('returns 401 if unauthenticated', async () => {
      vi.mocked(auth).mockResolvedValueOnce(null);
      const res = await PATCH(makeReq('http://localhost', 'PATCH', {}), mockContext);
      expect(res.status).toBe(401);
    });

    it('returns 403 if user does not own the log', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u2' } } as any);
      vi.mocked(prisma.workLog.findUnique).mockResolvedValueOnce({ id: 'l1', userId: 'u1' } as any); // owned by u1
      
      const res = await PATCH(makeReq('http://localhost', 'PATCH', { category: 'CLIENT_EMAILS' }), mockContext);
      expect(res.status).toBe(403);
    });

    it('returns 400 if the log is already verified', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as any);
      vi.mocked(prisma.workLog.findUnique).mockResolvedValueOnce({ id: 'l1', userId: 'u1', isVerified: true } as any);
      
      const res = await PATCH(makeReq('http://localhost', 'PATCH', { category: 'CLIENT_EMAILS' }), mockContext);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Cannot modify a verified work log');
    });

    it('updates the log successfully if owner and not verified', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as any);
      vi.mocked(prisma.workLog.findUnique).mockResolvedValueOnce({ id: 'l1', userId: 'u1', isVerified: false } as any);
      vi.mocked(prisma.workLog.update).mockResolvedValueOnce({ id: 'l1', category: 'CLIENT_EMAILS' } as any);

      const res = await PATCH(makeReq('http://localhost', 'PATCH', { category: 'CLIENT_EMAILS', durationMinutes: 45 }), mockContext);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.category).toBe('CLIENT_EMAILS');
      expect(prisma.workLog.update).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('returns 400 if log is verified', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as any);
      vi.mocked(prisma.workLog.findUnique).mockResolvedValueOnce({ id: 'l1', userId: 'u1', isVerified: true } as any);

      const res = await DELETE(makeReq('http://localhost', 'DELETE'), mockContext);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Cannot delete a verified work log');
    });

    it('deletes successfully if owner and not verified', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as any);
      vi.mocked(prisma.workLog.findUnique).mockResolvedValueOnce({ id: 'l1', userId: 'u1', isVerified: false } as any);

      const res = await DELETE(makeReq('http://localhost', 'DELETE'), mockContext);
      expect(res.status).toBe(200);
      expect(prisma.workLog.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });
  });
});
