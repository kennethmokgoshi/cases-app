'use client';

import { useState, useEffect } from 'react';
import { logger } from '@zenowethu/shared-lib';

interface ComparisonField {
    field: string;
    label: string;
    currentValue: string | number | null;
    aiValue: string | number | null;
    hasChanged: boolean;
}

interface ComparisonData {
    personalInfo: ComparisonField[];
    creditBureau: ComparisonField[];
    restructuring: ComparisonField[];
}

interface CaseData {
    id: string;
    client: {
        idNumber: string;
        firstName: string;
        lastName: string;
        phone: string | null;
    };
    totalDebtAmount: string | number | null;
    totalMonthlyInstallment: string | number | null;
    openAccounts: number;
    closedAccounts: number;
    cb_ncrdcNo: string | null;
    cb_debtCounsellor: string | null;
    cb_contactNo: string | null;
    cb_applicationDate: string | null;
    cb_status: string | null;
    cb_statusDate: string | null;
}

interface CompareAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    caseId: string;
    caseData?: CaseData;
    onUpdateComplete: () => void;
}

export function CompareAnalysisModal({
    isOpen,
    onClose,
    caseId,
    caseData: propCaseData,
    onUpdateComplete
}: CompareAnalysisModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisComplete, setAnalysisComplete] = useState(false);
    const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
    const [caseData, setCaseData] = useState<CaseData | null>(propCaseData || null);

    // Store AI-extracted values separately
    const [aiValues, setAiValues] = useState<{
        personalInfo: { [key: string]: string | number | null };
        creditBureau: { [key: string]: string | number | null };
        restructuring: { [key: string]: string | number | null };
    } | null>(null);

    // Fetch case data when modal opens if not provided via props
    useEffect(() => {
        if (isOpen && !caseData) {
            fetchCaseData();
        }
        // Reset state when modal opens
        if (isOpen) {
            setAnalysisComplete(false);
            setAiValues(null);
            setSelectedFields(new Set());
            setError(null);
        }
    }, [isOpen]);

    // Update case data if prop changes
    useEffect(() => {
        if (propCaseData) {
            setCaseData(propCaseData);
        }
    }, [propCaseData]);

    const fetchCaseData = async () => {
        try {
            const response = await fetch(`/api/cases/${caseId}`);
            if (response.ok) {
                const data = await response.json();
                setCaseData(data);
            }
        } catch (err) {
            logger.error('Failed to fetch case data:', err);
        }
    };

    // Build the comparison data structure with current values
    const buildComparisonData = (): ComparisonData | null => {
        if (!caseData) return null;

        const getAiValue = (category: string, field: string): string | number | null => {
            if (!aiValues) return null;
            return aiValues[category as keyof typeof aiValues]?.[field] ?? null;
        };

        const checkChanged = (currentVal: any, aiVal: any): boolean => {
            if (aiVal === null || aiVal === undefined) return false;
            if (currentVal === null && aiVal !== null) return true;
            return String(currentVal).trim() !== String(aiVal).trim();
        };

        const personalInfo: ComparisonField[] = [
            {
                field: 'idNumber',
                label: 'ID Number',
                currentValue: caseData.client.idNumber,
                aiValue: getAiValue('personalInfo', 'idNumber'),
                hasChanged: checkChanged(caseData.client.idNumber, getAiValue('personalInfo', 'idNumber'))
            },
            {
                field: 'lastName',
                label: 'Surname',
                currentValue: caseData.client.lastName,
                aiValue: getAiValue('personalInfo', 'lastName'),
                hasChanged: checkChanged(caseData.client.lastName, getAiValue('personalInfo', 'lastName'))
            },
            {
                field: 'firstName',
                label: 'Full Names',
                currentValue: caseData.client.firstName,
                aiValue: getAiValue('personalInfo', 'firstName'),
                hasChanged: checkChanged(caseData.client.firstName, getAiValue('personalInfo', 'firstName'))
            },
            {
                field: 'phone',
                label: 'Cell Number',
                currentValue: caseData.client.phone,
                aiValue: getAiValue('personalInfo', 'phone'),
                hasChanged: checkChanged(caseData.client.phone, getAiValue('personalInfo', 'phone'))
            },
        ];

        const creditBureau: ComparisonField[] = [
            {
                field: 'totalDebtAmount',
                label: 'Balance Exposure',
                currentValue: caseData.totalDebtAmount ? Number(caseData.totalDebtAmount) : null,
                aiValue: getAiValue('creditBureau', 'totalDebtAmount'),
                hasChanged: checkChanged(caseData.totalDebtAmount, getAiValue('creditBureau', 'totalDebtAmount'))
            },
            {
                field: 'totalMonthlyInstallment',
                label: 'Monthly Instalment',
                currentValue: caseData.totalMonthlyInstallment ? Number(caseData.totalMonthlyInstallment) : null,
                aiValue: getAiValue('creditBureau', 'totalMonthlyInstallment'),
                hasChanged: checkChanged(caseData.totalMonthlyInstallment, getAiValue('creditBureau', 'totalMonthlyInstallment'))
            },
            {
                field: 'openAccounts',
                label: 'Active Accounts',
                currentValue: caseData.openAccounts,
                aiValue: getAiValue('creditBureau', 'openAccounts'),
                hasChanged: checkChanged(caseData.openAccounts, getAiValue('creditBureau', 'openAccounts'))
            },
            {
                field: 'closedAccounts',
                label: 'Closed Accounts',
                currentValue: caseData.closedAccounts,
                aiValue: getAiValue('creditBureau', 'closedAccounts'),
                hasChanged: checkChanged(caseData.closedAccounts, getAiValue('creditBureau', 'closedAccounts'))
            },
        ];

        const restructuring: ComparisonField[] = [
            {
                field: 'cb_ncrdcNo',
                label: 'Registration No.',
                currentValue: caseData.cb_ncrdcNo,
                aiValue: getAiValue('restructuring', 'cb_ncrdcNo'),
                hasChanged: checkChanged(caseData.cb_ncrdcNo, getAiValue('restructuring', 'cb_ncrdcNo'))
            },
            {
                field: 'cb_debtCounsellor',
                label: 'Debt Counsellor',
                currentValue: caseData.cb_debtCounsellor,
                aiValue: getAiValue('restructuring', 'cb_debtCounsellor'),
                hasChanged: checkChanged(caseData.cb_debtCounsellor, getAiValue('restructuring', 'cb_debtCounsellor'))
            },
            {
                field: 'cb_contactNo',
                label: 'Contact No.',
                currentValue: caseData.cb_contactNo,
                aiValue: getAiValue('restructuring', 'cb_contactNo'),
                hasChanged: checkChanged(caseData.cb_contactNo, getAiValue('restructuring', 'cb_contactNo'))
            },
            {
                field: 'cb_applicationDate',
                label: 'Application Date',
                currentValue: caseData.cb_applicationDate ? new Date(caseData.cb_applicationDate).toISOString().split('T')[0] : null,
                aiValue: getAiValue('restructuring', 'cb_applicationDate'),
                hasChanged: checkChanged(caseData.cb_applicationDate, getAiValue('restructuring', 'cb_applicationDate'))
            },
            {
                field: 'cb_status',
                label: 'Status Description',
                currentValue: caseData.cb_status,
                aiValue: getAiValue('restructuring', 'cb_status'),
                hasChanged: checkChanged(caseData.cb_status, getAiValue('restructuring', 'cb_status'))
            },
            {
                field: 'cb_statusDate',
                label: 'Status Date',
                currentValue: caseData.cb_statusDate ? new Date(caseData.cb_statusDate).toISOString().split('T')[0] : null,
                aiValue: getAiValue('restructuring', 'cb_statusDate'),
                hasChanged: checkChanged(caseData.cb_statusDate, getAiValue('restructuring', 'cb_statusDate'))
            },
        ];

        return { personalInfo, creditBureau, restructuring };
    };

    const [progressMessage, setProgressMessage] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);

    // Run the AI analysis
    const runAnalysis = async () => {
        setIsLoading(true);
        setError(null);
        setProgressMessage('Starting analysis...');
        setProgress(2);
        setSelectedFields(new Set());

        try {
            const response = await fetch(`/api/cases/${caseId}/compare-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start analysis');
            }

            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let finalData = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                accumulated += decoder.decode(value, { stream: true });
                const lines = accumulated.split('\n');
                accumulated = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let update;
                    try {
                        update = JSON.parse(line);
                    } catch (e) {
                        logger.error('Error parsing stream line:', e);
                        continue;
                    }

                    if (update.type === 'progress') {
                        setProgressMessage(update.message);
                        if (typeof update.progress === 'number') {
                            setProgress(update.progress);
                        }
                    } else if (update.type === 'error') {
                        throw new Error(update.message);
                    } else if (update.type === 'result') {
                        finalData = update.data;
                        setProgress(100);
                    }
                }
            }

            if (!finalData || !finalData.comparison) {
                logger.error('❌ Analysis failed to yield valid comparison data:', finalData);
                throw new Error('Analysis completed but the response was incomplete. Please try again or verify the documents are clear.');
            }

            const data = finalData;

            // Extract AI values from the comparison response
            const newAiValues = {
                personalInfo: {} as { [key: string]: string | number | null },
                creditBureau: {} as { [key: string]: string | number | null },
                restructuring: {} as { [key: string]: string | number | null } };

            // Map the API response to our AI values structure
            data.comparison.personalInfo.forEach((f: any) => {
                newAiValues.personalInfo[f.field] = f.newValue;
            });
            data.comparison.creditBureau.forEach((f: any) => {
                newAiValues.creditBureau[f.field] = f.newValue;
            });
            data.comparison.restructuring.forEach((f: any) => {
                newAiValues.restructuring[f.field] = f.newValue;
            });

            setAiValues(newAiValues);
            setAnalysisComplete(true);

            // Auto-select all changed fields
            const comparison = buildComparisonDataWithAiValues(newAiValues);
            if (comparison) {
                const changedFields = new Set<string>();
                [...comparison.personalInfo, ...comparison.creditBureau, ...comparison.restructuring]
                    .filter((f: ComparisonField) => f.hasChanged && f.aiValue !== null)
                    .forEach((f: ComparisonField) => changedFields.add(f.field));
                setSelectedFields(changedFields);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsLoading(false);
            setProgressMessage(null);
        }
    };

    // Build comparison data with specific AI values (for auto-select after analysis)
    const buildComparisonDataWithAiValues = (aiVals: typeof aiValues): ComparisonData | null => {
        if (!caseData || !aiVals) return null;

        const getAiValue = (category: string, field: string): string | number | null => {
            return aiVals[category as keyof typeof aiVals]?.[field] ?? null;
        };

        const checkChanged = (currentVal: any, aiVal: any): boolean => {
            if (aiVal === null || aiVal === undefined) return false;
            if (currentVal === null && aiVal !== null) return true;
            return String(currentVal).trim() !== String(aiVal).trim();
        };

        // Same structure as buildComparisonData but uses the passed aiVals
        const personalInfo: ComparisonField[] = [
            { field: 'idNumber', label: 'ID Number', currentValue: caseData.client.idNumber, aiValue: getAiValue('personalInfo', 'idNumber'), hasChanged: checkChanged(caseData.client.idNumber, getAiValue('personalInfo', 'idNumber')) },
            { field: 'lastName', label: 'Surname', currentValue: caseData.client.lastName, aiValue: getAiValue('personalInfo', 'lastName'), hasChanged: checkChanged(caseData.client.lastName, getAiValue('personalInfo', 'lastName')) },
            { field: 'firstName', label: 'Full Names', currentValue: caseData.client.firstName, aiValue: getAiValue('personalInfo', 'firstName'), hasChanged: checkChanged(caseData.client.firstName, getAiValue('personalInfo', 'firstName')) },
            { field: 'phone', label: 'Cell Number', currentValue: caseData.client.phone, aiValue: getAiValue('personalInfo', 'phone'), hasChanged: checkChanged(caseData.client.phone, getAiValue('personalInfo', 'phone')) },
        ];

        const creditBureau: ComparisonField[] = [
            { field: 'totalDebtAmount', label: 'Balance Exposure', currentValue: caseData.totalDebtAmount ? Number(caseData.totalDebtAmount) : null, aiValue: getAiValue('creditBureau', 'totalDebtAmount'), hasChanged: checkChanged(caseData.totalDebtAmount, getAiValue('creditBureau', 'totalDebtAmount')) },
            { field: 'totalMonthlyInstallment', label: 'Monthly Instalment', currentValue: caseData.totalMonthlyInstallment ? Number(caseData.totalMonthlyInstallment) : null, aiValue: getAiValue('creditBureau', 'totalMonthlyInstallment'), hasChanged: checkChanged(caseData.totalMonthlyInstallment, getAiValue('creditBureau', 'totalMonthlyInstallment')) },
            { field: 'openAccounts', label: 'Active Accounts', currentValue: caseData.openAccounts, aiValue: getAiValue('creditBureau', 'openAccounts'), hasChanged: checkChanged(caseData.openAccounts, getAiValue('creditBureau', 'openAccounts')) },
            { field: 'closedAccounts', label: 'Closed Accounts', currentValue: caseData.closedAccounts, aiValue: getAiValue('creditBureau', 'closedAccounts'), hasChanged: checkChanged(caseData.closedAccounts, getAiValue('creditBureau', 'closedAccounts')) },
        ];

        const restructuring: ComparisonField[] = [
            { field: 'cb_ncrdcNo', label: 'Registration No.', currentValue: caseData.cb_ncrdcNo, aiValue: getAiValue('restructuring', 'cb_ncrdcNo'), hasChanged: checkChanged(caseData.cb_ncrdcNo, getAiValue('restructuring', 'cb_ncrdcNo')) },
            { field: 'cb_debtCounsellor', label: 'Debt Counsellor', currentValue: caseData.cb_debtCounsellor, aiValue: getAiValue('restructuring', 'cb_debtCounsellor'), hasChanged: checkChanged(caseData.cb_debtCounsellor, getAiValue('restructuring', 'cb_debtCounsellor')) },
            { field: 'cb_contactNo', label: 'Contact No.', currentValue: caseData.cb_contactNo, aiValue: getAiValue('restructuring', 'cb_contactNo'), hasChanged: checkChanged(caseData.cb_contactNo, getAiValue('restructuring', 'cb_contactNo')) },
            { field: 'cb_applicationDate', label: 'Application Date', currentValue: caseData.cb_applicationDate ? new Date(caseData.cb_applicationDate).toISOString().split('T')[0] : null, aiValue: getAiValue('restructuring', 'cb_applicationDate'), hasChanged: checkChanged(caseData.cb_applicationDate, getAiValue('restructuring', 'cb_applicationDate')) },
            { field: 'cb_status', label: 'Status Description', currentValue: caseData.cb_status, aiValue: getAiValue('restructuring', 'cb_status'), hasChanged: checkChanged(caseData.cb_status, getAiValue('restructuring', 'cb_status')) },
            { field: 'cb_statusDate', label: 'Status Date', currentValue: caseData.cb_statusDate ? new Date(caseData.cb_statusDate).toISOString().split('T')[0] : null, aiValue: getAiValue('restructuring', 'cb_statusDate'), hasChanged: checkChanged(caseData.cb_statusDate, getAiValue('restructuring', 'cb_statusDate')) },
        ];

        return { personalInfo, creditBureau, restructuring };
    };

    const comparison = buildComparisonData();

    // Toggle field selection
    const toggleField = (field: string) => {
        const newSelected = new Set(selectedFields);
        if (newSelected.has(field)) {
            newSelected.delete(field);
        } else {
            newSelected.add(field);
        }
        setSelectedFields(newSelected);
    };

    // Select all changed fields
    const selectAllChanged = () => {
        if (!comparison) return;
        const changedFields = new Set<string>();
        [...comparison.personalInfo, ...comparison.creditBureau, ...comparison.restructuring]
            .filter(f => f.hasChanged && f.aiValue !== null)
            .forEach(f => changedFields.add(f.field));
        setSelectedFields(changedFields);
    };

    // Deselect all
    const deselectAll = () => {
        setSelectedFields(new Set());
    };

    // Apply selected updates
    const applyUpdates = async () => {
        if (!comparison || selectedFields.size === 0) return;

        setIsApplying(true);
        setError(null);

        try {
            // Build updates object from selected fields
            const updates: { [key: string]: any } = {};
            const allFields = [...comparison.personalInfo, ...comparison.creditBureau, ...comparison.restructuring];

            for (const f of allFields) {
                if (selectedFields.has(f.field)) {
                    updates[f.field] = f.aiValue;
                }
            }

            const response = await fetch(`/api/cases/${caseId}/apply-updates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to apply updates');
            }

            // Success - close modal and refresh case data
            onUpdateComplete();
            onClose();

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply updates');
        } finally {
            setIsApplying(false);
        }
    };

    // Format value for display
    const formatValue = (value: string | number | null): string => {
        if (value === null || value === undefined) return '—';
        if (typeof value === 'number') {
            // Format as currency if it looks like money
            if (value >= 100) {
                return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            return value.toString();
        }
        return String(value);
    };

    // Render a section of the comparison table
    const renderSection = (title: string, fields: ComparisonField[]) => (
        <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-700 pb-2">
                {title}
            </h4>
            <table className="w-full">
                <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                        <th className="text-left py-2 px-2 w-8">
                            {analysisComplete && (
                                <input
                                    type="checkbox"
                                    className="rounded bg-gray-700 border-gray-600"
                                    checked={fields.filter(f => f.hasChanged && f.aiValue !== null).every(f => selectedFields.has(f.field))}
                                    onChange={() => {
                                        const sectionFields = fields.filter(f => f.hasChanged && f.aiValue !== null);
                                        const allSelected = sectionFields.every(f => selectedFields.has(f.field));
                                        const newSelected = new Set(selectedFields);
                                        sectionFields.forEach(f => {
                                            if (allSelected) {
                                                newSelected.delete(f.field);
                                            } else {
                                                newSelected.add(f.field);
                                            }
                                        });
                                        setSelectedFields(newSelected);
                                    }}
                                />
                            )}
                        </th>
                        <th className="text-left py-2 px-2">Field</th>
                        <th className="text-left py-2 px-2">Current (Database)</th>
                        <th className="text-left py-2 px-2">AI Extracted</th>
                    </tr>
                </thead>
                <tbody>
                    {fields.map((field) => (
                        <tr
                            key={field.field}
                            className={`border-b border-gray-800 ${field.hasChanged && analysisComplete ? 'bg-yellow-900/20' : ''}`}
                        >
                            <td className="py-3 px-2">
                                {analysisComplete && (
                                    <input
                                        type="checkbox"
                                        className="rounded bg-gray-700 border-gray-600 text-blue-500"
                                        checked={selectedFields.has(field.field)}
                                        onChange={() => toggleField(field.field)}
                                        disabled={!field.hasChanged || field.aiValue === null}
                                    />
                                )}
                            </td>
                            <td className="py-3 px-2 text-gray-300 font-medium">
                                {field.label}
                            </td>
                            <td className="py-3 px-2 text-white font-medium">
                                {formatValue(field.currentValue)}
                            </td>
                            <td className={`py-3 px-2 ${field.hasChanged && analysisComplete ? 'text-green-400 font-medium' : 'text-gray-500'}`}>
                                {!analysisComplete && !isLoading && (
                                    <span className="text-gray-600 italic">Awaiting analysis...</span>
                                )}
                                {isLoading && (
                                    <span className="text-blue-400 italic flex items-center gap-2">
                                        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                        Analyzing...
                                    </span>
                                )}
                                {analysisComplete && (
                                    <>
                                        {formatValue(field.aiValue)}
                                        {field.hasChanged && field.aiValue !== null && (
                                            <span className="ml-2 text-xs bg-green-600/30 text-green-400 px-1.5 py-0.5 rounded">DIFFERENT</span>
                                        )}
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-white">Re-Analyze & Compare</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Review current data and compare with AI-extracted values from documents
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Error State */}
                    {error && (
                        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 mb-4">
                            <p className="text-red-400">{error}</p>
                            <button
                                onClick={runAnalysis}
                                className="mt-2 text-sm text-red-300 underline hover:text-red-200"
                            >
                                Try Again
                            </button>
                        </div>
                    )}

                    {/* Action buttons at top */}
                    {comparison && (
                        <div className="flex items-center gap-3 mb-6">
                            {!analysisComplete && !isLoading && (
                                <button
                                    onClick={runAnalysis}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                    Run AI Analysis
                                </button>
                            )}
                            {isLoading && (
                                <div className="flex flex-col gap-2 w-full max-w-md">
                                    <div className="flex items-center justify-between text-xs text-blue-400 font-medium">
                                        <span>{progressMessage || 'Analyzing...'}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-blue-500 h-full transition-all duration-500 ease-out"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                    <div className="flex items-center gap-2 text-blue-400 font-medium text-sm mt-1">
                                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                        {progressMessage || 'Analyzing documents... This may take a minute.'}
                                    </div>
                                </div>
                            )}
                            {analysisComplete && (
                                <>
                                    <button
                                        onClick={selectAllChanged}
                                        className="text-sm px-3 py-1.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition"
                                    >
                                        Select All Different
                                    </button>
                                    <button
                                        onClick={deselectAll}
                                        className="text-sm px-3 py-1.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition"
                                    >
                                        Deselect All
                                    </button>
                                    <button
                                        onClick={runAnalysis}
                                        disabled={isLoading}
                                        className="text-sm px-3 py-1.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 transition disabled:opacity-50"
                                    >
                                        Re-run Analysis
                                    </button>
                                    <span className="text-sm text-gray-500 ml-auto">
                                        {selectedFields.size} field(s) selected for update
                                    </span>
                                </>
                            )}
                        </div>
                    )}

                    {/* Comparison Table - Always visible if we have case data */}
                    {comparison && (
                        <>
                            {renderSection('Personal Information', comparison.personalInfo)}
                            {renderSection('Credit Bureau - Accounts Summary', comparison.creditBureau)}
                            {renderSection('Restructuring Information', comparison.restructuring)}
                        </>
                    )}

                    {/* Loading case data */}
                    {!caseData && (
                        <div className="text-center py-12">
                            <div className="w-12 h-12 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-gray-400">Loading case data...</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-900/50">
                    <div className="text-sm text-gray-500">
                        {!analysisComplete && 'Click "Run AI Analysis" to extract values from documents'}
                        {analysisComplete && 'Select fields and click "Apply Updates" to save changes'}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            disabled={isApplying}
                            className="px-4 py-2 text-gray-300 hover:text-white transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        {analysisComplete && (
                            <button
                                onClick={applyUpdates}
                                disabled={selectedFields.size === 0 || isApplying}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isApplying ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Applying...
                                    </>
                                ) : (
                                    <>
                                        Apply {selectedFields.size} Update{selectedFields.size !== 1 ? 's' : ''}
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
