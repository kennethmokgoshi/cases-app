"use client";

import { useState } from "react";
import { UploadCloud, FileText, CheckCircle, AlertTriangle, Play, ChevronRight, Loader2 } from "lucide-react";

const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
};

interface AnalysisResult {
    parties: string[];
    effectiveDate: string | null;
    expirationDate: string | null;
    termDuration: string | null;
    keyObligations: string[];
    missingClauses: string[];
    riskFactors: string[];
    summary: string;
}

export default function NewAgreementPage() {
    const [file, setFile] = useState<File | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleAnalyze = async () => {
        if (!file) return;

        setAnalyzing(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch("/api/agreements/analyze", {
                method: "POST",
                body: formData });

            if (!response.ok) throw new Error("Analysis failed");

            const data = await response.json();
            setResult(data.analysis);
        } catch (error) {
            logger.error(error);
            alert("Failed to analyze agreement. Please try again.");
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">New Agreement</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Upload a contract to analyze with AI and prepare for signature.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Upload Section */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            onChange={handleFileChange}
                            accept=".pdf,.txt,.docx"
                        />
                        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                            <UploadCloud className="w-12 h-12 text-blue-500 mb-4" />
                            <span className="font-semibold text-gray-900 dark:text-gray-100">Click to upload</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">PDF, DOCX, or TXT</span>
                        </label>
                    </div>

                    {file && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-center justify-between border border-blue-100 dark:border-blue-800">
                            <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <span className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate max-w-[180px]">
                                    {file.name}
                                </span>
                            </div>
                            <button
                                onClick={handleAnalyze}
                                disabled={analyzing}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {analyzing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" /> Analyze
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* Results Section */}
                <div className="lg:col-span-2">
                    {result ? (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">

                            {/* Header */}
                            <div className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide">
                                        AI Analysis Complete
                                    </span>
                                </div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Contract Insight</h2>
                                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{result.summary}</p>
                            </div>

                            <div className="p-6 grid gap-8">

                                {/* Key Details */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Parties Involved</h3>
                                        <ul className="space-y-2">
                                            {result.parties.map((p, i) => (
                                                <li key={i} className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {p}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Dates & Term</h3>
                                        <div className="text-sm text-gray-800 dark:text-gray-200 space-y-1">
                                            <p><span className="text-gray-500">Effective:</span> {result.effectiveDate || "Not found"}</p>
                                            <p><span className="text-gray-500">Expires:</span> {result.expirationDate || "Not found"}</p>
                                            <p><span className="text-gray-500">Duration:</span> {result.termDuration || "Not found"}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Risk Factors */}
                                {result.riskFactors.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-medium text-rose-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" /> Risk Factors
                                        </h3>
                                        <ul className="space-y-2">
                                            {result.riskFactors.map((risk, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 bg-rose-50 dark:bg-rose-900/10 p-2 rounded border border-rose-100 dark:border-rose-900/20">
                                                    <span className="mt-0.5">•</span> {risk}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Missing Clauses */}
                                {result.missingClauses.length > 0 && (
                                    <div>
                                        <h3 className="text-sm font-medium text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            Missing Standard Clauses
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {result.missingClauses.map((clause, i) => (
                                                <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                                                    {clause}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* Action Footer */}
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-6 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
                                <button className="px-4 py-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 text-sm font-medium">
                                    Discard
                                </button>
                                <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm shadow-green-200 dark:shadow-none">
                                    <CheckCircle className="w-4 h-4" />
                                    Prepare for Signature
                                </button>
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No agreement analyzed yet</h3>
                            <p className="text-gray-500 dark:text-gray-400 max-w-sm mt-2">
                                Upload a contract on the left to invoke the Smart Legal Assistant.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
