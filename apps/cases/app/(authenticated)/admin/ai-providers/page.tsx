'use client';
import { confirm } from '@zenowethu/ui';


import { useSession } from '@zenowethu/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ProviderType = 'openai' | 'openrouter' | 'anthropic' | 'google' | 'other';

interface AiProvider {
    id: string;
    name: string;
    provider: ProviderType;
    apiKey: string;
    baseUrl: string | null;
    isActive: boolean;
    isDefault: boolean;
    taskAssignments: Record<string, string>;
    models: string[];
    createdAt: string;
}

interface FormState {
    name: string;
    provider: ProviderType;
    apiKey: string;
    baseUrl: string;
    isActive: boolean;
    isDefault: boolean;
    models: string;
    taskAssignments: Record<string, string>;
}

const PROVIDER_OPTIONS: { value: ProviderType; label: string; defaultBaseUrl?: string; hint?: string }[] = [
    { value: 'openai',     label: 'OpenAI (Direct)',                hint: 'Use your own OpenAI key directly' },
    { value: 'openrouter', label: 'OpenRouter (All models via 1 key)', defaultBaseUrl: 'https://openrouter.ai/api/v1', hint: 'One key gives access to Claude, GPT-4o, Gemini and more' },
    { value: 'anthropic',  label: 'Anthropic Claude (Direct)',      hint: 'Direct Anthropic API key' },
    { value: 'google',     label: 'Google Gemini (Direct)',         hint: 'Google AI Studio key' },
    { value: 'other',      label: 'Other / Custom',                  hint: 'Any OpenAI-compatible API' },
];

const AI_TASKS: { key: string; label: string; description: string; recommended?: string }[] = [
    { key: 'document_analysis',   label: 'Document Analysis',    description: 'ID, POA, Credit Reports, Payslips, Bank Statements',  recommended: 'gpt-4o' },
    { key: 'document_reanalysis', label: 'Document Re-analysis', description: 'Second opinion when you disagree with first result',   recommended: 'anthropic/claude-opus-4' },
    { key: 'legal_drafting',      label: 'Legal Drafting',        description: 'LOD, Affidavits, Prescription Notices',              recommended: 'anthropic/claude-opus-4' },
    { key: 'case_strategy',       label: 'Case Strategy',         description: 'NCA legal strategy with risk scoring',               recommended: 'anthropic/claude-opus-4' },
    { key: 'plan_generation',     label: 'Plan Orchestration',    description: 'Multi-step case workflow generation',                recommended: 'gpt-4o' },
    { key: 'contract_analysis',   label: 'Contract Analysis',     description: 'Agreement and contract clause analysis',             recommended: 'anthropic/claude-sonnet-4-5' },
    { key: 'dhs_parsing',         label: 'DHS Report Parsing',    description: 'NCR Debt Help System summary report extraction',     recommended: 'gpt-4o' },
    { key: 'ai_coach',            label: 'AI Coach (Credo)',       description: 'Consumer-facing credit coaching chatbot',            recommended: 'anthropic/claude-sonnet-4-5' },
];

const EMPTY_FORM: FormState = { name: '', provider: 'openai', apiKey: '', baseUrl: '', isActive: true, isDefault: false, models: '', taskAssignments: {} };

