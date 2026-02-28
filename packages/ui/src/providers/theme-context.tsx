'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Theme = 'default' | 'ocean' | 'sunset';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>('default');

    useEffect(() => {
        const saved = localStorage.getItem('theme') as Theme;
        if (saved) setTheme(saved);
    }, []);

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.className = theme;
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}
