import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn()
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    workLog: {
      updateMany: vi.fn()
    }
  }
}));

import { auth } from '@zenowethu/shared-lib';
import { prisma } from '@zenowethu/database';
import { POST } from './route';

function makeReq(url: string, method = 'POST', body?: unknown) {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

describe('Bulk Verify API Route (/api/logs/bulk-verify)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await POST(makeReq('http://localhost', 'POST', { logIds: ['1'], isVerified: true }));
    expect(res.status).toBe(401);
  });

  it('returns 403 if user is not an executive or admin', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1', isAdmin: false, isExecutive: false } } as any);
    const res = await POST(makeReq('http://localhost', 'POST', { logIds: ['1'], isVerified: true }));
    expect(res.status).toBe(403);
  });

  it('verifies logs successfully for admin/executive', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'admin1', isAdmin: true } } as any);
    vi.mocked(prisma.workLog.updateMany).mockResolvedValueOnce({ count: 3 } as any);

    const res = await POST(makeReq('http://localhost', 'POST', { logIds: ['1', '2', '3'], isVerified: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(3);
    expect(prisma.workLog.updateMany).toHaveBeenCalled();
  });

  it('unverifies logs successfully', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'exec1', isExecutive: true } } as any);
    vi.mocked(prisma.workLog.updateMany).mockResolvedValueOnce({ count: 2 } as any);

    const res = await POST(makeReq('http://localhost', 'POST', { logIds: ['1', '2'], isVerified: false }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(prisma.workLog.updateMany).toHaveBeenCalled();
  });
});
