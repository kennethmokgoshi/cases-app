import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@zenowethu/database';
import { generateDisputeLetter, DisputeLetterType, logAuditAction } from '@zenowethu/shared-lib';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const GenerateSchema = z.object({
    type: z.enum(['CREDIT_BUREAU_DISPUTE', 'CREDIT_PROVIDER_DISPUTE', 'PRESCRIBED_DEBT_NOTICE']),
    creditorName: z.string(),
    accountNumber: z.string(),
    adverseDate: z.string().optional(),
    lastPaymentDate: z.string().optional(),
    bureauName: z.string().optional(),
    disputeGrounds: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const consumer = await prisma.consumerAccount.findUnique({
            where: { id: session.user.id }
        });
        if (!consumer) return new NextResponse('Consumer not found', { status: 404 });

        const body = await request.json();
        const parsed = GenerateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
        }

        const { type, creditorName, accountNumber, adverseDate, lastPaymentDate, bureauName, disputeGrounds } = parsed.data;

        // Generate the PDF
        const pdfBytes = await generateDisputeLetter(type as DisputeLetterType, {
            clientFullName: `${consumer.firstName} ${consumer.lastName}`,
            clientIdNumber: consumer.idNumber || 'Not Provided',
            creditorName,
            accountNumber,
            adverseDate,
            lastPaymentDate,
            bureauName,
            disputeGrounds,
            consultantName: `${consumer.firstName} ${consumer.lastName}`,
            consultantTitle: 'Consumer (Self-Represented)'
        });

        const fileName = `Dispute_${type}_${creditorName.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        
        // Save to vault
        await prisma.credoDocument.create({
            data: {
                consumerId: consumer.id,
                fileName,
                originalName: fileName,
                mimeType: 'application/pdf',
                size: pdfBytes.length,
                category: 'DISPUTE_LETTER',
                storagePath: `mock-storage/disputes/${randomUUID()}.pdf` // In real life, upload to S3 first
            }
        });

        await logAuditAction({
            userId: session.user.id,
            action: 'GENERATE_PDF',
            resource: 'CredoDocument',
            details: { type, creditorName, accountNumber }
        });

        // For the mock, just return success.
        // The UI will show a toast "Letter saved to vault"
        return NextResponse.json({ success: true, message: 'Dispute letter generated and saved to vault' });
    } catch (error) {
        console.error('Failed to generate dispute:', error);
        return new NextResponse('Failed to generate dispute letter', { status: 500 });
    }
}
