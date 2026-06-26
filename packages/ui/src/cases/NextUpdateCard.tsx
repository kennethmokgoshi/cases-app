'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '../ui/Toaster';
import {
    nextUpdateLabel,
    isNextUpdateOverdue,
    daysUntilNextUpdate,
    type NextUpdateApp,
} from '@zenowethu/shared-lib';

type NextUpdateRow = {
    nextUpdateDate: string | null;
    note: string | null;
    isOverdue: boolean;
    updatedAt: string;
} | null;

export interface NextUpdateCardProps {
    /** Which app this card belongs to — its date is isolated to this app. */
    app: NextUpdateApp;
    caseId: string;
    /** Override the API path. Defaults to `/api/cases/${caseId}/next-update`. */
    apiBase?: string;
}

function toDateInput(value: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

/**
 * Self-contained card for viewing and setting THIS app's next-update date for a
 * case. Each app renders it with its own `app` key, so the date set here never
 * appears in another app.
 */
export function NextUpdateCard({ app, caseId, apiBase }: NextUpdateCardProps) {
    const base = apiBase ?? `/api/cases/${caseId}/next-update`;
    const label = nextUpdateLabel(app);

    const [row, setRow] = useState<NextUpdateRow>(null);
    const [dateValue, setDateValue] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(base, { cache: 'no-store' });
            if (!res.ok) throw new Error(`Could not load (${res.status})`);
            const data = await res.json();
            const nu: NextUpdateRow = data.nextUpdate;
            setRow(nu);
            setDateValue(toDateInput(nu?.nextUpdateDate ?? null));
            setNote(nu?.note ?? '');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [base]);

    useEffect(() => {
        load();
    }, [load]);

    const save = useCallback(async () => {
        setSaving(true);
        try {
            const res = await fetch(base, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nextUpdateDate: dateValue ? new Date(dateValue).toISOString() : null,
                    note: note || null,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ? JSON.stringify(body.error) : `Save failed (${res.status})`);
            }
            const data = await res.json();
            setRow(data.nextUpdate);
            toast.success(`${label} updated`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    }, [base, dateValue, note, label]);

    const overdue = isNextUpdateOverdue(row?.nextUpdateDate ?? null);
    const days = daysUntilNextUpdate(row?.nextUpdateDate ?? null);

    return (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold">{label}</h2>
                {!loading && row?.nextUpdateDate && (
                    <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            overdue
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                    >
                        {overdue
                            ? `Overdue${days !== null ? ` by ${Math.abs(days)}d` : ''}`
                            : days !== null
                              ? `In ${days}d`
                              : 'Set'}
                    </span>
                )}
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400" />
                    Loading…
                </div>
            ) : error ? (
                <div className="text-sm">
                    <p className="text-amber-400 mb-2">{error}</p>
                    <button onClick={load} className="text-cyan-400 hover:underline">
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    <p className="text-xs text-gray-500 mb-3">
                        This date is specific to the {app.charAt(0) + app.slice(1).toLowerCase()} app — it does not
                        affect any other app. When it passes, this file becomes overdue here.
                    </p>
                    <label className="text-xs text-gray-500 mb-1 block">Date</label>
                    <input
                        type="date"
                        value={dateValue}
                        onChange={(e) => setDateValue(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-3 focus:border-cyan-500 focus:outline-none"
                    />
                    <label className="text-xs text-gray-500 mb-1 block">Note (optional)</label>
                    <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Why is this the next action date?"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-3 placeholder-gray-600 focus:border-cyan-500 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={save}
                            disabled={saving}
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                        {dateValue && (
                            <button
                                onClick={() => setDateValue('')}
                                disabled={saving}
                                className="px-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
