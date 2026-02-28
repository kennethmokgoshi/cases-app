import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { generateRescissionApplication, generateDisputeLetter, generateSection126BNotice } from '../../../../../../lib/document-generator';

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id;
        const matter = await prisma.legalMatter.findUnique({
            where: { id },
            include: {
                Client: true,
                Case: true,
            },
        });

        if (!matter) {
            return NextResponse.json({ error: 'Legal matter not found' }, { status: 404 });
        }

        let base64Pdf = '';
        let fileName = '';

        if (matter.matterType === 'RESCISSION') {
            base64Pdf = await generateRescissionApplication({
                clientName: `${matter.Client.firstName} ${matter.Client.lastName}`,
                caseNumber: matter.judgmentCaseNumber || matter.Case.fileNumber,
                courtName: matter.judgmentCourt || 'Magistrate Court',
                judgmentDate: matter.judgmentDate?.toLocaleDateString() || 'N/A',
                creditorName: matter.creditorName,
                district: '', // District not standard in Case model
            });
            fileName = `Rescission_Application_${matter.Case.fileNumber}.pdf`;
        } else if (matter.matterType === 'DISPUTE') {
            base64Pdf = await generateDisputeLetter({
                clientName: `${matter.Client.firstName} ${matter.Client.lastName}`,
                idNumber: matter.Client.idNumber || 'N/A',
                creditorName: matter.creditorName,
                accountNumber: matter.accountNumber || 'N/A',
                notes: matter.outcomeNotes || '',
            });
            fileName = `Dispute_Letter_${matter.creditorName.replace(/\s+/g, '_')}.pdf`;
        } else if (matter.matterType === 'PRESCRIPTION') {
            base64Pdf = await generateSection126BNotice({
                clientName: `${matter.Client.firstName} ${matter.Client.lastName}`,
                idNumber: matter.Client.idNumber || 'N/A',
                creditorName: matter.creditorName,
                accountNumber: matter.accountNumber || 'N/A',
                lastActivityDate: matter.judgmentDate?.toLocaleDateString() || 'Unknown',
                reason: matter.outcomeNotes || ''
            });
            fileName = `Section126B_Notice_${matter.creditorName.replace(/\s+/g, '_')}.pdf`;
        } else {
            return NextResponse.json({ error: 'Unsupported matter type for PDF generation' }, { status: 400 });
        }

        // Return the PDF as a stream
        const pdfBuffer = Buffer.from(base64Pdf, 'base64');
        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });

    } catch (error) {
        logger.error({ error, matterId: params.id }, '❌ Failed to generate legal PDF');
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
