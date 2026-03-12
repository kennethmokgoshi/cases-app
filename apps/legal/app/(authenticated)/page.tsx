'use client';

import { useSession } from '@zenowethu/ui';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import RescissionTracker from '@/components/dashboard/RescissionTracker';
import DisputeTracker from '@/components/dashboard/DisputeTracker';
import PrescriptionTracker from '@/components/dashboard/PrescriptionTracker';
import PrescriptionCalculator from '@/components/dashboard/PrescriptionCalculator';
import RetentionTable from '@/components/dashboard/RetentionTable';

export default function LegalDashboard() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.userType === 'B2B_PARTNER') {
      window.location.href = window.location.hostname === 'localhost'
        ? 'http://localhost:3000/b2b-dashboard'
        : 'https://cases.zenowethu.co.za/b2b-dashboard';
    }

    if (status === 'authenticated') {
      fetchStats();
    }
  }, [session, status]);

  async function fetchStats() {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch legal stats:', e);
    } finally {
      setLoading(false);
    }
  }

  const rescissionsCount = stats?.counts?.rescissions || 0;
  const disputesCount = stats?.counts?.disputes || 0;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Legal Command Center</h1>
          <p className="text-gray-400">
            Welcome back, <span className="text-blue-400 font-semibold">{session?.user?.firstName}</span>.
            {loading ? (
              <span> Loading your active matters...</span>
            ) : (
              <>
                You have <span className="text-white font-bold">{rescissionsCount} active rescissions</span> and <span className="text-white font-bold">{disputesCount} active disputes</span>.
              </>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/cases/new?type=rescission"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2"
          >
            <span>⚡</span> New Rescission Application
          </Link>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[800px]">
        {/* Left Column: Trackers (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Top: Active Rescissions */}
          <div className="min-h-[400px]">
            <RescissionTracker />
          </div>

          {/* Bottom: Prescription Tracking (Active Matters) */}
          <div className="min-h-[400px]">
            <PrescriptionTracker />
          </div>
        </div>

        {/* Right Column: Tools (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6 h-full">
          {/* Top: Dispute Clock */}
          <div className="h-[400px]">
            <DisputeTracker />
          </div>

          {/* Bottom: Tools/Reference */}
          <div className="flex flex-col gap-6">
            <PrescriptionCalculator />
            <RetentionTable />
          </div>
        </div>
      </div>
    </div>
  );
}
