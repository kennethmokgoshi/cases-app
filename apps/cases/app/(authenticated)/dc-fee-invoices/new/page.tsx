'use client';

/**
 * Standalone Debt Counsellor Fee Invoice page.
 *
 * For raising a fee-recovery invoice to a debt counsellor when there is no case
 * in the system for the consumer. When a case exists, prefer the "DC: Generate
 * Fee Invoice" button on the case page (it pre-fills and links the invoice).
 */

import { useRouter } from 'next/navigation';
import DcFeeInvoiceModal from '../../cases/[id]/DcFeeInvoiceModal';

export default function NewDcFeeInvoicePage() {
  const router = useRouter();

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-white">Debt Counsellor Fee Invoice</h1>
        <p className="text-sm text-gray-400 mt-1">
          Raise a fee-recovery invoice addressed to a debt counsellor for fees a consumer still owes Zenowethu.
        </p>
      </div>
      <DcFeeInvoiceModal isOpen onClose={() => router.back()} />
    </div>
  );
}
