'use client';

import { formatStatus } from '@zenowethu/shared-lib';

type WorkflowLog = {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    timestamp: string;
    notes: string | null;
    user?: {
        firstName: string;
        lastName: string;
    } | null;
};

interface WorkflowTimelineProps {
    workflowLogs: WorkflowLog[];
}

export function WorkflowTimeline({ workflowLogs }: WorkflowTimelineProps) {
    if (!workflowLogs || workflowLogs.length === 0) {
        return (
            <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl">
                <p className="text-gray-500 text-sm">No status history recorded for this case.</p>
            </div>
        );
    }

    return (
        <div className="relative pl-8 space-y-8 before:absolute before:inset-y-0 before:left-3 before:w-0.5 before:bg-gradient-to-b before:from-zeno-cyan/50 before:via-zeno-cyan/20 before:to-transparent">
            {workflowLogs.map((log, index) => (
                <div key={log.id} className="relative animate-in fade-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${index * 50}ms` }}>
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[25px] mt-1.5 w-4 h-4 rounded-full border-2 bg-zeno-navy z-10 ${
                        index === 0 ? 'border-zeno-cyan shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'border-white/20'
                    }`} />

                    <div className="bg-zeno-blue/10 border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all hover:bg-zeno-blue/20 group">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                {log.fromStatus ? (
                                    <>
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{formatStatus(log.fromStatus)}</span>
                                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </>
                                ) : (
                                    <span className="text-[10px] bg-zeno-cyan/20 text-zeno-cyan px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Initial</span>
                                )}
                                <span className={`text-sm font-bold tracking-tight ${index === 0 ? 'text-zeno-cyan' : 'text-white'}`}>
                                    {formatStatus(log.toStatus)}
                                </span>
                            </div>
                            <time className="text-[11px] font-medium text-gray-500 group-hover:text-gray-400 transition-colors">
                                {new Date(log.timestamp).toLocaleString(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                })}
                            </time>
                        </div>

                        {log.notes && (
                            <div className="bg-black/20 rounded-lg p-3 text-sm text-gray-300 border border-white/5 mb-3 italic">
                                "{log.notes}"
                            </div>
                        )}

                        {log.user && (
                            <div className="flex items-center gap-2 mt-auto">
                                <div className="w-6 h-6 rounded-full bg-zeno-cyan/10 flex items-center justify-center text-[10px] font-bold text-zeno-cyan border border-zeno-cyan/20">
                                    {log.user.firstName[0]}{log.user.lastName[0]}
                                </div>
                                <span className="text-xs text-gray-500">
                                    Updated by <span className="text-gray-300 font-medium">{log.user.firstName} {log.user.lastName}</span>
                                </span>
                            </div>
                        )}
                        
                        {!log.user && (
                            <div className="flex items-center gap-2 mt-auto">
                                <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-500 border border-white/10">
                                    SY
                                </div>
                                <span className="text-xs text-gray-500">
                                    System Automation
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
