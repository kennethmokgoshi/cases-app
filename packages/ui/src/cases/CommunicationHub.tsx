'use client';

import { useState, useEffect } from 'react';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type MessageTemplate = {
    id: string;
    name: string;
    description: string | null;
    content: string;
    channel: string;
    category: string;
};

type CommunicationLog = {
    id: string;
    channel: string;
    recipient: string;
    message: string;
    success: boolean;
    sentAt: string;
    provider: string;
    error: string | null;
    sender?: {
        firstName: string;
        lastName: string;
    };
};

interface CommunicationHubProps {
    caseId: string;
    clientEmail: string | null;
    clientPhone: string | null;
}

export function CommunicationHub({ caseId, clientEmail, clientPhone }: CommunicationHubProps) {
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [logs, setLogs] = useState<CommunicationLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [customMessage, setCustomMessage] = useState('');
    const [channel, setChannel] = useState<'SMS' | 'EMAIL' | 'WHATSAPP'>('WHATSAPP');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [tempRes, logsRes] = await Promise.all([
                    fetch('/api/settings/templates'),
                    fetch(`/api/cases/${caseId}/notifications`)
                ]);
                if (tempRes.ok) setTemplates(await tempRes.json());
                if (logsRes.ok) setLogs(await logsRes.json());
            } catch (error) {
                logger.error('Failed to fetch communication data', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [caseId]);

    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplate(templateId);
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setCustomMessage(template.content);
            setChannel(template.channel as any);
        }
    };

    const handleSendMessage = async () => {
        if (!customMessage.trim()) return;
        setSending(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel,
                    message: customMessage,
                    recipient: channel === 'EMAIL' ? clientEmail : clientPhone,
                    recipientType: 'CLIENT'
                }) });

            if (res.ok) {
                const newLog = await res.json();
                setLogs([newLog, ...logs]);
                setCustomMessage('');
                setSelectedTemplate('');
                alert('Message sent successfully!');
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            logger.error('Send error:', error);
            alert('Failed to send message. Please check logs.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 shadow-sm">
                <header className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <span>💬</span> Communication Hub
                    </h3>
                    <div className="flex gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${clientEmail ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {clientEmail ? 'Email ✅' : 'No Email ❌'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${clientPhone ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {clientPhone ? 'Mobile ✅' : 'No Mobile ❌'}
                        </span>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Channel</label>
                        <select
                            value={channel}
                            onChange={(e) => setChannel(e.target.value as any)}
                            className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white focus:border-zeno-cyan outline-none"
                        >
                            <option value="WHATSAPP">WhatsApp (GHL/Meta)</option>
                            <option value="SMS">SMS (GHL/Twilio)</option>
                            <option value="EMAIL">Email (GHL/Resend)</option>
                        </select>
                    </div>
                    <div className="col-span-2 space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Select Template</label>
                        <select
                            value={selectedTemplate}
                            onChange={(e) => handleTemplateChange(e.target.value)}
                            className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-white focus:border-zeno-cyan outline-none"
                        >
                            <option value="">-- Choose a standard response --</option>
                            {templates.filter(t => t.channel === channel).map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Type your message here..."
                        className="w-full h-32 bg-zeno-navy border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:border-zeno-cyan outline-none resize-none"
                    />
                    <div className="flex justify-end">
                        <button
                            onClick={handleSendMessage}
                            disabled={sending || !customMessage.trim() || (channel === 'EMAIL' ? !clientEmail : !clientPhone)}
                            className="px-6 py-2.5 bg-zeno-cyan text-zeno-navy font-bold rounded-xl hover:bg-cyan-400 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            {sending ? 'Sending...' : `Send via ${channel}`}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-zeno-navy/40 rounded-xl border border-white/5 overflow-hidden">
                <h4 className="px-6 py-4 border-b border-white/5 text-sm font-semibold text-gray-400 uppercase tracking-wider">
                    Recent Outbound Activity
                </h4>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500 italic">Tracking logs...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 italic">No communication logs recorded for this case.</div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {logs.map(log => (
                                <div key={log.id} className="p-4 hover:bg-white/5 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${log.channel === 'WHATSAPP' ? 'bg-green-500/20 text-green-400' :
                                                    log.channel === 'EMAIL' ? 'bg-blue-500/20 text-blue-400' :
                                                        'bg-amber-500/20 text-amber-400'
                                                }`}>
                                                {log.channel}
                                            </span>
                                            <span className="text-xs text-gray-500">To: {log.recipient}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-600">
                                            {new Date(log.sentAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-300 line-clamp-2">{log.message}</p>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className={`text-[10px] flex items-center gap-1 ${log.success ? 'text-green-500' : 'text-red-500'}`}>
                                            {log.success ? '● Delivered' : `● Failed: ${log.error || 'Unknown Error'}`}
                                        </span>
                                        {log.sender && (
                                            <span className="text-[10px] text-gray-600">Sent by: {log.sender.firstName}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
