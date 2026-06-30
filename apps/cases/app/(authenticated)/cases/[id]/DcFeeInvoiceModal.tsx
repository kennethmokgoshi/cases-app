'use client';

/**
 * DcFeeInvoiceModal — modal chrome around the shared `DcFeeInvoiceForm`
 * (`@zenowethu/ui`). The form (and the API routes it calls) is shared with the
 * Finance app's standalone Outstanding Fees page; this wrapper just supplies the
 * backdrop/panel and pre-fills DC + consumer details from the case.
 */

import { DcFeeInvoiceForm } from '@zenowethu/ui';

export interface DcFeeInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId?: string;
  dcName?: string | null;
  dcEmail?: string | null;
  dcTradingName?: string | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  clientIdNumber?: string | null;
}

export default function DcFeeInvoiceModal(props: DcFeeInvoiceModalProps) {
  const { isOpen, onClose, ...rest } = props;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zeno-dark border border-zeno-blue/50 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DcFeeInvoiceForm {...rest} onClose={onClose} />
      </div>
    </div>
  );
}
