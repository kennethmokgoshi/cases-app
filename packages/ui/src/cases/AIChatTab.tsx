'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type Role = 'user' | 'assistant';

interface Message {
    id: string;
    role: Role;
    content: string;
}

const QUICK_PROMPTS = [
    'Summarise this case in 3 bullet points',
    'What should be the next step for this case?',
    'Draft a status update email to the client',
    'Draft a follow-up to the current debt counsellor',
    'What documents are typically needed for debt review removal?',
];

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-all"
            title="Copy to clipboard"
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    );
}

function MessageBubble({ message }: { message: Message }) {
    const isUser = message.role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-3 group`}>
            {!isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-sm">
                    ✨
                </div>
            )}
            <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
                <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        isUser
                            ? 'bg-amber-500/20 border border-amber-500/30 text-white rounded-tr-sm'
                            : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-sm'
                    }`}
                >
                    {message.content || (
                        <span className="inline-flex gap-1 items-center text-gray-500">
                            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                        </span>
                    )}
                </div>
                {!isUser && message.content && (
                    <div className="mt-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <CopyButton text={message.content} />
                    </div>
                )}
            </div>
            {isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-sm">
                    👤
                </div>
            )}
        </div>
    );
}

export function AIChatTab({ caseId }: { caseId: string }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const autoResize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    };

    const send = useCallback(async (userText: string) => {
        const text = userText.trim();
        if (!text || isStreaming) return;

        setError(null);
        const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
        const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '' };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setIsStreaming(true);

        const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

        abortRef.current = new AbortController();
        try {
            const res = await fetch(`/api/cases/${caseId}/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history }),
                signal: abortRef.current.signal,
            });

            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error ?? `Server error ${res.status}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No response stream');

            const decoder = new TextDecoder();
            let accumulated = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
                setMessages(prev =>
                    prev.map(m => m.id === assistantMsg.id ? { ...m, content: accumulated } : m)
                );
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            const msg = err instanceof Error ? err.message : 'Something went wrong';
            setError(msg);
            setMessages(prev => prev.filter(m => m.id !== assistantMsg.id));
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [caseId, isStreaming, messages]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    const clearChat = () => {
        if (isStreaming) {
            abortRef.current?.abort();
        }
        setMessages([]);
        setError(null);
    };

    const isEmpty = messages.length === 0;

    return (
        <div className="flex flex-col h-[680px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                <div>
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <span>✨</span> AI Case Assistant
                    </h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Ask anything about this case — draft emails, letters, summaries, or get advice
                    </p>
                </div>
                {!isEmpty && (
                    <button
                        onClick={clearChat}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-400/30"
                    >
                        Clear chat
                    </button>
                )}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto pr-1 mb-4 flex flex-col">
                {isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                        <div>
                            <div className="text-4xl mb-3">✨</div>
                            <p className="text-gray-400 text-sm max-w-sm">
                                I have full context about this case loaded. Ask me anything, or try one of these:
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                            {QUICK_PROMPTS.map(p => (
                                <button
                                    key={p}
                                    onClick={() => send(p)}
                                    className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-amber-500/10 hover:border-amber-500/30 text-gray-400 hover:text-white transition-all text-left"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                        <p className="text-gray-600 text-xs">
                            Tip: paste an incoming email and type <span className="text-gray-400">"please respond to this"</span>
                        </p>
                    </div>
                ) : (
                    <div className="mt-auto space-y-4">
                        {messages.map(m => <MessageBubble key={m.id} message={m} />)}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-3 text-red-400/60 hover:text-red-400">✕</button>
                </div>
            )}

            {/* Input */}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); autoResize(); }}
                    onKeyDown={handleKeyDown}
                    placeholder={isStreaming ? 'AI is typing…' : 'Type your message… (Shift+Enter for new line)'}
                    disabled={isStreaming}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pr-24 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-amber-500/40 focus:bg-white/8 transition-all disabled:opacity-50"
                    style={{ minHeight: '80px', maxHeight: '200px' }}
                />
                <div className="absolute right-3 bottom-3 flex gap-2 items-center">
                    {isStreaming ? (
                        <button
                            onClick={() => abortRef.current?.abort()}
                            className="px-3 py-1.5 text-xs rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all"
                        >
                            Stop
                        </button>
                    ) : (
                        <button
                            onClick={() => send(input)}
                            disabled={!input.trim()}
                            className="px-4 py-1.5 text-xs rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed font-semibold"
                        >
                            Send ↵
                        </button>
                    )}
                </div>
            </div>
            <p className="text-center text-gray-600 text-xs mt-2">
                AI can make mistakes — always review before sending
            </p>
        </div>
    );
}
