'use client';

import { useState } from 'react';
import type { ConfidenceReport as ConfidenceReportType } from '@zenowethu/plan-engine';

interface ConfidenceReportProps {
  confidence: ConfidenceReportType;
  caseId: string;
  onTabSwitch?: (tab: string) => void;
  uploadedDocTypes?: string[];
  onRefresh?: () => void;
}

const DOC_LABELS: Record<string, string> = {
  CREDIT_REPORT: 'Credit Report',
  ID_DOCUMENT: 'Identity Document',
  POA: 'Power of Attorney',
  PAYSLIP: 'Payslip',
  BANK_STATEMENT: 'Bank Statement',
  OTHER: 'Other Document',
};

const ID_DOC_TYPES = ['ID', 'PASSPORT', 'IDENTITY_DOCUMENT', 'SMART_CARD', 'GREEN_ID_BOOK'];
const POA_DOC_TYPES = ['POA', 'ZENOWETHU_POA', 'ZDM_POA', 'ZDM', 'POWER_OF_ATTORNEY', 'AUTHORIZATION', 'APPLICATION_FORM'];
const CREDIT_REPORT_DOC_TYPES = ['CREDIT_REPORT', 'CREDIT_BUREAU_REPORT', 'CREDIT_REPORT_OTHER', 'CREDIT_REPORT_EXPERIAN', 'CREDIT_REPORT_TRANSUNION', 'CREDIT_REPORT_XDS', 'CREDIT_REPORT_LIGHTSTONE', 'EXPERIAN', 'TRANSUNION', 'XDS', 'CLEAR_SCORE', 'KUDOUGH'];

export function getMissingDocsStatus(confidence: ConfidenceReportType, uploadedDocTypes?: string[]) {
  const hasId = uploadedDocTypes
    ? uploadedDocTypes.some((t) => ID_DOC_TYPES.includes(t))
    : confidence.presentItems.includes('ID_DOCUMENT') || confidence.presentItems.includes('ID');

  const hasPoa = uploadedDocTypes
    ? uploadedDocTypes.some((t) => POA_DOC_TYPES.includes(t))
    : confidence.presentItems.includes('POA') ||
      confidence.presentItems.includes('POWER_OF_ATTORNEY') ||
      confidence.presentItems.includes('ZENOWETHU_POA');

  const hasCreditReport = uploadedDocTypes
    ? uploadedDocTypes.some((t) => CREDIT_REPORT_DOC_TYPES.includes(t))
    : confidence.presentItems.some((item) =>
        [
          'CREDIT_REPORT',
          'CREDIT_REPORT_TRANSUNION',
          'CREDIT_REPORT_EXPERIAN',
          'CREDIT_REPORT_XDS',
          'CREDIT_REPORT_LIGHTSTONE',
        ].includes(item),
      );

  return {
    isMissingIdPoa: !hasId || !hasPoa,
    isMissingCreditReport: !hasCreditReport,
  };
}

export function ConfidenceReport({
  confidence,
  caseId,
  onTabSwitch,
  uploadedDocTypes,
  onRefresh,
}: ConfidenceReportProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [activeGroup, setActiveGroup] = useState<'ID_POA' | 'CREDIT_REPORT' | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchSuccess, setSearchSuccess] = useState('');

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

  const { isMissingIdPoa, isMissingCreditReport } = getMissingDocsStatus(confidence, uploadedDocTypes);

  const handleSearchEmails = async (docGroup: 'ID_POA' | 'CREDIT_REPORT') => {
    setIsSearching(true);
    setActiveGroup(docGroup);
    setSearchProgress(5);
    setSearchMessage(`Searching connected mailboxes for ${docGroup === 'ID_POA' ? 'ID & POA' : 'Credit Report'}...`);
    setSearchError('');
    setSearchSuccess('');

    try {
      const res = await fetch(`/api/cases/${caseId}/dhs-decline/check-fee-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookbackDays: 365,
          mailboxId: 'ALL',
          docGroup,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Email harvest failed');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader available');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.type === 'progress') {
              setSearchProgress(chunk.progress || 0);
              setSearchMessage(`Searching mailboxes: Scanned ${chunk.emailsScanned || 0} emails, ${chunk.newEmailsFound || 0} new...`);
            } else if (chunk.type === 'complete') {
              if (chunk.data.success) {
                const uploadCount = chunk.data.scanSummary?.uploadedDocuments ?? 0;
                if (uploadCount > 0) {
                  setSearchSuccess(chunk.data.message || `Harvest complete. Found and uploaded ${uploadCount} document(s).`);
                } else {
                  setSearchError(`Harvest complete. No matching documents found in emails.`);
                }
                onRefresh?.();
              } else {
                throw new Error(chunk.data.error || 'Harvest failed');
              }
            } else if (chunk.type === 'error') {
              throw new Error(chunk.error || 'An error occurred during email harvest');
            }
          } catch (e: any) {
            console.error('Error parsing line:', e);
            if (e.message && (e.message.includes('Harvest') || e.message.includes('error'))) {
              throw e;
            }
          }
        }
      }
    } catch (e: any) {
      setSearchError(e.message || 'Failed to search emails');
    } finally {
      setIsSearching(false);
      setActiveGroup(null);
      setSearchProgress(0);
      setSearchMessage('');
    }
  };

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

          {/* Email Search Section */}
          {(isMissingIdPoa || isMissingCreditReport) && (
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-400 mr-2 font-medium">📬 Missing files? Search connected mailboxes:</span>
              {isMissingIdPoa && (
                <button
                  type="button"
                  onClick={() => handleSearchEmails('ID_POA')}
                  disabled={isSearching}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-600/50 hover:text-white transition-all duration-200"
                >
                  {isSearching && activeGroup === 'ID_POA' ? 'Searching ID/POA...' : '🔍 Search Emails for ID/POA'}
                </button>
              )}
              {isMissingCreditReport && (
                <button
                  type="button"
                  onClick={() => handleSearchEmails('CREDIT_REPORT')}
                  disabled={isSearching}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600/30 text-green-300 border border-green-500/30 hover:bg-green-600/50 hover:text-white transition-all duration-200"
                >
                  {isSearching && activeGroup === 'CREDIT_REPORT' ? 'Searching Credit...' : '🔍 Search Emails for Credit Report'}
                </button>
              )}
            </div>
          )}

          {/* Search Progress */}
          {isSearching && (
            <div className="mt-3 p-3 rounded-lg border border-cyan-500/20 bg-cyan-900/10 text-cyan-200 text-xs">
              <div className="flex justify-between items-center mb-1.5 font-semibold">
                <span>{searchMessage}</span>
                <span>{searchProgress}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-cyan-400 h-1.5 transition-all duration-300 ease-out"
                  style={{ width: `${searchProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Search Status Messages */}
          {searchError && (
            <div className="mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs">
              {searchError}
            </div>
          )}
          {searchSuccess && (
            <div className="mt-3 p-2 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs">
              {searchSuccess}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
