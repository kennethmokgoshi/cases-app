import { prisma } from '@zenowethu/database';
import { formatDistanceToNow } from 'date-fns';
import { XdsSyncDetail } from '@zenowethu/shared-lib/src/xds/types';
import Link from 'next/link';

export const metadata = {
    title: 'XDS Sync Results | Zenowethu Cases',
    description: 'View the results of automated XDS credit report syncs.',
};

export const dynamic = 'force-dynamic';

export default async function XdsSyncResultsPage() {
    const logs = await prisma.xdsSyncLog.findMany({
        orderBy: { completedAt: 'desc' },
        take: 50,
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">XDS Sync Results</h1>
                <p className="text-slate-500 mt-1">
                    History of automated and manual XDS portal syncs.
                </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50">
                <div className="flex flex-col space-y-1.5 p-6 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 rounded-t-xl">
                    <h3 className="font-semibold leading-none tracking-tight">Recent Sync Runs</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Showing the last 50 sync operations</p>
                </div>
                <div className="p-0">
                    {logs.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            No sync logs found. Run a sync to see results here.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {logs.map((log) => (
                                <SyncLogItem key={log.id} log={log} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SyncLogItem({ log }: { log: any }) {
    const hasErrors = log.errors && Array.isArray(log.errors) && log.errors.length > 0;
    const details = log.details as XdsSyncDetail[] | null;

    return (
        <details className="group [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex-none text-slate-400 group-open:rotate-90 transition-transform">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                    <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                            {new Date(log.completedAt).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-500">
                            {formatDistanceToNow(new Date(log.completedAt), { addSuffix: true })}
                        </div>
                    </div>

                    <div>
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50 capitalize">
                            {log.mode} Mode
                        </span>
                    </div>

                    <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-slate-700 dark:text-slate-300">{log.processed}</span>
                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Processed</span>
                    </div>

                    <div className="flex gap-4 col-span-2 md:col-span-1 justify-end md:justify-center">
                        <div className="flex flex-col items-center">
                            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{log.existingFilesUpdated}</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Matched</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-xl font-bold text-green-600 dark:text-green-400">{log.newFilesCreated}</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">New Cases</span>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        {hasErrors ? (
                            <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-red-500 text-slate-50 shadow dark:bg-red-900 dark:text-slate-50 gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {log.errors.length} Errors
                            </span>
                        ) : (
                            <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Success
                            </span>
                        )}
                    </div>
                </div>
            </summary>

            <div className="px-14 pb-6 pt-2 bg-slate-50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800">
                
                {hasErrors && (
                    <div className="mb-6 p-4 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                        <h4 className="text-sm font-semibold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Errors encountered
                        </h4>
                        <ul className="text-sm text-red-700 dark:text-red-300 space-y-1 list-disc pl-5">
                            {log.errors.map((err: string, i: number) => (
                                <li key={i}>{err}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Consumer Details</h4>
                    
                    {!details || details.length === 0 ? (
                        <p className="text-sm text-slate-500">No records were processed in this run.</p>
                    ) : (
                        <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <table className="w-full caption-bottom text-sm">
                                <thead className="[&_tr]:border-b bg-white dark:bg-slate-900">
                                    <tr className="border-b transition-colors hover:bg-slate-100/50 data-[state=selected]:bg-slate-100 dark:hover:bg-slate-800/50 dark:data-[state=selected]:bg-slate-800">
                                        <th className="h-10 px-2 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0 dark:text-slate-400">Consumer Name</th>
                                        <th className="h-10 px-2 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0 dark:text-slate-400">Action</th>
                                        <th className="h-10 px-2 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0 dark:text-slate-400">Case File</th>
                                    </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0 bg-white dark:bg-slate-950">
                                    {details.map((detail, idx) => (
                                        <tr key={idx} className="border-b transition-colors hover:bg-slate-100/50 data-[state=selected]:bg-slate-100 dark:hover:bg-slate-800/50 dark:data-[state=selected]:bg-slate-800">
                                            <td className="p-2 align-middle font-medium">
                                                {detail.consumerName}
                                                {detail.idNumber && (
                                                    <span className="block text-xs text-slate-500 font-normal mt-0.5">
                                                        ID: {detail.idNumber}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2 align-middle">
                                                {detail.action === 'created' && (
                                                    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-green-50 text-green-700 border-green-200 gap-1.5">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg> New Case
                                                    </span>
                                                )}
                                                {detail.action === 'uploaded' && (
                                                    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200 gap-1.5">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg> Matched
                                                    </span>
                                                )}
                                                {detail.action === 'skipped' && (
                                                    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 border-slate-200 gap-1.5">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Skipped
                                                    </span>
                                                )}
                                                {detail.action === 'error' && (
                                                    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-red-500 text-slate-50 shadow gap-1.5">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Error
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-2 align-middle">
                                                {detail.caseId && detail.fileNumber ? (
                                                    <Link 
                                                        href={`/cases/${detail.caseId}`}
                                                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                        {detail.fileNumber}
                                                    </Link>
                                                ) : (
                                                    <span className="text-sm text-slate-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </details>
    );
}
