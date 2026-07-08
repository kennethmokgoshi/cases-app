import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@zenowethu/shared-lib', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  getAutomationUserId: vi.fn(),
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    consumerAccount: { findUnique: vi.fn() },
    case: { findFirst: vi.fn() },
    caseComment: { create: vi.fn() },
  },
}));

import { auth } from '@/auth';
import { prisma } from '@zenowethu/database';
import { getAutomationUserId } from '@zenowethu/shared-lib';
import { POST } from './route';

const db = prisma as unknown as {
  consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
  case: { findFirst: ReturnType<typeof vi.fn> };
  caseComment: { create: ReturnType<typeof vi.fn> };
};

const request = (body: unknown) => new NextRequest('https://credo.zenowethu.co.za/api/consumer/cases/case1/comments', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: 'consumer1' } } as never);
  vi.mocked(getAutomationUserId).mockResolvedValue('auto-user');
  db.consumerAccount.findUnique.mockResolvedValue({
    id: 'consumer1',
    firstName: 'Test',
    lastName: 'User',
    linkedClientId: 'client1',
  });
  db.case.findFirst.mockResolvedValue({ id: 'case1' });
  db.caseComment.create.mockResolvedValue({
    id: 'comment1',
    content: '[CLIENT COMMENT] Test User: Hello',
    activityType: 'CLIENT_COMMENT',
    createdAt: new Date('2026-07-08T00:00:00Z'),
  });
});

describe('POST /api/consumer/cases/[id]/comments', () => {
  it('creates a public Cases comment for the linked consumer case', async () => {
    const res = await POST(request({ content: 'Hello' }), { params: Promise.resolve({ id: 'case1' }) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.comment.id).toBe('comment1');
    expect(db.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case1', clientId: 'client1', deletedAt: null },
      select: { id: true },
    });
    expect(db.caseComment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isInternal: false,
        activityType: 'CLIENT_COMMENT',
        content: '[CLIENT COMMENT] Test User: Hello',
      }),
    }));
  });

  it('rejects comments for cases outside the linked client', async () => {
    db.case.findFirst.mockResolvedValue(null);

    const res = await POST(request({ content: 'Hello' }), { params: Promise.resolve({ id: 'case2' }) });

    expect(res.status).toBe(404);
    expect(db.caseComment.create).not.toHaveBeenCalled();
  });

  it('validates empty comments', async () => {
    const res = await POST(request({ content: '   ' }), { params: Promise.resolve({ id: 'case1' }) });

    expect(res.status).toBe(400);
    expect(db.caseComment.create).not.toHaveBeenCalled();
  });
});
