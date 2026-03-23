'use client';

import { useState } from 'react';

interface CasePlanStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  ownerApp: string;
  category: string;
  actionType: string;
  status: string;
  requiresApproval: boolean;
  breakpointBefore: boolean;
  breakpointAfter: boolean;
  waitingForEvent: string | null;
  executedAt: string | Date | null;
  completedAt: string | Date | null;
  result: unknown | null;
  error: string | null;
}

interface PlanStepCardProps {
  step: CasePlanStep;
  planId: string;
  onRefresh: () => void;
}

const APP_STYLES: Record<string, string> = {
  CASES: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  LEGAL: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  INSURANCE: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  FORENSIC: 'bg-red-500/20 text-red-300 border border-red-500/30',
  FINANCE: 'bg-green-500/20 text-green-300 border border-green-500/30',
  GHL: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse',
  WAITING_FOR_USER: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  COMPLETED: 'bg-green-500/20 text-green-300 border border-green-500/30',
  FAILED: 'bg-red-500/20 text-red-300 border border-red-500/30',
  SKIPPED: 'bg-gray-600/20 text-gray-500 border border-gray-600/30',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_USER: 'Waiting',
  COMPLETED: 'Done',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

export function PlanStepCard({ step, planId, onRefresh }: PlanStepCardProps) {
  const [actioning, setActioning] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

  const appStyle = APP_STYLES[step.ownerApp] || APP_STYLES.CASES;
  const statusStyle = STATUS_STYLES[step.status] || STATUS_STYLES.PENDING;

  const handleBreakpoint = async (field: 'breakpointBefore' | 'breakpointAfter', value: boolean) => {
    try {
      await fetch(`/api/ai/plan/${planId}/step/${step.id}/breakpoint`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      onRefresh();
    } catch {
      // non-critical
    }
  };

  const handleApprove = async () => {
    setActioning(true);
    try {
      await fetch(`/api/ai/plan/${planId}/step/${step.id}/approve`, { method: 'POST' });
      onRefresh();
    } finally {
      setActioning(false);
    }
  };

  const handleResume = async () => {
    setActioning(true);
    try {
      await fetch(`/api/ai/plan/${planId}/step/${step.id}/resume`, { method: 'POST' });
      onRefresh();
    } finally {
      setActioning(false);
    }
  };

  return (
    <div
      className={`border rounded-xl p-4 space-y-3 transition-all ${
        step.status === 'FAILED'
          ? 'border-red-500/30 bg-red-500/5'
          : step.status === 'COMPLETED'
            ? 'border-green-500/20 bg-green-500/5'
            : step.status === 'IN_PROGRESS'
              ? 'border-blue-500/30 bg-blue-500/5'
              : step.status === 'WAITING_FOR_USER'
                ? 'border-yellow-500/30 bg-yellow-500/5'
                : 'border-white/10 bg-white/5'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3">
        {/* Step Number Circle */}
        <div className="w-8 h-8 rounded-full bg-zeno-cyan/20 border border-zeno-cyan/40 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xs font-black text-zeno-cyan">{step.stepNumber}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${appStyle}`}>
              {step.ownerApp}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-500 border border-white/10">
              {step.category.replace(/_/g, ' ')}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${statusStyle}`}>
              {STATUS_LABELS[step.status] || step.status}
            </span>
            {step.requiresApproval && step.status !== 'COMPLETED' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-bold">
                Requires Approval
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white">{step.title}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.description}</p>
        </div>
      </div>

      {/* Breakpoint Toggles (only on PENDING steps) */}
      {step.status === 'PENDING' && (
        <div className="flex items-center gap-4 pt-1 border-t border-white/5">
          {/* Breakpoint Before */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <div
              onClick={() => handleBreakpoint('breakpointBefore', !step.breakpointBefore)}
              className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${
                step.breakpointBefore ? 'bg-zeno-cyan' : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  step.breakpointBefore ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
              Wait before
            </span>
          </label>

          {/* Breakpoint After */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <div
              onClick={() => handleBreakpoint('breakpointAfter', !step.breakpointAfter)}
              className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${
                step.breakpointAfter ? 'bg-zeno-cyan' : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  step.breakpointAfter ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
              Wait after
            </span>
          </label>
        </div>
      )}

      {/* Action Buttons */}
      {step.status === 'WAITING_FOR_USER' && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          {step.requiresApproval ? (
            <button
              onClick={handleApprove}
              disabled={actioning}
              className="px-4 py-1.5 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-xs font-bold rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
            >
              {actioning ? 'Processing...' : 'Approve & Execute'}
            </button>
          ) : (
            <button
              onClick={handleResume}
              disabled={actioning}
              className="px-4 py-1.5 bg-zeno-cyan/20 text-zeno-cyan border border-zeno-cyan/30 text-xs font-bold rounded-lg hover:bg-zeno-cyan/30 disabled:opacity-50 transition-colors"
            >
              {actioning ? 'Processing...' : 'Resume'}
            </button>
          )}
          {step.waitingForEvent && (
            <span className="text-xs text-gray-500">
              Waiting for: {step.waitingForEvent.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      )}

      {/* Result Section */}
      {step.status === 'COMPLETED' && step.result && (
        <div className="border-t border-green-500/20 pt-2">
          <button
            onClick={() => setResultExpanded(!resultExpanded)}
            className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
          >
            <span>{resultExpanded ? '▼' : '▶'}</span> Result details
          </button>
          {resultExpanded && (
            <pre className="mt-2 text-xs text-green-300 bg-green-500/10 rounded-lg p-3 overflow-auto max-h-32">
              {JSON.stringify(step.result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Error Section */}
      {step.status === 'FAILED' && step.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-xs font-bold text-red-400 mb-1">Error</p>
          <p className="text-xs text-red-300">{step.error}</p>
        </div>
      )}
    </div>
  );
}
