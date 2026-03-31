
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, draftLegalDocument, getAutonomyDecision, sendManualMessage, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/ai/draft');

/**
 * POST /api/ai/draft
 * Drafts a legal document (LOD, etc.) using AI
 */
export async function POST(
    request: NextRequest,
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { caseId, documentType, matterId } = body;

        if (!caseId || !documentType) {
            return NextResponse.json({ error: 'Case ID and Document Type are required' }, { status: 400 });
        }

        // 1. Fetch case/client data
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            include: {
                client: true,
                LegalMatter: {
                    where: matterId ? { id: matterId } : undefined,
                    take: 1
                }
            }
        });

        if (!caseRecord) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        const matter = caseRecord.LegalMatter[0];
        if (!matter) {
            return NextResponse.json({ error: 'Associated legal matter not found' }, { status: 404 });
        }

        // 2. Draft using AI Engine
        const draftingRequest = {
            client: {
                firstName: caseRecord.client.firstName,
                lastName: caseRecord.client.lastName,
                idNumber: caseRecord.client.idNumber,
                address: caseRecord.client.address
            },
            caseData: {
                fileNumber: caseRecord.fileNumber
            },
            matter: {
                type: matter.matterType,
                creditorName: matter.creditorName,
                accountNumber: matter.accountNumber
            },
            documentType: documentType
        };

        const draft = await draftLegalDocument(draftingRequest);

        // 3. Check Autonomy Decision
        const decision = await getAutonomyDecision(caseId, 'LEGAL_DRAFT');

        // 4. Save to LegalLetter
        const letter = await prisma.legalLetter.create({
            data: {
                legalMatterId: matter.id,
                letterType: documentType,
                recipientName: draft.recipientName,
                recipientEmail: draft.recipientDetails.includes('@') ? draft.recipientDetails : null,
                subject: draft.subject,
                letterContent: draft.content,
                status: decision.shouldExecute ? 'SENT' : 'DRAFT',
                sentVia: decision.shouldExecute ? 'AI_AUTOPILOT_GHL' : null,
                sentAt: decision.shouldExecute ? new Date() : null
            }
        });

        // 5. If Autopilot: Send immediately via GHL
        if (decision.shouldExecute && (letter.recipientEmail || caseRecord.client.email)) {
            const recipient = letter.recipientEmail || caseRecord.client.email || '';
            await sendManualMessage(
                caseId,
                'EMAIL',
                recipient,
                draft.content,
                draft.subject
            );
        }

        // 6. Log the activity
        await prisma.caseComment.create({
            data: {
                caseId,
                userId: session.user.id,
                content: `AI ${decision.shouldExecute ? 'executed' : 'drafted'}: ${documentType} for ${matter.creditorName}. Mode: ${decision.level}`,
                type: 'AI_INSIGHT',
                isInternal: true
            }
        });

        return NextResponse.json({
            success: true,
            letterId: letter.id,
            executed: decision.shouldExecute,
            level: decision.level
        });
    } catch (error) {
        logger.error(error, 'Error in AI Drafting API');
        return NextResponse.json(
            { error: 'Failed to draft legal document' },
            { status: 500 }
        );
    }
}
