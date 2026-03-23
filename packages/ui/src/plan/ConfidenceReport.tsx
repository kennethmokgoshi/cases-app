'use client';

import type { ConfidenceReport as ConfidenceReportType } from '@zenowethu/plan-engine';

interface ConfidenceReportProps {
  confidence: ConfidenceReportType;
  caseId: string;
  onTabSwitch?: (tab: string) => void;
}

const DOC_LABELS: Record<string, string> = {
  CREDIT_REPORT: 'Credit Report',
  ID_DOCUMENT: 'Identity Document',
  POA: 'Power of Attorney',
  PAYSLIP: 'Payslip',
  BANK_STATEMENT: 'Bank Statement',
  OTHER: 'Other Document',
};

export function ConfidenceReport({ confidence, caseId, onTabSwitch }: ConfidenceReportProps) {
  const scoreColor =
    confidence.score >= 80
      ? 'text-green-400'
      : confidence.score >= 50
        ? 'text-yellow-400'
        : 'text-red-400';

  const ringColor =
    confidence.score >= 80
      ? 'border-green-400'
      : confidence.score >= 50
        ? 'border-yellow-400'
        : 'border-red-400';

  const allDocTypes = [
    ...confidence.missingRequired.map((d) => ({ ...d, present: false })),
    ...confidence.missingOptional.map((d) => ({ ...d, present: false })),
    ...confidence.presentItems.map((type) => ({
      type: type as string,
      description: '',
      isRequired: false,
      weight: 0,
      impactIfMissing: '',
      present: true,
    })),
  ];

  // Deduplicate by type
  const seen = new Set<string>();
  const docGrid = allDocTypes.filter((d) => {
    if (seen.has(d.type)) return false;
    seen.add(d.type);
    return true;
  });

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
      <h3 className="text-xs font-bold tracking-widest uppercase text-gray-500 mb-4">
        Confidence Report
      </h3>

      <div className="flex items-start gap-6">
        {/* Score Circle */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className={`w-24 h-24 rounded-full border-4 ${ringColor} flex items-center justify-center`}
          >
            <span className={`text-2xl font-black ${scoreColor}`}>{confidence.score}</span>
          </div>
          <span className="text-xs text-gray-500 tracking-wider uppercase">Confidence</span>
        </div>

        {/* Doc Grid */}
        <div className="flex-1">
          <div className="grid grid-cols-2 gap-2">
            {docGrid.map((doc) => {
              const label = DOC_LABELS[doc.type] || doc.type;
              if (doc.present) {
                return (
                  <div
                    key={doc.type}
                    className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2"
                  >
                    <span className="text-green-400 text-xs font-bold">✓</span>
                    <span className="text-green-300 text-sm">{label}</span>
                  </div>
                );
              }
              if (doc.isRequired) {
                return (
                  <div
                    key={doc.type}
                    className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 text-xs font-bold">✗</span>
                      <span className="text-red-300 text-sm">{label}</span>
                    </div>
                    {onTabSwitch && (
                      <button
                        onClick={() => onTabSwitch('DOCUMENTS')}
                        className="text-xs text-zeno-cyan hover:underline ml-2 shrink-0"
                      >
                        Upload
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={doc.type}
                  className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 text-xs">⚠</span>
                    <span className="text-yellow-300 text-sm">{label}</span>
                  </div>
                  {onTabSwitch && (
                    <button
                      onClick={() => onTabSwitch('DOCUMENTS')}
                      className="text-xs text-zeno-cyan hover:underline ml-2 shrink-0"
                    >
                      Upload
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Can proceed message */}
          <div className={`mt-3 text-sm font-medium ${confidence.canProceed ? 'text-green-400' : 'text-red-400'}`}>
            {confidence.canProceed
              ? '✓ All required documents present — ready to proceed'
              : `✗ Missing required documents (${confidence.missingRequired.length}) — cannot generate plan`}
          </div>
        </div>
      </div>
    </div>
  );
}
