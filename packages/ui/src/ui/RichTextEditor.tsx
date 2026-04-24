'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
}

const COLORS = [
    { name: 'White', value: '#ffffff' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Yellow', value: '#facc15' },
    { name: 'Green', value: '#4ade80' },
    { name: 'Red', value: '#f87171' },
    { name: 'Orange', value: '#f59e0b' },
    { name: 'Gray', value: '#94a3b8' },
];

export function RichTextEditor({ value, onChange, placeholder, readOnly = false }: RichTextEditorProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [showColors, setShowColors] = useState(false);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextStyle,
            Color,
            Link.configure({
                openOnClick: false,
            }),
        ],
        immediatelyRender: false,
        content: value,
        editable: !readOnly,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none focus:outline-none min-h-[150px] p-4 text-sm text-gray-200',
            },
        },
    });

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (editor && value !== editor.getHTML()) {
            editor.commands.setContent(value, false);
        }
    }, [value, editor]);

    useEffect(() => {
        if (editor) {
            editor.setEditable(!readOnly);
        }
    }, [readOnly, editor]);

    if (!isMounted) {
        return <div className="h-40 bg-white/5 animate-pulse rounded-lg border border-white/10" />;
    }

    if (!editor) {
        return null;
    }

    return (
        <div className={`rich-text-container bg-zeno-navy rounded-lg overflow-hidden border ${readOnly ? 'border-transparent' : 'border-white/10 shadow-lg'}`}>
            {!readOnly && (
                <div className="flex flex-wrap items-center gap-1 p-2 bg-white/5 border-bottom border-white/10 sticky top-0 z-10">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive('bold')}
                        icon={<BoldIcon />}
                        title="Bold"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        active={editor.isActive('italic')}
                        icon={<ItalicIcon />}
                        title="Italic"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        active={editor.isActive('underline')}
                        icon={<UnderlineIcon />}
                        title="Underline"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        active={editor.isActive('strike')}
                        icon={<StrikeIcon />}
                        title="Strikethrough"
                    />
                    
                    <div className="w-px h-5 bg-white/10 mx-1" />

                    <div className="relative">
                        <ToolbarButton
                            onClick={() => setShowColors(!showColors)}
                            active={showColors}
                            icon={<ColorIcon color={editor.getAttributes('textStyle').color || '#ffffff'} />}
                            title="Font Color"
                        />
                        {showColors && (
                            <div className="absolute top-full left-0 mt-2 p-2 bg-[#1e293b] border border-white/10 rounded-lg shadow-xl z-20 flex gap-2">
                                {COLORS.map((c) => (
                                    <button
                                        key={c.value}
                                        onClick={() => {
                                            editor.chain().focus().setColor(c.value).run();
                                            setShowColors(false);
                                        }}
                                        className="w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c.value }}
                                        title={c.name}
                                    />
                                ))}
                                <button
                                    onClick={() => {
                                        editor.chain().focus().unsetColor().run();
                                        setShowColors(false);
                                    }}
                                    className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-white border border-white/10 rounded"
                                >
                                    Reset
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="w-px h-5 bg-white/10 mx-1" />

                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        active={editor.isActive('bulletList')}
                        icon={<BulletListIcon />}
                        title="Bullet List"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        active={editor.isActive('orderedList')}
                        icon={<OrderedListIcon />}
                        title="Numbered List"
                    />

                    <div className="w-px h-5 bg-white/10 mx-1" />

                    <ToolbarButton
                        onClick={() => {
                            const url = window.prompt('URL');
                            if (url) editor.chain().focus().setLink({ href: url }).run();
                            else if (url === '') editor.chain().focus().unsetLink().run();
                        }}
                        active={editor.isActive('link')}
                        icon={<LinkIcon />}
                        title="Link"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                        icon={<ClearIcon />}
                        title="Clear Formatting"
                    />
                </div>
            )}
            <div className={readOnly ? '' : 'bg-transparent'}>
                <EditorContent editor={editor} />
            </div>

            <style jsx global>{`
                .prose p { margin-top: 0.5em; margin-bottom: 0.5em; }
                .prose ul, .prose ol { padding-left: 1.5em; margin-top: 0.5em; margin-bottom: 0.5em; }
                .prose li { margin-top: 0.25em; margin-bottom: 0.25em; }
                .prose a { color: #06b6d4; text-decoration: underline; }
                .prose strong { color: inherit; }
            `}</style>
        </div>
    );
}

function ToolbarButton({ onClick, active, icon, title }: { onClick: () => void; active?: boolean; icon: React.ReactNode; title: string }) {
    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                onClick();
            }}
            title={title}
            className={`p-2 rounded hover:bg-white/10 transition-colors ${active ? 'bg-zeno-cyan/20 text-zeno-cyan' : 'text-gray-400 hover:text-white'}`}
        >
            {icon}
        </button>
    );
}

// Icons
const BoldIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>;
const ItalicIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 5l4 14M7 5h10M6 19h10" /></svg>;
const UnderlineIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 3v7a6 6 0 006 6 6 6 0 006-6V3M4 21h16" /></svg>;
const StrikeIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-9 0h12m-2 5l-2-2m-3-3l-2-2" /><path d="M5 12h14" /></svg>;
const BulletListIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16M4 6h.01M4 12h.01M4 18h.01" /></svg>;
const OrderedListIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 6h13M7 12h13M7 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const LinkIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
const ClearIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const ColorIcon = ({ color }: { color: string }) => (
    <div className="flex flex-col items-center">
        <span className="text-[10px] font-bold leading-none">A</span>
        <div className="w-4 h-1 mt-0.5 rounded-full" style={{ backgroundColor: color }} />
    </div>
);
