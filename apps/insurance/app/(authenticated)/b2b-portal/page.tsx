'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@zenowethu/shared-lib/src/logger';

type Partner = {
    id: string;
    name: string;
    clientType: string;
    totalCases: number;
    activeCases: number;
    completedCases: number;
};

type PartnerCase = {
    id: string;
    fileNumber: string;
    clientName: string;
    status: string;
    createdAt: string;
    services: string;
};

export default function B2BPortalPage() {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
    const [partnerCases, setPartnerCases] = useState<PartnerCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [casesLoading, setCasesLoading] = useState(false);

    useEffect(() => {
        fetchPartners();
    }, []);

    useEffect(() => {
        if (selectedPartner) {
            fetchPartnerCases(selectedPartner);
        }
    }, [selectedPartner]);

    const fetchPartners = async () => {
        try {
            const res = await fetch('/api/b2b/partners');
            if (res.ok) {
                const data = await res.json();
                setPartners(data);
                if (data.length > 0) {
                    setSelectedPartner(data[0].id);
                }
            }
        } catch (error) {
            logger.error('Failed to fetch partners:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPartnerCases = async (partnerId: string) => {
        setCasesLoading(true);
        try {
            const res = await fetch(`/api/b2b/partners/${partnerId}/cases`);
            if (res.ok) {
                const data = await res.json();
                setPartnerCases(data);
            }
        } catch (error) {
            logger.error('Failed to fetch partner cases:', error);
        } finally {
            setCasesLoading(false);
        }
    };

    const currentPartner = partners.find(p => p.id === selectedPartner);

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <Link href="/" className="text-zeno-cyan hover:text-cyan-300 text-sm mb-4 inline-block">
                    ← Back to Dashboard
                </Link>
                <h1 className="text-3xl font-bold text-white mb-2">B2B Partner Portal</h1>
                <p className="text-gray-400">Manage and track cases from your B2B partners</p>
            </div>

            {loading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-zeno-cyan border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading partners...</p>
                </div>
            ) : partners.length === 0 ? (
                <div className="bg-zeno-gray rounded-xl p-8 border border-white/10 text-center">
                    <div className="text-6xl mb-4">🤝</div>
                    <h3 className="text-xl font-semibold text-white mb-2">No B2B Partners Found</h3>
                    <p className="text-gray-400 mb-4">Create B2B acquisition sources in the Admin Projects page to see them here.</p>
                    <Link href="/admin/projects" className="text-zeno-cyan hover:text-cyan-300">
                        Go to Admin Projects →
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Partner Selector */}
                    <div className="lg:col-span-1">
                        <div className="bg-zeno-gray rounded-xl border border-white/10 p-4">
                            <h3 className="text-lg font-semibold text-white mb-4">Partners</h3>
                            <div className="space-y-2">
                                {partners.map(partner => (
                                    <button
                                        key={partner.id}
                                        onClick={() => setSelectedPartner(partner.id)}
                                        className={`w-full p-3 rounded-lg text-left transition-colors ${selectedPartner === partner.id
                                                ? 'bg-zeno-cyan/20 border border-zeno-cyan/50'
                                                : 'bg-zeno-navy hover:bg-zeno-blue border border-transparent'
                                            }`}
                                    >
                                        <p className="font-medium text-white">{partner.name}</p>
                                        <p className="text-xs text-gray-400">{partner.totalCases} total cases</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Partner Details & Cases */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Stats Cards */}
                        {currentPartner && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-zeno-gray rounded-xl p-5 border border-white/10">
                                    <h4 className="text-gray-400 text-sm mb-1">Total Cases</h4>
                                    <p className="text-3xl font-bold text-white">{currentPartner.totalCases}</p>
                                </div>
                                <div className="bg-zeno-gray rounded-xl p-5 border border-white/10">
                                    <h4 className="text-gray-400 text-sm mb-1">Active Cases</h4>
                                    <p className="text-3xl font-bold text-zeno-cyan">{currentPartner.activeCases}</p>
                                </div>
                                <div className="bg-zeno-gray rounded-xl p-5 border border-white/10">
                                    <h4 className="text-gray-400 text-sm mb-1">Completed</h4>
                                    <p className="text-3xl font-bold text-green-400">{currentPartner.completedCases}</p>
                                </div>
                            </div>
                        )}

                        {/* Cases Table */}
                        <div className="bg-zeno-gray rounded-xl border border-white/10 p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-white">Partner Cases</h3>
                                <Link
                                    href={`/b2b-dashboard/cases/new?partnerId=${selectedPartner}`}
                                    className="px-4 py-2 bg-zeno-cyan text-zeno-navy font-medium rounded-lg hover:bg-cyan-400 transition-colors text-sm"
                                >
                                    + New Case for Partner
                                </Link>
                            </div>

                            {casesLoading ? (
                                <div className="text-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-zeno-cyan border-t-transparent mx-auto"></div>
                                </div>
                            ) : partnerCases.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">No cases found for this partner.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/10">
                                                <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">File #</th>
                                                <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Client</th>
                                                <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Services</th>
                                                <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Status</th>
                                                <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Created</th>
                                                <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {partnerCases.map(c => (
                                                <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                                                    <td className="py-3 px-4">
                                                        <Link href={`/cases/${c.id}`} className="text-zeno-cyan hover:text-cyan-300">
                                                            {c.fileNumber}
                                                        </Link>
                                                    </td>
                                                    <td className="py-3 px-4 text-white">{c.clientName}</td>
                                                    <td className="py-3 px-4 text-gray-400 text-sm">{c.services || 'N/A'}</td>
                                                    <td className="py-3 px-4">
                                                        <span className="px-2 py-1 bg-zeno-cyan/20 text-zeno-cyan rounded text-xs">
                                                            {c.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-gray-400 text-sm">{c.createdAt}</td>
                                                    <td className="py-3 px-4">
                                                        <Link
                                                            href={`/cases/${c.id}`}
                                                            className="text-zeno-cyan hover:text-cyan-300 text-sm"
                                                        >
                                                            View →
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

