'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@zenowethu/ui';
import Link from 'next/link';

type ZenowethuCase = {
  id: string;
  fileNumber: string;
  status: string;
  clientId: string;
};

type ShosholozaClient = {
  rowIndex: number;
  fileNr: string;
  initials: string;
  surname: string;
  idNumber: string;
  personPay: string;
  cellNumber: string;
  debtReview: string;
  processNotes: string;
  form17W: string;
  ncrdc: string;
  fees: string;
  payment: string;
  date: string;
  poa: string;
  process: string;
  removed: string;
  paymentNotes: string;
  zenowethuCase: ZenowethuCase | null;
};

type Stats = {
  total: number;
  matched: number;
  unmatched: number;
};

type TabOption = 'COT Debt review list 2026' | 'COT Debt review list 2025';

const TABS: { label: string; value: TabOption }[] = [
  { label: '2026 List', value: 'COT Debt review list 2026' },
  { label: '2025 List', value: 'COT Debt review list 2025' },
];

export default function ShosholozaPage() {
  const { data: session } = useSession();
  const [clients, setClients] = useState<ShosholozaClient[]>([]);
  const [filtered, setFiltered] = useState<ShosholozaClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabOption>('COT Debt review list 2026');
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [stats, setStats] = useState<Stats>({ total: 0, matched: 0, unmatched: 0 });
  const [updating, setUpdating] = useState<number | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user) fetchClients();
  }, [session, tab]);

  useEffect(() => {
    let result = clients;
    if (filter === 'matched') result = result.filter(c => c.zenowethuCase !== null);
    if (filter === 'unmatched') result = result.filter(c => c.zenowethuCase === null);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.surname.toLowerCase().includes(q) ||
        c.initials.toLowerCase().includes(q) ||
        c.idNumber.includes(q) ||
        c.fileNr.toLowerCase().includes(q) ||
        c.cellNumber.includes(q)
      );
    }
    setFiltered(result);
  }, [clients, search, filter]);

  async function fetchClients() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/shosholoza?match=true&tab=${encodeURIComponent(tab)}`);
      if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
      const data = await res.json();
      setClients(data.clients ?? []);
      setStats({ total: data.total, matched: data.matched, unmatched: data.unmatched });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function pushUpdate(client: ShosholozaClient, field: string, value: string) {
    setUpdating(client.rowIndex);
    setUpdateMsg(null);
    try {
      const res = await fetch('/api/shosholoza', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: client.rowIndex, tab, [field]: value }),
      });
      if (!res.ok) throw new Error('Update failed');
      setUpdateMsg(`Updated row ${client.rowIndex} successfully`);
      await fetchClients();
    } catch (e: any) {
      setUpdateMsg(`Error: ${e.message}`);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shosholoza Clients</h1>
          <p className="text-sm text-gray-400 mt-1">COT Debt Review Recovery — live sync with Shosholoza's sheet</p>
        </div>
        <button
          onClick={fetchClients}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zeno-cyan/10 border border-zeno-cyan/30 text-zeno-cyan rounded-lg text-sm font-medium hover:bg-zeno-cyan/20 transition-colors disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-gray-400 mt-1">Total Clients</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{stats.matched}</div>
            <div className="text-xs text-gray-400 mt-1">In Zenowethu</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{stats.unmatched}</div>
            <div className="text-xs text-gray-400 mt-1">Not in Zenowethu</div>
          </div>
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
        {/* Sheet Tabs */}
        <div className="flex gap-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.value
                  ? 'bg-zeno-cyan text-zeno-navy'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Match Filter */}
        <div className="flex gap-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-1">
          {(['all', 'matched', 'unmatched'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by name, ID number, file nr or cell..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-zeno-cyan/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Update toast */}
      {updateMsg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${updateMsg.startsWith('Error') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          {updateMsg}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zeno-cyan"></div>
          <span className="ml-3 text-gray-400 text-sm">Loading Shosholoza clients...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg className="w-10 h-10 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-red-400 font-medium">{error}</p>
          <button onClick={fetchClients} className="mt-4 px-4 py-2 bg-zeno-cyan text-zeno-navy rounded-lg text-sm font-bold hover:bg-white transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          <div className="text-xs text-gray-500 mb-2">{filtered.length} client{filtered.length !== 1 ? 's' : ''} shown</div>
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">File Nr</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">ID Number</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Cell</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">17W</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">POA</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Process</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">In Zenowethu</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500">No clients found</td>
                  </tr>
                ) : (
                  filtered.map(client => (
                    <tr key={client.rowIndex} className="hover:bg-white/2 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">{client.fileNr}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-white">{client.initials} {client.surname}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-300 whitespace-nowrap">{client.idNumber}</td>
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap text-xs">{client.cellNumber}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {client.debtReview || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{client.form17W || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{client.poa || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap max-w-[160px] truncate" title={client.process}>{client.process || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {client.zenowethuCase ? (
                          <Link
                            href={`/cases/${client.zenowethuCase.id}`}
                            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {client.zenowethuCase.fileNumber}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                            </svg>
                            Not found
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => pushUpdate(client, 'process', `Zenowethu: Updated ${new Date().toLocaleDateString('en-ZA')}`)}
                          disabled={updating === client.rowIndex}
                          className="text-xs px-2 py-1 rounded-md bg-zeno-cyan/10 text-zeno-cyan border border-zeno-cyan/20 hover:bg-zeno-cyan/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {updating === client.rowIndex ? '...' : 'Update Sheet'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
