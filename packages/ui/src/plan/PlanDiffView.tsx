'use client';

import type { PlanStepDefinition } from '@zenowethu/plan-engine';

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
}

interface PlanDiffViewProps {
  oldSteps: CasePlanStep[];
  newSteps: PlanStepDefinition[];
  affectedStepNumbers: number[];
}

const APP_COLORS: Record<string, string> = {
  CASES: 'bg-cyan-500/20 text-cyan-300',
  LEGAL: 'bg-purple-500/20 text-purple-300',
  INSURANCE: 'bg-orange-500/20 text-orange-300',
  FORENSIC: 'bg-red-500/20 text-red-300',
  FINANCE: 'bg-green-500/20 text-green-300',
  GHL: 'bg-gray-500/20 text-gray-300',
};

function StepRow({
  step,
  isAffected,
  side,
}: {
  step: { stepNumber: number; title: string; description: string; ownerApp: string };
  isAffected: boolean;
  side: 'old' | 'new';
}) {
  const appColor = APP_COLORS[step.ownerApp] || 'bg-gray-500/20 text-gray-300';
  const highlightClass = isAffected
    ? 'border-yellow-500/40 bg-yellow-500/5'
    : 'border-white/10 bg-white/5';

  return (
    <div className={`border rounded-lg p-3 space-y-1 ${highlightClass}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-500">#{step.stepNumber}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${appColor}`}>
          {step.ownerApp}
        </span>
        {isAffected && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30">
            AFFECTED
          </span>
        )}
      </div>
      <p className="text-sm text-white font-medium">{step.title}</p>
      <p className="text-xs text-gray-400 line-clamp-2">{step.description}</p>
    </div>
  );
}

export function PlanDiffView({ oldSteps, newSteps, affectedStepNumbers }: PlanDiffViewProps) {
  const affectedSet = new Set(affectedStepNumbers);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-bold">
          MAJOR CHANGE
        </span>
        <span className="text-xs text-gray-500">Plan comparison — review carefully before proceeding</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Old Steps */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold tracking-widest uppercase text-gray-500 border-b border-white/10 pb-2">
            Previous Plan
          </h4>
          {oldSteps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              isAffected={affectedSet.has(step.stepNumber)}
              side="old"
            />
          ))}
          {oldSteps.length === 0 && (
            <p className="text-xs text-gray-600 italic">No previous steps</p>
          )}
        </div>

        {/* New Steps */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold tracking-widest uppercase text-gray-500 border-b border-white/10 pb-2">
            Updated Plan
          </h4>
          {newSteps.map((step) => (
            <StepRow
              key={step.stepNumber}
              step={step}
              isAffected={affectedSet.has(step.stepNumber)}
              side="new"
            />
          ))}
          {newSteps.length === 0 && (
            <p className="text-xs text-gray-600 italic">No new steps provided</p>
          )}
        </div>
      </div>
    </div>
  );
}
