'use client';
import { toast } from './ui/Toaster';


import { useState, useEffect, useRef, useMemo } from 'react';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

type Comment = {
    id: string;
    content: string;
    type: string;
    isInternal: boolean;
    activityType: string | null;
    activityData: string | null;
    createdAt: string;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
    attachments?: Array<{
        name: string;
        url: string;
        type: string;
        size: number;
    }>;
    mentions: Array<{
        user: {
            id: string;
            firstName: string;
            lastName: string;
        };
    }>;
};

type UserMentionSuggestion = {
    kind: 'user';
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
};

type GroupMentionSuggestion = {
    kind: 'group';
    id: string;
    name: string;
    memberCount: number;
};

type MentionSuggestion = UserMentionSuggestion | GroupMentionSuggestion;

function matchesMentionQuery(item: MentionSuggestion, query: string): boolean {
    if (!query) return true;
    if (item.kind === 'group') {
        return item.name.toLowerCase().includes(query) || item.name.toLowerCase().replace(/\s+/g, '').includes(query);
    }
    return (
        item.firstName.toLowerCase().includes(query) ||
        item.lastName.toLowerCase().includes(query) ||
        `${item.firstName}${item.lastName}`.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.username.toLowerCase().includes(query)
    );
}

interface ActivityTabProps {
    caseId: string;
    fileNumber: string;
    lastUpdate?: number;
    highlightCommentId?: string | null;
}

