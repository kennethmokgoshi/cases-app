'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

declare global {
    interface WindowEventMap {
        beforeinstallprompt: BeforeInstallPromptEvent;
    }
}

export function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if user previously dismissed
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed) {
            const dismissedDate = new Date(dismissed);
            const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
            // Show again after 7 days
            if (daysSinceDismissed < 7) {
                return;
            }
        }

        const handler = (e: BeforeInstallPromptEvent) => {
            e.preventDefault();
            setDeferredPrompt(e);
            // Show prompt after a short delay
            setTimeout(() => setShowPrompt(true), 3000);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setIsInstalled(true);
        }

        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
        setShowPrompt(false);
    };

    if (!showPrompt || isInstalled) return null;

    return (
        <div className="install-prompt">
            <div className="install-prompt-icon">
                <svg className="w-6 h-6 text-zeno-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </div>
            <div className="install-prompt-content">
                <p className="install-prompt-title">Install Zenowethu</p>
                <p className="install-prompt-description">Add to your home screen for quick access</p>
            </div>
            <div className="install-prompt-buttons">
                <button
                    onClick={handleDismiss}
                    className="install-prompt-btn install-prompt-btn-secondary"
                >
                    Later
                </button>
                <button
                    onClick={handleInstall}
                    className="install-prompt-btn install-prompt-btn-primary"
                >
                    Install
                </button>
            </div>
        </div>
    );
}
