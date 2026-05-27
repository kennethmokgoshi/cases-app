'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Toaster } from '../ui/Toaster';
import { ConfirmProvider } from './ConfirmProvider';
import { GlobalErrorBoundary } from '../ui/GlobalErrorBoundary';

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
            <GlobalErrorBoundary>
                <ConfirmProvider>
                    {children}
                    <Toaster />
                </ConfirmProvider>
            </GlobalErrorBoundary>
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (!context) throw new Error('useLayout must be used within LayoutProvider');
    return context;
}

