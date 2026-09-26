/**
 * GET /api/cases/[id]/fee-documents
 *
 * Sent / paid history for each invoice and proof of payment on the case, for the
 * Documents tab "Invoices & Payments" panel.
 */

import { NextResponse } from 'next/server';
import { auth, createLogger } from '@zenowethu/shared-lib';
import { getFeeDocumentHistory } from '@zenowethu/shared-lib/src/finance/fee-document-service';
import { getCompanyProfile } from '@zenowethu/shared-lib/src/company/company-profile-service';

const logger = createLogger('api/cases/[id]/fee-documents');

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    try {
        const [history, company] = await Promise.all([getFeeDocumentHistory(id), getCompanyProfile()]);
        return NextResponse.json({ history, legalFeeAmount: company.legalFeeAmount });
    } catch (error) {
        logger.error({ error, caseId: id }, 'Could not load fee document history');
        return NextResponse.json({ error: 'Could not load invoice history' }, { status: 500 });
    }
}
