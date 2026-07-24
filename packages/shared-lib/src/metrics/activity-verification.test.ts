import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserActivitySignature } from './activity-verification';
import { prisma } from '@zenowethu/database';

vi.mock('@zenowethu/database', () => ({
  prisma: {
    caseComment: { findMany: vi.fn() },
    workflowLog: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    notificationLog: { findMany: vi.fn() }
  }
}));

describe('User Activity Verification Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('compiles correct counts and extracts distinct touched cases with client name and first-comment time', async () => {
    const client = { firstName: 'John', lastName: 'Dlamini' };
    const laterComment = new Date('2026-07-23T14:30:00Z');
    const earlierComment = new Date('2026-07-23T09:14:00Z');

    // Mock comments return — same case twice; the earlier timestamp must win as "started".
    vi.mocked(prisma.caseComment.findMany).mockResolvedValue([
      { createdAt: laterComment, case: { fileNumber: 'ZDM-01', client } },
      { createdAt: earlierComment, case: { fileNumber: 'ZDM-01', client } } // Duplicate case touched, earlier
    ] as any);

    // Mock workflowLogs return
    vi.mocked(prisma.workflowLog.findMany).mockResolvedValue([
      { case: { fileNumber: 'ZDM-02', client: { firstName: 'Thabo', lastName: 'Mokoena' } } }
    ] as any);

    // Mock documents return (e.g. no case or null)
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      { case: null },
      { case: { fileNumber: 'ZDM-03', client: { firstName: 'Naledi', lastName: 'Khumalo' } } }
    ] as any);

    // Mock notifications return
    vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([
      { case: { fileNumber: 'ZDM-01', client } }, // Already in list
      { case: { fileNumber: 'ZDM-04', client: { firstName: 'Sipho', lastName: 'Nkosi' } } }
    ] as any);

    const date = new Date('2026-07-23T12:00:00Z');
    const result = await getUserActivitySignature('user-abc', date);

    // Check counts
    expect(result.commentCount).toBe(2);
    expect(result.workflowLogCount).toBe(1);
    expect(result.documentCount).toBe(2);
    expect(result.notificationCount).toBe(2);

    // Check distinct touched case list
    expect(result.casesTouched).toHaveLength(4);
    const fileNumbers = result.casesTouched.map((c) => c.fileNumber);
    expect(fileNumbers).toContain('ZDM-01');
    expect(fileNumbers).toContain('ZDM-02');
    expect(fileNumbers).toContain('ZDM-03');
    expect(fileNumbers).toContain('ZDM-04');

    // ZDM-01 carries the client full name and BOTH its comment times, sorted ascending,
    // with the earliest surfaced as "started".
    const zdm01 = result.casesTouched.find((c) => c.fileNumber === 'ZDM-01')!;
    expect(zdm01.clientName).toBe('John Dlamini');
    expect(zdm01.commentTimes).toEqual([earlierComment, laterComment]);
    expect(zdm01.firstCommentAt).toEqual(earlierComment);

    // A case touched only via workflow/document/notification has a name but no comment times.
    const zdm02 = result.casesTouched.find((c) => c.fileNumber === 'ZDM-02')!;
    expect(zdm02.clientName).toBe('Thabo Mokoena');
    expect(zdm02.commentTimes).toEqual([]);
    expect(zdm02.firstCommentAt).toBeNull();
  });

  it('returns zero values if no activity is found on that date', async () => {
    vi.mocked(prisma.caseComment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.workflowLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.document.findMany).mockResolvedValue([]);
    vi.mocked(prisma.notificationLog.findMany).mockResolvedValue([]);

    const result = await getUserActivitySignature('user-abc', new Date());

    expect(result.commentCount).toBe(0);
    expect(result.workflowLogCount).toBe(0);
    expect(result.documentCount).toBe(0);
    expect(result.notificationCount).toBe(0);
    expect(result.casesTouched).toEqual([]);
  });
});