export function ActivityTab({ caseId, fileNumber, lastUpdate = 0, highlightCommentId }: ActivityTabProps) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [activeMentionIndex, setActiveMentionIndex] = useState(0);
    // The whole mentionable set (users + groups) is small, so it's fetched once and
    // cached rather than hitting the server on every keystroke — filtering happens
    // client-side, which is what actually made the dropdown feel slow to load.
    const mentionCacheRef = useRef<MentionSuggestion[] | null>(null);
    const [mentionCacheVersion, setMentionCacheVersion] = useState(0);
    const [cursorPosition, setCursorPosition] = useState(0);
    const [showInternal, setShowInternal] = useState(true);
    const [composerMode, setComposerMode] = useState<'NOTE' | 'JOURNAL' | 'REFERRER'>('NOTE');
    const isJournalMode = composerMode === 'JOURNAL';
    const isReferrerMode = composerMode === 'REFERRER';
    const [mounted, setMounted] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<Array<{ name: string; url: string; type: string; size: number }>>([]);
    const [isUploading, setIsUploading] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Track client-side hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch comments
    useEffect(() => {
        async function fetchComments() {
            try {
                const res = await fetch(`/api/cases/${caseId}/comments`);
                if (res.ok) {
                    const data = await res.json();
                    setComments(data);
                }
            } catch (error) {
                logger.error('Failed to fetch comments', error);
            } finally {
                setLoading(false);
            }
        }
        fetchComments();
    }, [caseId, lastUpdate]);

    // Scroll to and highlight specific comment when arriving from a notification
    useEffect(() => {
        if (!highlightCommentId || loading) return;
        const timer = setTimeout(() => {
            const el = document.getElementById(`comment-${highlightCommentId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-zeno-cyan', 'ring-offset-2', 'ring-offset-transparent');
                setTimeout(() => {
                    el.classList.remove('ring-2', 'ring-zeno-cyan', 'ring-offset-2', 'ring-offset-transparent');
                }, 3000);
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [highlightCommentId, loading]);

    // Load the mentionable users + groups once (lazily, the first time '@' is
    // typed) and cache them for the lifetime of the component.
    useEffect(() => {
        if (!showMentions || mentionCacheRef.current) return;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/users/search');
                if (res.ok) {
                    const data: MentionSuggestion[] = await res.json();
                    if (!cancelled) {
                        mentionCacheRef.current = data;
                        setMentionCacheVersion(v => v + 1);
                    }
                }
            } catch (error) {
                logger.error('Failed to load mention suggestions', error);
            }
        })();

        return () => { cancelled = true; };
    }, [showMentions]);

    // Filter the cached list client-side as the user types — no network round-trip per keystroke.
    const userSuggestions = useMemo<MentionSuggestion[]>(() => {
        const cache = mentionCacheRef.current;
        if (!cache) return [];
        const query = mentionQuery.toLowerCase();
        return cache.filter(item => matchesMentionQuery(item, query)).slice(0, 8);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mentionQuery, mentionCacheVersion]);

    useEffect(() => {
        setActiveMentionIndex(0);
    }, [userSuggestions]);

    // Handle text change and detect @mentions
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const pos = e.target.selectionStart;
        setNewComment(text);
        setCursorPosition(pos);

        // Check if we're typing a mention
        const textBeforeCursor = text.substring(0, pos);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

        if (mentionMatch) {
            setShowMentions(true);
            setMentionQuery(mentionMatch[1]);
        } else {
            setShowMentions(false);
            setMentionQuery('');
        }
    };

    // Insert mention (user or group — group names are compacted to a single
    // @token by stripping spaces, matching the server-side group-mention resolver)
    const insertMention = (suggestion: MentionSuggestion) => {
        const textBeforeCursor = newComment.substring(0, cursorPosition);
        const textAfterCursor = newComment.substring(cursorPosition);
        const mentionStart = textBeforeCursor.lastIndexOf('@');
        const mentionToken = suggestion.kind === 'group'
            ? suggestion.name.replace(/\s+/g, '')
            : `${suggestion.firstName}${suggestion.lastName}`;
        const newText = textBeforeCursor.substring(0, mentionStart) +
            `@${mentionToken} ` + textAfterCursor;

        setNewComment(newText);
        setShowMentions(false);
        setMentionQuery('');
        textareaRef.current?.focus();
    };

    // Keyboard navigation for the @mention suggestions dropdown
    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!showMentions || userSuggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveMentionIndex(prev => (prev + 1) % userSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveMentionIndex(prev => (prev - 1 + userSuggestions.length) % userSuggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            insertMention(userSuggestions[activeMentionIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setShowMentions(false);
            setMentionQuery('');
        }
    };

    // Handle file selection and upload
    const handleFileUpload = async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append('caseId', caseId);
        
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        try {
            const res = await fetch('/api/comments/attachments/upload', {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                const data = await res.json();
                setPendingAttachments(prev => [...prev, ...data.files]);
            } else {
                toast.error('Failed to upload files');
            }
        } catch (error) {
            logger.error('Upload failed', error);
            toast.error('Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        const files: File[] = [];
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) files.push(file);
            }
        }
        
        if (files.length > 0) {
            handleFileUpload(files);
        }
    };

    const removePendingAttachment = (index: number) => {
        setPendingAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // Submit comment
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setSubmitting(true);
        try {
            const res = await fetch(`/api/cases/${caseId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: newComment,
                    type: composerMode === 'NOTE' ? 'NOTE' : composerMode,
                    isInternal: isJournalMode,
                    attachments: pendingAttachments
                }) });

            if (res.ok) {
                const comment = await res.json();
                setComments([comment, ...comments]);
                setNewComment('');
                setPendingAttachments([]);
            } else {
                toast.error('Failed to post comment');
            }
        } catch (error) {
            logger.error('Failed to submit comment', error);
            toast.error('Failed to post comment');
        } finally {
            setSubmitting(false);
        }
    };

    // Format comment with highlighted mentions
    const formatComment = (content: string) => {
        return content.replace(/@(\w+)/g, '<span class="text-zeno-cyan font-medium">@$1</span>');
    };

    const getActivityIcon = (comment: Comment) => {
        if (comment.type === 'JOURNAL') return '📓';
        if (comment.type === 'SYSTEM') return '⚙️';
        if (comment.type === 'GHL') return '💬';
        if (comment.type === 'REFERRER') return '🤝';

        // Check for specific cross-app event types
        if (comment.activityType === 'INSURANCE_EVENT') return '🛡️';
        if (comment.activityType === 'LEGAL_EVENT') return '⚖️';
        if (comment.activityType === 'FORENSIC_EVENT') return '🔍';

        switch (comment.activityType) {
            case 'STATUS_CHANGE': return '🔄';
            case 'DOCUMENT_UPLOAD': return '📄';
            case 'EDIT': return '✏️';
            case 'JOURNAL_ENTRY': return '📓';
            default: return '💬';
        }
    };

    const getEventStyle = (comment: Comment) => {
        if (comment.activityType === 'INSURANCE_EVENT') return 'bg-emerald-500/10 border-emerald-500/20';
        if (comment.activityType === 'LEGAL_EVENT') return 'bg-purple-500/10 border-purple-500/20';
        if (comment.activityType === 'FORENSIC_EVENT') return 'bg-red-500/10 border-red-500/20';
        if (comment.type === 'JOURNAL') return 'bg-amber-500/5 border-amber-500/10';
        if (comment.type === 'REFERRER') return 'bg-cyan-500/5 border-cyan-400/20';
        return 'bg-zeno-navy/40 border-white/5';
    };

    const filteredComments = comments.filter(c => showInternal || !c.isInternal);

    return (
        <div className="bg-zeno-blue/20 rounded-xl border border-white/5 p-6 shadow-sm">
            <header className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <span>💬</span> Global Timeline & Activity
                </h3>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowInternal(!showInternal)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${showInternal
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-white/5 border-white/10 text-gray-400'
                            }`}
                    >
                        {showInternal ? '👁️ Showing Internal' : 'Hide Internal'}
                    </button>
                    <button
                        onClick={() => setComposerMode(composerMode === 'NOTE' ? 'JOURNAL' : composerMode === 'JOURNAL' ? 'REFERRER' : 'NOTE')}
                        className={`text-xs px-4 py-1.5 rounded-lg border font-medium transition-all ${isJournalMode
                            ? 'bg-amber-500 text-zeno-navy border-amber-500'
                            : isReferrerMode
                                ? 'bg-zeno-cyan text-zeno-navy border-zeno-cyan'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                            }`}
                    >
                        {isJournalMode ? 'Mode: Journal 📓' : isReferrerMode ? 'Mode: Referrer Reply 🤝' : 'Mode: Public Note 💬'}
                    </button>
                </div>
            </header>

            {/* Comment Input */}
            <form onSubmit={handleSubmit} className="mb-8">
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={newComment}
                        onChange={handleTextChange}
                        onKeyDown={handleTextareaKeyDown}
                        onPaste={handlePaste}
                        placeholder={isJournalMode ? "Type internal team note..." : isReferrerMode ? "Reply to the referrer (visible in their portal)..." : "Add a public comment..."}
                        className={`w-full px-4 py-3 bg-zeno-navy border rounded-xl text-white placeholder-gray-500 transition-all focus:outline-none resize-none ${isJournalMode ? 'border-amber-500/30 ring-1 ring-amber-500/10' : isReferrerMode ? 'border-zeno-cyan/40 ring-1 ring-zeno-cyan/10' : 'border-white/10 focus:border-zeno-cyan'
                            }`}
                        rows={3}
                    />

                    {/* Pending Attachments UI */}
                    {pendingAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 px-1">
                            {pendingAttachments.map((file, idx) => (
                                <div key={idx} className="group relative bg-white/5 border border-white/10 rounded-lg p-2 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded bg-zeno-blue/30 flex items-center justify-center overflow-hidden">
                                        {file.type.startsWith('image/') ? (
                                            <img src={file.url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[10px]">📄</span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400 max-w-[120px] truncate">{file.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => removePendingAttachment(idx)}
                                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Mention suggestions dropdown */}
                    {showMentions && userSuggestions.length > 0 && (
                        <div className="absolute bottom-full left-0 w-full mb-1 bg-zeno-navy border border-white/20 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                            {userSuggestions.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => insertMention(item)}
                                    onMouseEnter={() => setActiveMentionIndex(index)}
                                    className={`w-full px-4 py-2 text-left transition-colors flex items-center ${index === activeMentionIndex ? 'bg-zeno-blue/50' : 'hover:bg-zeno-blue/50'
                                        }`}
                                >
                                    {item.kind === 'group' ? (
                                        <>
                                            <span className="text-base mr-2">👥</span>
                                            <span className="text-white font-medium">{item.name}</span>
                                            <span className="text-gray-500 text-xs ml-2">{item.memberCount} member{item.memberCount === 1 ? '' : 's'}</span>
                                            <span className="text-[10px] text-zeno-cyan/80 font-bold uppercase tracking-wider ml-auto pl-2">Group</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-white font-medium">{item.firstName} {item.lastName}</span>
                                            <span className="text-gray-500 text-sm ml-2">{item.email}</span>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex justify-between items-center mt-3">
                    <div className="flex items-center gap-3">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                            multiple
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-gray-500 hover:text-zeno-cyan transition-colors"
                            title="Attach images or documents"
                        >
                            📎
                        </button>
                        <span className="text-[10px] text-gray-500 italic">
                            {isJournalMode
                                ? "📓 Internal notes are only visible to staff and managers."
                                : isReferrerMode
                                    ? "🤝 Referrer replies appear in the referrer's portal for this case."
                                    : "💬 Public notes may be shared in reports."}
                        </span>
                    </div>
                    <button
                        type="submit"
                        disabled={submitting || isUploading || !newComment.trim()}
                        className={`px-5 py-2 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isJournalMode ? 'bg-amber-500 text-zeno-navy' : 'bg-zeno-cyan text-zeno-navy'
                            }`}
                    >
                        {submitting ? 'Saving...' : isUploading ? 'Uploading...' : (isJournalMode ? 'Save to Journal' : isReferrerMode ? 'Send to Referrer' : 'Post Comment')}
                    </button>
                </div>
            </form>

            {/* Comments List */}
            <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {loading ? (
                    <div className="flex flex-col items-center py-10 opacity-50">
                        <div className="w-8 h-8 border-2 border-zeno-cyan/30 border-t-zeno-cyan rounded-full animate-spin mb-2"></div>
                        <p className="text-gray-500 text-sm">Loading activity stream...</p>
                    </div>
                ) : filteredComments.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl">
                        <p className="text-gray-500 text-sm">No recorded activity fits your current filters.</p>
                    </div>
                ) : (
                    filteredComments.map(comment => (
                        <div key={comment.id} id={`comment-${comment.id}`} className={`flex gap-3 p-4 rounded-2xl transition-all border ${getEventStyle(comment)}`}>
                            <div className="flex-shrink-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${comment.type === 'JOURNAL' ? 'bg-amber-500/20 shadow-lg shadow-amber-500/5' : 'bg-zeno-cyan/10'
                                    }`}>
                                    {getActivityIcon(comment)}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-bold text-sm tracking-tight">
                                            {comment.user.firstName} {comment.user.lastName}
                                        </span>
                                        {comment.isInternal && (
                                            <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded border border-white/10 font-bold uppercase tracking-widest">
                                                Internal
                                            </span>
                                        )}
                                        {comment.type === 'REFERRER' && (
                                            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded uppercase font-bold">
                                                Referrer thread
                                            </span>
                                        )}
                                        {/* Badge to identify source app */}
                                        {comment.activityType === 'INSURANCE_EVENT' && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase font-bold">Insurance</span>}
                                        {comment.activityType === 'LEGAL_EVENT' && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded uppercase font-bold">Legal</span>}
                                        {comment.activityType === 'FORENSIC_EVENT' && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded uppercase font-bold">Forensic</span>}
                                    </div>
                                    <span className="text-gray-500 text-[11px] font-medium">
                                        {mounted ? new Date(comment.createdAt).toLocaleString() : ''}
                                    </span>
                                </div>
                                <div
                                    className={`text-sm leading-relaxed ${comment.type === 'JOURNAL' ? 'text-amber-200/80' : 'text-gray-300'}`}
                                    // If it's a rich system event, we might want to allow HTML, otherwise perform formatting
                                    dangerouslySetInnerHTML={{ __html: formatComment(comment.content) }}
                                />

                                {/* Render Attachments in Comment */}
                                {comment.attachments && comment.attachments.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {comment.attachments.map((file, idx) => (
                                            <a
                                                key={idx}
                                                href={file.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group relative bg-white/5 border border-white/10 rounded-xl p-2 flex items-center gap-3 hover:bg-white/10 transition-all max-w-[240px]"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-zeno-navy/80 flex items-center justify-center overflow-hidden border border-white/5">
                                                    {file.type.startsWith('image/') ? (
                                                        <img src={file.url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xl">📄</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 pr-2">
                                                    <p className="text-[12px] text-white font-medium truncate">{file.name}</p>
                                                    <p className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                                                </div>
                                                <div className="opacity-0 group-hover:opacity-100 absolute right-2 bottom-2 text-[10px] bg-zeno-cyan text-zeno-navy font-bold px-1.5 py-0.5 rounded transition-opacity">
                                                    OPEN
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                )}
                                {comment.mentions.length > 0 && (
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Mentioned:</span>
                                        {comment.mentions.map(m => (
                                            <span key={m.user.id} className="text-[11px] px-2 py-0.5 bg-zeno-cyan/10 text-zeno-cyan rounded-full font-medium">
                                                @{m.user.firstName}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

