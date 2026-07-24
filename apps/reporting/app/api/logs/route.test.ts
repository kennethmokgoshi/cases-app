import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
  getUserActivitySignature: vi.fn()
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    workLog: {
      create: vi.fn(),
      findMany: vi.fn()
    },
    case: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock('@zenowethu/shared-lib/src/metrics/activity-verification', () => ({
  getUserActivitySignature: vi.fn()
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { getUserActivitySignature } from '@zenowethu/shared-lib/src/metrics/activity-verification';
import { POST, GET } from './route';

function makeReq(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

describe('Logs API Route (/api/logs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST', () => {
    it('returns 401 if unauthenticated', async () => {
      vi.mocked(auth).mockResolvedValueOnce(null);
      const req = makeReq('http://localhost/api/logs', 'POST', {
        date: '2026-07-23',
        category: 'CLIENT_CALLS',
        description: 'Called some clients today',
        durationMinutes: 60
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 for invalid inputs', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', userType: 'STAFF' } } as any);
      const req = makeReq('http://localhost/api/logs', 'POST', {
        date: 'invalid-date',
        category: 'X', // too short
        description: 'short',
        durationMinutes: -10 // invalid duration
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 if case file number does not exist', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', userType: 'STAFF' } } as any);
      vi.mocked(prisma.case.findUnique).mockResolvedValueOnce(null); // not found
      
      const req = makeReq('http://localhost/api/logs', 'POST', {
        date: '2026-07-23',
        category: 'CLIENT_CALLS',
        description: 'Worked on case updates',
        durationMinutes: 90,
        fileNumber: 'ZDM-MISSING'
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('does not exist');
    });

    it('creates log entry successfully', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', userType: 'STAFF' } } as any);
      vi.mocked(prisma.case.findUnique).mockResolvedValueOnce({ id: 'c1' } as any);
      vi.mocked(prisma.workLog.create).mockResolvedValueOnce({ id: 'l1', durationMinutes: 95 } as any);

      const req = makeReq('http://localhost/api/logs', 'POST', {
        date: '2026-07-23',
        category: 'CLIENT_CALLS',
        description: 'Worked on case updates',
        durationMinutes: 95,
        fileNumber: 'ZDM-VALID'
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('l1');
      expect(prisma.workLog.create).toHaveBeenCalled();
    });
  });

  describe('GET', () => {
    it('returns logs and computes aggregates', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', userType: 'STAFF' } } as any);
      vi.mocked(prisma.workLog.findMany).mockResolvedValueOnce([
        { id: 'l1', category: 'CLIENT_CALLS', durationMinutes: 30 },
        { id: 'l2', category: 'CLIENT_EMAILS', durationMinutes: 45 }
      ] as any);

      const req = makeReq('http://localhost/api/logs?startDate=2026-07-20&endDate=2026-07-26');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.logs).toHaveLength(2);
      expect(data.totalMinutes).toBe(75);
      expect(data.categoryBreakdown.CLIENT_CALLS).toBe(30);
      expect(data.categoryBreakdown.CLIENT_EMAILS).toBe(45);
    });

    it('includes activity signature when requested', async () => {
      vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', userType: 'STAFF' } } as any);
      vi.mocked(prisma.workLog.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserActivitySignature).mockResolvedValueOnce({
        commentCount: 5,
        workflowLogCount: 2,
        documentCount: 1,
        notificationCount: 3,
        casesTouched: [{ fileNumber: 'ZDM-01', clientName: 'John Dlamini', commentTimes: [new Date('2026-07-23T09:14:00Z')], firstCommentAt: new Date('2026-07-23T09:14:00Z') }]
      });

      const req = makeReq('http://localhost/api/logs?startDate=2026-07-23&includeSignature=true');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.signature.commentCount).toBe(5);
      expect(data.signature.casesTouched[0].fileNumber).toBe('ZDM-01');
      expect(data.signature.casesTouched[0].clientName).toBe('John Dlamini');
    });
  });
});
