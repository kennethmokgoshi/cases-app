'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Use react-simple-wysiwyg for a lightweight alternative
// It handles HTML value directly
import { Editor, EditorProvider, Toolbar, BtnBold, BtnItalic, BtnUnderline, BtnStrikeThrough, BtnBulletList, BtnNumberedList, BtnLink, BtnClearFormatting, HtmlButton, Separator } from 'react-simple-wysiwyg';

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder, readOnly = false }: RichTextEditorProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return <div className="h-40 bg-white/5 animate-pulse rounded-lg border border-white/10" />;
    }

    if (readOnly) {
        return (
            <div
                className="prose prose-invert max-w-none p-3 text-sm text-gray-300"
                dangerouslySetInnerHTML={{ __html: value || '<p class="text-gray-500 italic">No description provided.</p>' }}
            />
        );
    }

    return (
        <div className="rich-text-container bg-zeno-navy rounded-lg overflow-hidden border border-white/10">
            <EditorProvider>
                <Toolbar>
                    <BtnBold />
                    <BtnItalic />
                    <BtnUnderline />
                    <BtnStrikeThrough />
                    <Separator />
                    <BtnNumberedList />
                    <BtnBulletList />
                    <Separator />
                    <BtnLink />
                    <BtnClearFormatting />
                </Toolbar>
                <div className="p-0">
                    <Editor
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        containerProps={{ style: { minHeight: '150px', backgroundColor: 'transparent', color: 'white', padding: '12px' } }}
                    />
                </div>
            </EditorProvider>
            <style jsx global>{`
                .rsw-toolbar {
                    background: rgba(255, 255, 255, 0.05);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                .rsw-btn {
                    color: #d1d5db; /* gray-300 */
                }
                .rsw-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }
                .rsw-btn[data-active="true"] {
                    background: rgba(var(--color-zeno-cyan-rgb), 0.2);
                    color: var(--color-zeno-cyan);
                }
                .rsw-ce {
                     outline: none;
                }
            `}</style>
        </div>
    );
}
