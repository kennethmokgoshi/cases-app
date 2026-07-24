import { prisma } from "@zenowethu/database"
import { startOfDay, endOfDay } from "date-fns"

export interface TouchedCase {
  fileNumber: string;
  clientName: string;
  /** Every comment this user made on this file on this day, ascending. Empty if the file was touched only via status change, upload or message. */
  commentTimes: Date[];
  /** Convenience: the first comment time (when they started working it), i.e. commentTimes[0]. Null if no comment was made. */
  firstCommentAt: Date | null;
}

export interface ActivitySignature {
  commentCount: number;
  workflowLogCount: number;
  documentCount: number;
  notificationCount: number;
  casesTouched: TouchedCase[];
}

type CaseRef = { fileNumber: string; client: { firstName: string | null; lastName: string | null } | null } | null;

function buildClientName(client: { firstName: string | null; lastName: string | null } | null): string {
  if (!client) return "";
  return `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();
}

/**
 * Compiles a user's system activity signature for a specific date.
 * Queries transactional tables (comments, status changes, document uploads, and notification logs)
 * to count active operations and list case files touched by the employee on that day.
 *
 * For each touched file it also returns the client's full name and the time of the
 * FIRST comment the employee made on that file that day — i.e. when they started working it.
 */
export async function getUserActivitySignature(userId: string, date: Date): Promise<ActivitySignature> {
  const start = startOfDay(date);
  const end = endOfDay(date);

  const [comments, workflowLogs, documents, notifications] = await Promise.all([
    prisma.caseComment.findMany({
      where: {
        userId,
        createdAt: { gte: start, lte: end }
      },
      select: {
        createdAt: true,
        case: {
          select: {
            fileNumber: true,
            client: { select: { firstName: true, lastName: true } }
          }
        }
      }
    }),
    prisma.workflowLog.findMany({
      where: {
        userId,
        timestamp: { gte: start, lte: end }
      },
      select: {
        case: {
          select: {
            fileNumber: true,
            client: { select: { firstName: true, lastName: true } }
          }
        }
      }
    }),
    prisma.document.findMany({
      where: {
        uploadedById: userId,
        uploadedAt: { gte: start, lte: end }
      },
      select: {
        case: {
          select: {
            fileNumber: true,
            client: { select: { firstName: true, lastName: true } }
          }
        }
      }
    }),
    prisma.notificationLog.findMany({
      where: {
        senderId: userId,
        sentAt: { gte: start, lte: end }
      },
      select: {
        case: {
          select: {
            fileNumber: true,
            client: { select: { firstName: true, lastName: true } }
          }
        }
      }
    })
  ]);

  // Insertion-ordered map keyed by fileNumber so each file appears once.
  const caseMap = new Map<string, TouchedCase>();

  const touch = (kase: CaseRef) => {
    if (!kase?.fileNumber) return;
    const existing = caseMap.get(kase.fileNumber);
    if (existing) {
      // Fill in the client name if an earlier source lacked it.
      if (!existing.clientName) existing.clientName = buildClientName(kase.client);
    } else {
      caseMap.set(kase.fileNumber, {
        fileNumber: kase.fileNumber,
        clientName: buildClientName(kase.client),
        commentTimes: [],
        firstCommentAt: null
      });
    }
  };

  // Comments carry the working timestamps — collect every one per file.
  comments.forEach((c) => {
    touch(c.case);
    if (c.case?.fileNumber) {
      caseMap.get(c.case.fileNumber)!.commentTimes.push(c.createdAt);
    }
  });
  workflowLogs.forEach((w) => touch(w.case));
  documents.forEach((d) => touch(d.case));
  notifications.forEach((n) => touch(n.case));

  // Sort each file's comment times ascending and derive the "started" time.
  for (const entry of caseMap.values()) {
    entry.commentTimes.sort((a, b) => a.getTime() - b.getTime());
    entry.firstCommentAt = entry.commentTimes[0] ?? null;
  }

  return {
    commentCount: comments.length,
    workflowLogCount: workflowLogs.length,
    documentCount: documents.length,
    notificationCount: notifications.length,
    casesTouched: Array.from(caseMap.values())
  };
}
