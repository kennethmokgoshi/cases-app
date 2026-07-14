import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { logger } from '@zenowethu/shared-lib';
import { stepRegistry } from '@zenowethu/plan-engine/src/step-registry';

export async function POST(request: Request) {
  try {
    // 1. Verify cron secret if needed (assuming internal/Vercel cron, check header if required)
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    logger.info('[DRR_TRIGGER] Starting AI Debt Review Removal File Request Trigger...');

    // 2. Find cases that are ACCEPTED_VIA_DHS and are debt_review_flag_removal
    // Because services is a JSON string, we query all ACCEPTED_VIA_DHS and filter in memory 
    // or use a Prisma json string contains (if using string filter)
    const candidates = await prisma.case.findMany({
      where: {
        status: 'ACCEPTED_VIA_DHS',
        services: {
          contains: 'debt_review_flag_removal',
        },
      },
      include: {
        documents: true,
        workflowLogs: {
          where: {
            action: 'REQUEST_FILE_FROM_DC'
          },
          orderBy: { timestamp: 'desc' }
        },
        comments: {
          where: {
            activityType: 'REQUEST_FILE_FROM_DC',
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const processed = [];
    const skipped = [];
    const errors = [];

    for (const caseData of candidates) {
      try {
        // Double check services array properly
        const services = caseData.services ? JSON.parse(caseData.services as string) : [];
        if (!services.includes('debt_review_flag_removal')) {
          skipped.push({ id: caseData.id, reason: 'Not DRR service' });
          continue;
        }

        // Check if we already requested the file recently (e.g. within last 7 days)
        const lastRequestLog = caseData.workflowLogs[0]?.timestamp || caseData.comments[0]?.createdAt;
        if (lastRequestLog) {
          const daysSinceRequest = (new Date().getTime() - new Date(lastRequestLog).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceRequest < 7) {
            skipped.push({ id: caseData.id, reason: 'Already requested within 7 days' });
            continue;
          }
        }

        // Check documents: do we have 17.W?
        const has17W = caseData.documents.some(d => d.type === 'FORM_17W' || d.type === '17W');
        if (has17W) {
          skipped.push({ id: caseData.id, reason: 'Form 17.W already received' });
          continue;
        }

        logger.info(`[DRR_TRIGGER] Case ${caseData.id} (${caseData.fileNumber}) requires 17.W/Court Order. Initiating request...`);

        // Get admin ID for attribution
        const adminUser = await prisma.user.findFirst({ where: { isAdmin: true } });
        
        const actionCtx = {
          caseId: caseData.id,
          planId: 'system_drr_trigger',
          stepId: 'req_drr_file_01',
          actionParams: {},
          caseRecord: {
            ...caseData,
            assignedToId: adminUser?.id || '',
            client: await prisma.client.findUnique({ where: { id: caseData.clientId } }) as any,
          }
        };

        const result = await stepRegistry.getAction('REQUEST_FILE_FROM_DC')(actionCtx);

        if (result.success) {
          processed.push({ id: caseData.id, fileNumber: caseData.fileNumber, email: result.result?.dcEmail });
        } else {
          errors.push({ id: caseData.id, error: result.error });
        }

      } catch (err: any) {
        logger.error(`[DRR_TRIGGER] Error processing case ${caseData.id}:`, err);
        errors.push({ id: caseData.id, error: err.message });
      }
    }

    logger.info(`[DRR_TRIGGER] Completed. Processed: ${processed.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`);

    return NextResponse.json({
      success: true,
      summary: {
        processed: processed.length,
        skipped: skipped.length,
        errors: errors.length
      },
      processed,
      skipped,
      errors
    });

  } catch (error: any) {
    logger.error('[DRR_TRIGGER] Global error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
