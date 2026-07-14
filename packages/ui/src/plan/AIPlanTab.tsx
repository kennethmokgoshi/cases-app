'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConfidenceReport } from './ConfidenceReport';
import { PlanStepCard } from './PlanStepCard';
import { InfoUpdatePanel } from './InfoUpdatePanel';
import type { ConfidenceReport as ConfidenceReportType } from '@zenowethu/plan-engine';

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
  executedAt: string | null;
  completedAt: string | null;
  result: unknown | null;
  error: string | null;
}

interface CasePlanUpdate {
  id: string;
  newInfoDescription: string;
  changeType: string;
  affectedStepNumbers: unknown;
  createdAt: string;
}

interface CasePlan {
  id: string;
  caseId: string;
  status: string;
  confidenceScore: number;
  caseType: string | null;
  version: number;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: CasePlanStep[];
  updates: CasePlanUpdate[];
}

interface PlanData {
  plan: CasePlan | null;
  confidence: ConfidenceReportType;
  planReadyToStart: boolean;
  acquisitionType: string;
}

interface AIPlanTabProps {
  caseId: string;
  /** Retained for caller compatibility — readiness confirmation now applies to all acquisition types. */
  acquisitionType?: string;
}

/** Structured error surfaced in the banner — detail and hint come from the API when available. */
export interface PlanError {
  message: string;
  detail?: string;
  hint?: string;
  code?: string;
}

/**
 * Maps a failed /api/ai/plan/generate response body to the structured banner error.
 * Falls back to listing missing documents as the detail when the API sends no detail.
 */
export function buildPlanGenerationError(data: {
  error?: string;
  code?: string;
  detail?: string;
  hint?: string;
  missingRequired?: string[];
}): PlanError {
  return {
    message: data.error || 'Failed to generate plan',
    code: data.code,
    detail: data.detail
      || (data.missingRequired?.length ? `Missing required documents: ${data.missingRequired.join(', ')}` : undefined),
    hint: data.hint,
  };
}

const PLAN_STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  AWAITING_APPROVAL: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  APPROVED: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  IN_PROGRESS: 'bg-cyan-500/20 text-zeno-cyan border border-cyan-500/30 animate-pulse',
  PAUSED: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  COMPLETED: 'bg-green-500/20 text-green-300 border border-green-500/30',
  CANCELLED: 'bg-red-500/20 text-red-300 border border-red-500/30',
};

/**
 * Plan-generation gating — mirrors the server rule in /api/ai/plan/generate:
 * ALL cases require both sufficient documents and the staff readiness flag.
 */
export function getPlanGenerationGate(input: {
  confidenceCanProceed: boolean;
  planReadyToStart: boolean;
  planStatus?: string | null;
}): { canGenerate: boolean; blockedReason: string } {
  if (!input.confidenceCanProceed) {
    return { canGenerate: false, blockedReason: 'Upload required documents first' };
  }
  if (!input.planReadyToStart) {
    return { canGenerate: false, blockedReason: 'Tick the readiness checkbox above first' };
  }
  if (input.planStatus === 'IN_PROGRESS') {
    return { canGenerate: true, blockedReason: 'Cannot regenerate while plan is running' };
  }
  return { canGenerate: true, blockedReason: '' };
}

const CASE_TYPE_STYLES: Record<string, string> = {
  DEBT_REVIEW_APPLICATION: 'bg-green-500/20 text-green-300',
  DEBT_REVIEW_FLAG_REMOVAL: 'bg-indigo-500/20 text-indigo-300',
  PRESCRIPTION_DISPUTE: 'bg-purple-500/20 text-purple-300',
  DEBT_REVIEW_TRANSFER: 'bg-blue-500/20 text-blue-300',
  INSURANCE_REPLACEMENT: 'bg-orange-500/20 text-orange-300',
  RECKLESS_LENDING: 'bg-red-500/20 text-red-300',
  COMBINED: 'bg-cyan-500/20 text-cyan-300',
  GENERAL: 'bg-gray-500/20 text-gray-300',
};

