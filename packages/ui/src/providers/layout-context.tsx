'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LayoutContextType {
    isMobileOpen: boolean;
    setIsMobileOpen: (open: boolean) => void;
    toggleMobileMenu: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    return (
        <LayoutContext.Provider value={{ isMobileOpen, setIsMobileOpen, toggleMobileMenu: () => setIsMobileOpen(!isMobileOpen) }}>
            {children}
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (!context) throw new Error('useLayout must be used within LayoutProvider');
    return context;
}
