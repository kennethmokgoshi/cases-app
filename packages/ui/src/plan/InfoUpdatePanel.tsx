'use client';

import { useState } from 'react';
import type { PlanEvaluationResult } from '@zenowethu/plan-engine';

interface CasePlanUpdate {
  id: string;
  newInfoDescription: string;
  changeType: string;
  affectedStepNumbers: unknown;
  createdAt: string | Date;
}

interface InfoUpdatePanelProps {
  planId: string;
  recentUpdates: CasePlanUpdate[];
}

const CHANGE_TYPE_STYLES: Record<string, { badge: string; label: string }> = {
  NO_CHANGE: { badge: 'bg-green-500/20 text-green-300 border border-green-500/30', label: 'No Change' },
  PARTIAL_CHANGE: { badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', label: 'Partial Change' },
  MAJOR_CHANGE: { badge: 'bg-red-500/20 text-red-300 border border-red-500/30', label: 'Major Change' },
};

export function InfoUpdatePanel({ planId, recentUpdates }: InfoUpdatePanelProps) {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PlanEvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!description.trim() || description.trim().length < 10) {
      setError('Please provide at least 10 characters of description.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`/api/ai/plan/${planId}/submit-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data = await resp.json() as { result?: PlanEvaluationResult; error?: string };
      if (!resp.ok) throw new Error(data.error || 'Failed to submit');
      setResult(data.result ?? null);
      setDescription('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div>
        <h4 className="text-sm font-bold text-white">Add New Information</h4>
        <p className="text-xs text-gray-500 mt-0.5">
          Describe any new information and the AI will evaluate its impact on the plan.
        </p>
      </div>

      {/* Textarea */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe new information, e.g. DC responded with file, client provided updated payslip, creditor confirmed account was settled..."
        rows={3}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zeno-cyan resize-none"
      />

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || description.trim().length < 10}
        className="px-4 py-2 bg-zeno-cyan text-zeno-navy text-sm font-bold rounded-lg hover:bg-zeno-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Evaluating...' : 'Submit & Evaluate'}
      </button>

      {/* Result Panel */}
      {result && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${CHANGE_TYPE_STYLES[result.changeType]?.badge || ''}`}>
              {CHANGE_TYPE_STYLES[result.changeType]?.label || result.changeType}
            </span>
            <span className="text-xs text-gray-400">AI evaluation complete</span>
          </div>
          <p className="text-sm text-gray-300">{result.notificationMessage}</p>
          {result.affectedStepNumbers.length > 0 && (
            <p className="text-xs text-yellow-400">
              Affected steps: {result.affectedStepNumbers.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Recent Updates */}
      {recentUpdates.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-bold tracking-widest uppercase text-gray-500">
            Recent Updates
          </h5>
          {recentUpdates.slice(0, 3).map((update) => {
            const style = CHANGE_TYPE_STYLES[update.changeType] || CHANGE_TYPE_STYLES.NO_CHANGE;
            const date = new Date(update.createdAt);
            return (
              <div
                key={update.id}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-start gap-3"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${style.badge}`}>
                  {style.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{update.newInfoDescription}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