export function AIPlanTab({ caseId }: AIPlanTabProps) {
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);
  const [error, setError] = useState<PlanError | null>(null);
  const [showGuidanceModal, setShowGuidanceModal] = useState(false);
  const [guidanceText, setGuidanceText] = useState('');
  const [declining, setDeclining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPlanData = useCallback(async () => {
    try {
      const resp = await fetch(`/api/ai/plan/case/${caseId}`);
      const data = await resp.json() as PlanData & { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to fetch plan data');
      setPlanData(data);
      setError(null);
    } catch (err: unknown) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load plan data' });
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void fetchPlanData();
  }, [fetchPlanData]);

  // Poll every 30s when plan is IN_PROGRESS
  useEffect(() => {
    if (planData?.plan?.status === 'IN_PROGRESS') {
      pollRef.current = setInterval(() => void fetchPlanData(), 30000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [planData?.plan?.status, fetchPlanData]);

  const handleGenerate = async (force = false, userGuidance?: string) => {
    setGenerating(true);
    setError(null);
    try {
      const resp = await fetch('/api/ai/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, force, userGuidance: userGuidance?.trim() || undefined }),
      });
      const data = await resp.json() as {
        error?: string;
        code?: string;
        detail?: string;
        hint?: string;
        missingRequired?: string[];
      };
      if (!resp.ok) {
        setError(buildPlanGenerationError(data));
        return;
      }
      await fetchPlanData();
    } catch (err: unknown) {
      setError({
        message: 'Generation failed',
        detail: err instanceof Error ? err.message : String(err),
        hint: 'Check your network connection and that the server is running, then retry.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateClick = () => {
    const version = planData?.plan?.version ?? 1;
    // From the 3rd generation onwards, prompt for guidance before regenerating
    if (version >= 3) {
      setGuidanceText('');
      setShowGuidanceModal(true);
    } else {
      void handleGenerate(true);
    }
  };

  const handleGuidanceSubmit = () => {
    setShowGuidanceModal(false);
    void handleGenerate(true, guidanceText);
  };

  const handleDecline = async () => {
    if (!planData?.plan) return;
    setDeclining(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ai/plan/${planData.plan.id}/decline`, { method: 'POST' });
      if (!resp.ok) {
        const data = await resp.json() as { error?: string };
        throw new Error(data.error || 'Decline failed');
      }
      await fetchPlanData();
    } catch (err: unknown) {
      setError({ message: err instanceof Error ? err.message : 'Decline failed' });
    } finally {
      setDeclining(false);
    }
  };

  const handleToggleReady = async (ready: boolean) => {
    setTogglingReady(true);
    try {
      await fetch('/api/ai/plan/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, ready }),
      });
      await fetchPlanData();
    } finally {
      setTogglingReady(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!planData?.plan) return;
    setApproving(true);
    try {
      const resp = await fetch(`/api/ai/plan/${planData.plan.id}/approve`, { method: 'POST' });
      if (!resp.ok) {
        const data = await resp.json() as { error?: string };
        throw new Error(data.error || 'Approval failed');
      }
      await fetchPlanData();
    } catch (err: unknown) {
      setError({ message: err instanceof Error ? err.message : 'Approval failed' });
    } finally {
      setApproving(false);
    }
  };

  const handleStartExecution = async () => {
    if (!planData?.plan) return;
    setStarting(true);
    try {
      const resp = await fetch(`/api/ai/plan/${planData.plan.id}/start`, { method: 'POST' });
      if (!resp.ok) {
        const data = await resp.json() as { error?: string };
        throw new Error(data.error || 'Start failed');
      }
      await fetchPlanData();
    } catch (err: unknown) {
      setError({ message: err instanceof Error ? err.message : 'Start failed' });
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-zeno-cyan border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-gray-400 text-sm">Loading plan data...</span>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="flex items-center justify-center py-16 text-red-400 text-sm">
        {error?.message || 'Failed to load plan data'}
      </div>
    );
  }

  const { plan, confidence } = planData;

  const gate = getPlanGenerationGate({
    confidenceCanProceed: confidence.canProceed,
    planReadyToStart: planData.planReadyToStart,
    planStatus: plan?.status,
  });
  const canGenerate = gate.canGenerate;
  // A cancelled plan is treated as "no plan" — show the first-generate button
  const isCancelled = plan?.status === 'CANCELLED';
  const hasActivePlan = !!plan && !isCancelled;
  const canRegenerate =
    canGenerate &&
    hasActivePlan &&
    plan.status !== 'IN_PROGRESS';

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-red-300 font-semibold">{error.message}</p>
            {error.code && (
              <span className="shrink-0 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-mono">
                {error.code}
              </span>
            )}
          </div>
          {error.detail && <p className="text-red-300/90">{error.detail}</p>}
          {error.hint && (
            <p className="text-amber-300/90">
              <span className="font-semibold">What to do: </span>
              {error.hint}
            </p>
          )}
        </div>
      )}

      {/* SECTION 1: Confidence Report */}
      <ConfidenceReport confidence={confidence} caseId={caseId} />

      {/* SECTION 2: Readiness Checkbox */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={planData.planReadyToStart}
            onChange={(e) => void handleToggleReady(e.target.checked)}
            disabled={togglingReady}
            className="mt-0.5 w-4 h-4 accent-cyan-400 cursor-pointer"
          />
          <div>
            <p className="text-sm font-semibold text-white">
              Information sufficient to proceed
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Staff must confirm case information is sufficient before AI plan generation can begin.
            </p>
          </div>
        </label>
      </div>

      {/* SECTION 3: Generate / Regenerate */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Generate — when no plan exists or previous plan was declined */}
        {(!plan || isCancelled) && (
          <button
            onClick={() => void handleGenerate()}
            disabled={!canGenerate || generating}
            className="px-6 py-3 bg-zeno-cyan text-zeno-navy text-sm font-black tracking-wider uppercase rounded-xl hover:bg-zeno-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-zeno-navy border-t-transparent rounded-full animate-spin" />
                Generating Plan...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate AI Plan
              </>
            )}
          </button>
        )}

        {/* Regenerate — shown when an active (non-cancelled) plan exists */}
        {hasActivePlan && (
          <button
            onClick={handleRegenerateClick}
            disabled={!canRegenerate || generating}
            className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 text-xs font-bold tracking-wider uppercase rounded-xl hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate Plan
                {plan.version > 1 && (
                  <span className="text-gray-500 font-normal">v{plan.version} → v{plan.version + 1}</span>
                )}
              </>
            )}
          </button>
        )}

        {!canGenerate && !generating && gate.blockedReason && (
          <p className="text-xs text-gray-500">{gate.blockedReason}</p>
        )}
      </div>

      {/* Guidance Modal — shown from 3rd generation onwards */}
      {showGuidanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1923] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-white font-bold text-base">Guide the AI Plan</h3>
              <p className="text-gray-400 text-sm">
                This is plan generation #{(planData?.plan?.version ?? 0) + 1}. Tell the AI what the previous plans got wrong or what to focus on this time.
              </p>
            </div>

            <textarea
              value={guidanceText}
              onChange={(e) => setGuidanceText(e.target.value)}
              placeholder="e.g. Focus on the prescribed accounts at Wesbank and FNB. The consumer has already signed the POA — skip that step. Start with the prescription letters."
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-zeno-cyan/50 resize-none"
              autoFocus
            />

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                onClick={() => setShowGuidanceModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowGuidanceModal(false); void handleGenerate(true); }}
                  className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 text-xs font-bold rounded-lg hover:bg-white/10 transition-colors"
                >
                  Skip — Generate Without Guidance
                </button>
                <button
                  onClick={handleGuidanceSubmit}
                  disabled={!guidanceText.trim()}
                  className="px-4 py-2 bg-zeno-cyan text-zeno-navy text-xs font-black rounded-lg hover:bg-zeno-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Generate with Guidance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: Plan Details */}
      {plan && plan.status !== 'DRAFT' && plan.status !== 'CANCELLED' && (
        <div className="space-y-4">
          {/* Plan Header */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {plan.caseType && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${CASE_TYPE_STYLES[plan.caseType] || CASE_TYPE_STYLES.GENERAL}`}
                    >
                      {plan.caseType.replace(/_/g, ' ')}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${PLAN_STATUS_STYLES[plan.status] || ''}`}
                  >
                    {plan.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-600">v{plan.version}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{plan.steps.length} steps</span>
                  <span>
                    {plan.steps.filter((s) => s.status === 'COMPLETED').length} completed
                  </span>
                  <span>
                    {plan.steps.filter((s) => s.requiresApproval).length} require approval
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {plan.status === 'AWAITING_APPROVAL' && (
                  <>
                    <button
                      onClick={() => void handleDecline()}
                      disabled={declining}
                      className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                    >
                      {declining ? 'Declining...' : 'Decline Plan'}
                    </button>
                    <button
                      onClick={() => void handleApprovePlan()}
                      disabled={approving}
                      className="px-4 py-2 bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-xs font-bold rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 transition-colors"
                    >
                      {approving ? 'Approving...' : 'Approve Plan'}
                    </button>
                  </>
                )}
                {(plan.status === 'APPROVED' || plan.status === 'PAUSED') && (
                  <button
                    onClick={() => void handleDecline()}
                    disabled={declining}
                    className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                  >
                    {declining ? 'Declining...' : 'Cancel Plan'}
                  </button>
                )}
                {plan.status === 'APPROVED' && (
                  <button
                    onClick={() => void handleStartExecution()}
                    disabled={starting}
                    className="px-4 py-2 bg-zeno-cyan/20 text-zeno-cyan border border-zeno-cyan/30 text-xs font-bold rounded-lg hover:bg-zeno-cyan/30 disabled:opacity-50 transition-colors"
                  >
                    {starting ? 'Starting...' : 'Start Execution'}
                  </button>
                )}
                {plan.status === 'PAUSED' && (
                  <span className="text-xs text-orange-400 font-medium">
                    Plan paused — review and resume individual steps below
                  </span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            {plan.steps.length > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progress</span>
                  <span>
                    {plan.steps.filter((s) => s.status === 'COMPLETED').length} /{' '}
                    {plan.steps.length}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-zeno-cyan rounded-full transition-all"
                    style={{
                      width: `${(plan.steps.filter((s) => s.status === 'COMPLETED').length / plan.steps.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Steps List */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold tracking-widest uppercase text-gray-500">
              Plan Steps
            </h4>
            {plan.steps.map((step) => (
              <PlanStepCard
                key={step.id}
                step={step}
                planId={plan.id}
                onRefresh={() => void fetchPlanData()}
              />
            ))}
          </div>

          {/* Info Submission */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <InfoUpdatePanel planId={plan.id} recentUpdates={plan.updates} />
          </div>

          {/* Recent Updates Summary */}
          {plan.updates.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold tracking-widest uppercase text-gray-500">
                Recent Plan Updates
              </h4>
              {plan.updates.slice(0, 3).map((update) => (
                <div
                  key={update.id}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-400"
                >
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold mr-2 ${
                      update.changeType === 'MAJOR_CHANGE'
                        ? 'bg-red-500/20 text-red-300'
                        : update.changeType === 'PARTIAL_CHANGE'
                          ? 'bg-yellow-500/20 text-yellow-300'
                          : 'bg-green-500/20 text-green-300'
                    }`}
                  >
                    {update.changeType.replace(/_/g, ' ')}
                  </span>
                  {update.newInfoDescription}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