export default function AiProvidersPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [providers, setProviders] = useState<AiProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (status === 'authenticated' && !(session?.user as any)?.isAdmin) router.push('/');
    }, [session, status, router]);

    useEffect(() => { fetchProviders(); }, []);

    const fetchProviders = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/ai-providers');
            if (res.ok) setProviders((await res.json()).providers ?? []);
        } finally { setLoading(false); }
    };

    const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setTestResult(null); setShowForm(true); };

    const openEdit = (p: AiProvider) => {
        setEditingId(p.id);
        setForm({ name: p.name, provider: p.provider, apiKey: p.apiKey, baseUrl: p.baseUrl ?? '', isActive: p.isActive, isDefault: p.isDefault, models: p.models.join(', '), taskAssignments: { ...p.taskAssignments } });
        setTestResult(null);
        setShowForm(true);
    };

    const handleProviderTypeChange = (val: ProviderType) => {
        const opt = PROVIDER_OPTIONS.find(o => o.value === val);
        setForm(f => ({ ...f, provider: val, baseUrl: opt?.defaultBaseUrl ?? '' }));
    };

    const handleTaskModel = (taskKey: string, model: string) => {
        setForm(f => ({
            ...f,
            taskAssignments: model
                ? { ...f.taskAssignments, [taskKey]: model }
                : Object.fromEntries(Object.entries(f.taskAssignments).filter(([k]) => k !== taskKey)),
        }));
    };

    const handleTest = async () => {
        setTesting(true); setTestResult(null);
        try {
            const res = await fetch('/api/admin/ai-providers/test', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: form.apiKey, baseUrl: form.baseUrl || null, model: form.models.split(',')[0]?.trim() || undefined }),
            });
            setTestResult(await res.json());
        } finally { setTesting(false); }
    };

    const handleSave = async () => {
        setSaving(true); setMessage(null);
        try {
            const body = { name: form.name, provider: form.provider, apiKey: form.apiKey, baseUrl: form.baseUrl || null, isActive: form.isActive, isDefault: form.isDefault, models: form.models.split(',').map(m => m.trim()).filter(Boolean), taskAssignments: form.taskAssignments };
            const res = await fetch(editingId ? `/api/admin/ai-providers/${editingId}` : '/api/admin/ai-providers', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (res.ok && data.success) { setMessage({ type: 'success', text: editingId ? 'Provider updated.' : 'Provider added.' }); setShowForm(false); fetchProviders(); }
            else setMessage({ type: 'error', text: data.error ?? 'Save failed.' });
        } finally { setSaving(false); }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!await confirm(`Remove AI provider "${name}"?`)) return;
        const res = await fetch(`/api/admin/ai-providers/${id}`, { method: 'DELETE' });
        if (res.ok) { setMessage({ type: 'success', text: 'Provider removed.' }); fetchProviders(); }
    };

    const toggleActive = async (p: AiProvider) => {
        await fetch(`/api/admin/ai-providers/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !p.isActive }) });
        fetchProviders();
    };

    if (status === 'loading') return null;

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">AI Providers</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage API keys and assign AI models to each task. No env file changes needed.</p>
                </div>
                <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">+ Add Provider</button>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {message.text}
                </div>
            )}

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <strong>Tip:</strong> Use <strong>OpenRouter</strong> to access Claude, GPT-4o, and Gemini all with one API key. Add it once and assign different models to different tasks below.
            </div>

            {/* Provider list */}
            {loading ? (
                <div className="text-sm text-gray-400">Loading...</div>
            ) : providers.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                    <div className="text-4xl mb-3">🤖</div>
                    <p className="font-medium text-gray-700">No AI providers configured yet</p>
                    <p className="text-sm text-gray-500 mt-1">The app falls back to the OPENAI_API_KEY env variable until you add one here.</p>
                    <button onClick={openCreate} className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add your first provider</button>
                </div>
            ) : (
                <div className="space-y-3">
                    {providers.map(p => (
                        <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-gray-900">{p.name}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-mono">{p.provider}</span>
                                    {p.isDefault && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Default fallback</span>}
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {p.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div className="mt-1 text-xs text-gray-400 font-mono">{p.apiKey}</div>
                                {p.baseUrl && <div className="text-xs text-gray-400 mt-0.5">{p.baseUrl}</div>}
                                {Object.keys(p.taskAssignments).length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {Object.entries(p.taskAssignments).map(([task, model]) => (
                                            <span key={task} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100">
                                                {task}: <span className="font-mono">{model}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <button onClick={() => toggleActive(p)} className="text-xs text-gray-500 hover:text-gray-700 underline">{p.isActive ? 'Disable' : 'Enable'}</button>
                                <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:text-blue-800 underline">Edit</button>
                                <button onClick={() => handleDelete(p.id, p.name)} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Slide-in form */}
            {showForm && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
                    <div className="bg-white h-full w-full max-w-xl overflow-y-auto shadow-2xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Provider' : 'Add AI Provider'}</h2>
                            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                        </div>

                        {/* Provider type */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Provider Type</label>
                            <select value={form.provider} onChange={e => handleProviderTypeChange(e.target.value as ProviderType)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                {PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <p className="text-xs text-gray-400">{PROVIDER_OPTIONS.find(o => o.value === form.provider)?.hint}</p>
                        </div>

                        {/* Name */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Display Name</label>
                            <input type="text" placeholder="e.g. OpenRouter Production" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>

                        {/* API Key */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">API Key</label>
                            <input type="password" placeholder={editingId ? 'Leave as-is to keep existing key' : 'sk-or-v1-...'} value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                            {editingId && <p className="text-xs text-gray-400">Key is masked. Type a new key to replace it.</p>}
                        </div>

                        {/* Base URL */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Base URL <span className="text-gray-400 font-normal">(optional)</span></label>
                            <input type="text" placeholder="https://openrouter.ai/api/v1" value={form.baseUrl} onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                            <p className="text-xs text-gray-400">Leave blank for OpenAI Direct. Required for OpenRouter.</p>
                        </div>

                        {/* Models */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Available Models <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                            <input type="text" placeholder="gpt-4o, anthropic/claude-opus-4, google/gemini-pro" value={form.models} onChange={e => setForm(f => ({ ...f, models: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
                        </div>

                        {/* Test connection */}
                        <div className="space-y-2">
                            <button onClick={handleTest} disabled={testing || !form.apiKey || form.apiKey.includes('•')} className="w-full py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                {testing ? 'Testing connection...' : '⚡ Test Connection'}
                            </button>
                            {testResult && (
                                <div className={`text-xs p-2 rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {testResult.success ? '✓ ' : '✗ '}{testResult.message}
                                </div>
                            )}
                        </div>

                        {/* Task assignments */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Task → Model Assignments</label>
                            <p className="text-xs text-gray-400">Assign a model to each task. Leave blank to use another provider or the env key fallback.</p>
                            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                {AI_TASKS.map(t => (
                                    <div key={t.key} className="flex items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-gray-700">{t.label}</div>
                                            <div className="text-xs text-gray-400">{t.description}</div>
                                            {t.recommended && <div className="text-xs text-blue-500 mt-0.5">Recommended: <span className="font-mono">{t.recommended}</span></div>}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="model or blank"
                                            value={form.taskAssignments[t.key] ?? ''}
                                            onChange={e => handleTaskModel(t.key, e.target.value)}
                                            className="w-44 border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Flags */}
                        <div className="flex gap-6">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
                                Active
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} className="rounded" />
                                Set as default fallback
                            </label>
                        </div>

                        {/* Save */}
                        <div className="flex gap-3 pt-2">
                            <button onClick={handleSave} disabled={saving || !form.name || !form.apiKey} className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Provider'}
                            </button>
                            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
