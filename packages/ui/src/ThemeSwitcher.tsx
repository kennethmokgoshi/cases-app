'use client';

import { Theme, useTheme } from './providers/theme-context';
import { useState } from 'react';

const THEMES: { value: Theme; label: string; preview: string }[] = [
    { value: 'default', label: 'Default Navy', preview: 'bg-[#0B1120]' },
    { value: 'ocean', label: 'Ocean Blue', preview: 'bg-[#0c4a6e]' },
    { value: 'sunset', label: 'Sunset Orange', preview: 'bg-[#1c1917]' },
];

export function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-card)] transition-colors border border-[var(--color-border)]"
                aria-label="Change theme"
            >
                <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                </svg>
                <span className="text-sm font-medium hidden sm:inline">Theme</span>
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute right-0 mt-2 w-48 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] shadow-xl z-20">
                        <div className="p-2 space-y-1">
                            {THEMES.map((themeOption) => (
                                <button
                                    key={themeOption.value}
                                    onClick={() => {
                                        setTheme(themeOption.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left ${theme === themeOption.value
                                        ? 'bg-[var(--color-accent)] text-white'
                                        : 'hover:bg-[var(--color-bg-card)] text-[var(--color-text-primary)]'
                                        }`}
                                >
                                    <div
                                        className={`w-4 h-4 rounded-full border-2 ${themeOption.preview}`}
                                    />
                                    <span className="text-sm font-medium">{themeOption.label}</span>
                                    {theme === themeOption.value && (
                                        <svg
                                            className="w-4 h-4 ml-auto"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
