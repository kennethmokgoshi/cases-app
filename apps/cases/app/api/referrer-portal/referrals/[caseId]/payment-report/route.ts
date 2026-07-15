import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { createLogger, touchCaseAction } from '@zenowethu/shared-lib';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { getCurrentReferrerPortalAccess } from '@/lib/referrer-portal-access';
import { parseMultipartForm } from '@/lib/form-parser';

const logger = createLogger('api/referrer-portal/payment-report');

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
    try {
        const access = await getCurrentReferrerPortalAccess();
        if (access.ok !== true) return NextResponse.json({ error: access.error }, { status: access.status });

        const { caseId } = await params;

        // Verify that the case exists and is linked to this referrer
        const referralCase = await prisma.case.findFirst({
            where: { id: caseId, referrerId: access.referrer.id, deletedAt: null },
            select: { id: true, fileNumber: true, assignedToId: true, referrerCommission: { select: { id: true } } },
        });

        if (!referralCase) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

        const { fields, files } = await parseMultipartForm(request);

        const amountRaw = fields.amount;
        const dateRaw = fields.date;
        const notesRaw = fields.notes;

        if (!amountRaw || !dateRaw) {
            return NextResponse.json({ error: 'Amount and date are required' }, { status: 400 });
        }

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
            return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
        }

        const date = new Date(dateRaw);
        if (isNaN(date.getTime())) {
            return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 });
        }

        if (files.length === 0) {
            return NextResponse.json({ error: 'Proof of payment file is required' }, { status: 400 });
        }

        const file = files[0];

        // Ensure storage directory exists
        const uploadsDir = join(process.cwd(), 'storage', 'uploads', caseId);
        if (!existsSync(uploadsDir)) {
            await mkdir(uploadsDir, { recursive: true });
        }

        // Save the file
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.name}`;
        const filePath = join(uploadsDir, fileName);
        const fileUrl = `/uploads/${caseId}/${fileName}`;
        const fileSize = file.buffer.length;

        await writeFile(filePath, file.buffer);

        // Create the Document record
        const document = await prisma.document.create({
            data: {
                caseId,
                type: 'PROOF_OF_PAYMENT',
                fileName: file.name,
                fileUrl,
                fileSize,
                mimeType: file.type,
                uploadedById: access.sessionUserId,
            },
        });

        // Create the ReferrerPaymentQuery record
        const formattedNotes = `[Reported Payment] Amount: R ${amount.toFixed(2)}, Date: ${dateRaw}. Notes: ${notesRaw || 'None'}. Proof: ${file.name}`;
        const paymentQuery = await prisma.referrerPaymentQuery.create({
            data: {
                referrerId: access.referrer.id,
                caseId: referralCase.id,
                commissionId: referralCase.referrerCommission?.id ?? null,
                submittedByUserId: access.sessionUserId,
                claimedPaidAt: date,
                claimedAmount: amount,
                notes: formattedNotes,
                status: 'PENDING',
            },
        });

        // Create the CaseComment discussion thread update
        const commentContent = `[SYSTEM AUTO-MESSAGE] Payment reported: R ${amount.toFixed(2)} paid on ${dateRaw}. Proof of payment uploaded: "${file.name}". Notes: ${notesRaw || 'None'}`;
        const comment = await prisma.caseComment.create({
            data: {
                caseId,
                userId: access.sessionUserId,
                content: commentContent,
                type: 'REFERRER',
                isInternal: false,
                activityType: 'REFERRER_COMMENT',
            },
        });

        await touchCaseAction(caseId, 'COMMENT', { userId: access.sessionUserId });

        // Notify assigned staff user if any
        if (referralCase.assignedToId) {
            await prisma.inAppNotification.create({
                data: {
                    userId: referralCase.assignedToId,
                    type: 'REFERRER_PAYMENT_REPORT',
                    title: `Payment reported on ${referralCase.fileNumber}`,
                    message: `${access.referrer.firstName} reported R ${amount.toFixed(2)} paid on ${dateRaw}. Proof: ${file.name}`,
                    caseId,
                    commentId: comment.id,
                    linkUrl: `/cases/${caseId}`,
                },
            }).catch((err: unknown) => logger.error('Failed to notify staff of reported payment', err));
        }

        return NextResponse.json({
            success: true,
            document: { id: document.id, fileName: document.fileName },
            paymentQuery: { id: paymentQuery.id, status: paymentQuery.status },
            comment: { id: comment.id, content: comment.content }
        }, { status: 201 });
    } catch (error) {
        logger.error('Failed to process payment report upload', error);
        return NextResponse.json({ error: 'Failed to report payment' }, { status: 500 });
    }
}
