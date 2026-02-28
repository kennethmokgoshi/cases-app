'use client';

import { useState } from 'react';
import { DestinationPathSelector } from './DestinationPathSelector';

interface MoveProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProjectIds: string[];
    onSuccess: () => void;
}

export function MoveProjectModal({ isOpen, onClose, selectedProjectIds, onSuccess }: MoveProjectModalProps) {
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(false);
    const [error, setError] = useState('');
    const [pathDetails, setPathDetails] = useState<{
        year: string;
        month: string;
        sourceId: string;
        subprojectId?: string;
    } | null>(null);

    const handleMove = async () => {
        if (!pathDetails || !pathDetails.sourceId || !pathDetails.year || !pathDetails.month) {
            setError('Please complete the selection.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const baseProjectId = pathDetails.subprojectId || pathDetails.sourceId;

            // 1. Create/Find Year
            const yearRes = await fetch('/api/projects/ensure-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentId: baseProjectId,
                    name: pathDetails.year,
                    type: 'YEAR'
                }) });
            if (!yearRes.ok) throw new Error('Failed to create/find target Year project');
            const yearProject = await yearRes.json();

            // 2. Create/Find Month
            const monthRes = await fetch('/api/projects/ensure-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    parentId: yearProject.id,
                    name: pathDetails.month,
                    type: 'MONTH'
                }) });
            if (!monthRes.ok) throw new Error('Failed to create/find target Month project');
            const monthProject = await monthRes.json();

            const targetProjectId = monthProject.id;

            // 3. Update Projects
            const movePromises = selectedProjectIds.map(projectId =>
                fetch(`/api/projects/${projectId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parentId: targetProjectId })
                })
            );

            const results = await Promise.all(movePromises);
            const failed = results.filter(r => !r.ok);

            if (failed.length > 0) {
                throw new Error(`Failed to move ${failed.length} project(s)`);
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="w-full max-w-lg bg-zeno-navy border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ring-1 ring-white/20 animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Move Projects</h2>
                            <p className="text-xs text-gray-500">Reposition projects in hierarchy</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                        <p className="text-sm text-indigo-300">
                            You are moving <span className="font-bold text-white">{selectedProjectIds.length}</span> project(s).
                            Target structure will be created automatically if missing.
                        </p>
                    </div>

                    <DestinationPathSelector
                        onChange={(_, details) => setPathDetails(details)}
                        onError={setError}
                        onLoading={setPageLoading}
                    />

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 text-red-400 animate-in slide-in-from-top-2 duration-200">
                            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-sm">{error}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-white/5 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all font-medium"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleMove}
                        disabled={loading || pageLoading || !pathDetails?.sourceId}
                        className="px-8 py-2.5 bg-zeno-cyan text-zeno-navy font-bold rounded-xl hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-zeno-cyan/20 active:scale-95"
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-zeno-navy/30 border-t-zeno-navy rounded-full animate-spin"></div>
                                <span>Moving...</span>
                            </div>
                        ) : 'Move Projects'}
                    </button>
                </div>
            </div>
        </div>
    );
}
