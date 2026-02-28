'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { logger } from '@zenowethu/shared-lib';

type Case = {
  id: string;
  fileNumber: string;
  status: string;
  updatedAt: string;
  client: {
    firstName: string;
    lastName: string;
  };
};

type DashboardStats = {
  totalActiveCases: number;
  newLeadsToday: number;
  pendingInvoices: number;
  slaBreaches: number;
  overdueCases: number;
  myCasesCount: number;
  assignedCasesCount: number;
};



export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [stats, setStats] = useState({
    totalActiveCases: 0,
    assessmentsCount: 0,
    policiesReviewed: 0,
    totalSavings: 0,
    pendingUnderwriting: 0,
    activePolicies: 0,
    declinedAssessments: 0,
    lettersGenerated: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Redirect B2B partners to their dedicated dashboard
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.userType === 'B2B_PARTNER') {
      // Use window.location for cross-app redirect (Port 3001 -> Port 3000)
      window.location.href = 'http://localhost:3000/b2b-dashboard';
    }
  }, [session, status]);

  // Track client-side hydration to prevent date formatting mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  async function fetchData() {
    setError(null);
    setLoading(true);
    try {
      // Fetch both cases (limited to 5) and stats in parallel for speed
      const [casesRes, statsRes] = await Promise.all([
        fetch('/api/cases?take=5'),
        fetch('/api/dashboard/stats')
      ]);

      if (!casesRes.ok) throw new Error('Database Error: Unable to reach cases API');
      if (!statsRes.ok) throw new Error('Database Error: Unable to reach stats API');

      const [casesData, statsData] = await Promise.all([
        casesRes.json(),
        statsRes.json()
      ]);

      if (Array.isArray(casesData)) {
        setRecentCases(casesData);
      } else {
        throw new Error('Database Error: Invalid data format');
      }

      setStats(statsData);
    } catch (error: any) {
      logger.error('Failed to fetch data', error);
      setError(error.message || 'Connection Failure');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-12">
        <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          Welcome back, {session?.user?.firstName || 'User'}
        </h2>
        <p className="text-gray-400 max-w-2xl">
          You have identified <span className="text-zeno-cyan font-bold">R {stats.totalSavings.toLocaleString()}</span> in annual savings for clients.
          System status is <span className="text-green-400 font-bold">Operational</span>.
        </p>
      </div>

      {/* Insurance Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {/* Metric 1: Total Savings */}
        <div className="bg-zeno-blue/30 p-6 rounded-xl border border-zeno-cyan/30 backdrop-blur-sm group hover:border-zeno-cyan/50 transition-all">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Total Annual Savings</h3>
            <span className="p-2 bg-green-500/20 rounded-lg text-green-400">
              💰
            </span>
          </div>
          <p className="text-3xl font-bold text-white group-hover:text-green-400 transition-colors">
            R {stats.totalSavings.toLocaleString()}
          </p>
        </div>

        {/* Metric 2: Policies Reviewed */}
        <div className="bg-zeno-blue/30 p-6 rounded-xl border border-zeno-cyan/30 backdrop-blur-sm group hover:border-zeno-cyan/50 transition-all">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Policies Reviewed</h3>
            <span className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
              📄
            </span>
          </div>
          <p className="text-3xl font-bold text-white group-hover:text-blue-400 transition-colors">
            {stats.policiesReviewed}
          </p>
          <p className="text-xs text-gray-400 mt-2">Across all active cases</p>
        </div>

        {/* Metric 3: Active Assessments */}
        <div className="bg-zeno-blue/30 p-6 rounded-xl border border-zeno-cyan/30 backdrop-blur-sm group hover:border-zeno-cyan/50 transition-all">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Assessments Conducted</h3>
            <span className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
              📊
            </span>
          </div>
          <p className="text-3xl font-bold text-white group-hover:text-purple-400 transition-colors">
            {stats.assessmentsCount}
          </p>
        </div>

        {/* Metric 4: Active Files */}
        <Link href="/cases" className="bg-zeno-blue/30 p-6 rounded-xl border border-zeno-cyan/30 backdrop-blur-sm hover:bg-zeno-blue/50 transition-all cursor-pointer group">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-gray-400 text-sm font-medium">Active Insurance Files</h3>
            <span className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
              📂
            </span>
          </div>
          <p className="text-3xl font-bold text-white group-hover:text-orange-400 transition-colors">
            {stats.totalActiveCases.toLocaleString()}
          </p>
        </Link>
      </div>

      {/* Underwriting Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link
          href="/underwriting?status=DRAFT"
          className="bg-zeno-blue/20 p-4 rounded-xl border border-yellow-500/20 hover:border-yellow-500/40 transition-all group"
        >
          <p className="text-gray-400 text-xs mb-1">Pending Underwriting</p>
          <p className="text-2xl font-bold text-white group-hover:text-yellow-400 transition-colors">
            {stats.pendingUnderwriting}
          </p>
        </Link>

        <Link
          href="/underwriting"
          className="bg-zeno-blue/20 p-4 rounded-xl border border-green-500/20 hover:border-green-500/40 transition-all group"
        >
          <p className="text-gray-400 text-xs mb-1">Active Policies</p>
          <p className="text-2xl font-bold text-white group-hover:text-green-400 transition-colors">
            {stats.activePolicies}
          </p>
        </Link>

        <div className="bg-zeno-blue/20 p-4 rounded-xl border border-purple-500/20">
          <p className="text-gray-400 text-xs mb-1">Letters Generated</p>
          <p className="text-2xl font-bold text-white">{stats.lettersGenerated}</p>
        </div>

        <div className="bg-zeno-blue/20 p-4 rounded-xl border border-red-500/20">
          <p className="text-gray-400 text-xs mb-1">Declined</p>
          <p className="text-2xl font-bold text-white">{stats.declinedAssessments}</p>
        </div>
      </div>

      {/* Recent Activity / Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-zeno-blue/20 rounded-2xl border border-white/5 p-6">
          <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-zeno-orange"></span>
            Recent Assessments
          </h3>
          <div className="space-y-4">
            {error ? (
              <div className="p-8 text-center bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm">{error}</p>
                <button onClick={() => fetchData()} className="text-xs text-red-300 underline mt-2">Retry</button>
              </div>
            ) : loading ? (
              <p className="text-gray-500">Loading recent cases...</p>
            ) : recentCases.length > 0 ? (
              recentCases.map((c) => (
                <Link
                  key={c.id}
                  href={`/cases/${c.id}`}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/5 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-zeno-navy flex items-center justify-center text-zeno-cyan font-bold text-sm border border-white/10">
                      {c.client.firstName[0]}{c.client.lastName[0]}
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{c.client.firstName} {c.client.lastName} - {c.fileNumber}</h4>
                      <p className="text-xs text-gray-400">Status: <span className="text-zeno-cyan">{c.status}</span></p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500">{mounted ? new Date(c.updatedAt).toLocaleDateString() : ''}</span>
                </Link>
              ))
            ) : (
              <p className="text-gray-500">No insurance assessments found. Start a new one to see it here.</p>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-b from-zeno-cyan/10 to-transparent rounded-2xl border border-zeno-cyan/20 p-6">
          <h3 className="text-lg font-semibold mb-6 text-zeno-cyan">Auditor Actions</h3>
          <div className="space-y-3">
            <Link
              href="/cases/new?type=insurance"
              className="w-full py-4 px-4 bg-zeno-cyan hover:bg-cyan-400 text-zeno-navy font-bold rounded-lg transition-all shadow-lg shadow-zeno-cyan/20 flex items-center justify-center gap-2"
            >
              <span>✅</span> Start New Assessment
            </Link>

            <Link
              href="/documents/templates/substitution"
              className="w-full py-3 px-4 bg-zeno-blue hover:bg-white/10 text-white font-medium rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2"
            >
              <span>📠</span> Generate Substitution Notice
            </Link>

            <Link
              href="/reports?type=savings"
              className="w-full py-3 px-4 bg-zeno-blue hover:bg-white/10 text-white font-medium rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2"
            >
              <span>📈</span> View Savings Report
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
