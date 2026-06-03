'use client';
import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type ConfirmOptions = {
    title?: string;
    message: string | ReactNode;
    confirmText?: string;
    variant?: 'danger' | 'default';
};

type ConfirmFunction = (options: ConfirmOptions | string) => Promise<boolean>;

let globalConfirmFn: ConfirmFunction | null = null;

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [resolver, setResolver] = useState<{ resolve: (value: boolean) => void } | null>(null);

    const confirmInternal = useCallback((opts: ConfirmOptions | string) => {
        return new Promise<boolean>((resolve) => {
            if (typeof opts === 'string') {
                setOptions({ message: opts, title: 'Confirm Action', variant: 'default' });
            } else {
                setOptions({ title: 'Confirm Action', variant: 'default', ...opts });
            }
            setResolver({ resolve });
            setIsOpen(true);
        });
    }, []);

    useEffect(() => {
        globalConfirmFn = confirmInternal;
        return () => {
            if (globalConfirmFn === confirmInternal) {
                globalConfirmFn = null;
            }
        };
    }, [confirmInternal]);

    const handleConfirm = async () => {
        setIsOpen(false);
        resolver?.resolve(true);
        setResolver(null);
    };

    const handleClose = () => {
        setIsOpen(false);
        resolver?.resolve(false);
        setResolver(null);
    };

    return (
        <>
            {children}
            {options && (
                <ConfirmDialog
                    isOpen={isOpen}
                    onClose={handleClose}
                    onConfirm={handleConfirm}
                    title={options.title || 'Confirm Action'}
                    message={options.message}
                    confirmText={options.confirmText || 'Confirm'}
                    variant={options.variant || 'default'}
                />
            )}
        </>
    );
}

export const confirm = async (options: ConfirmOptions | string): Promise<boolean> => {
    if (!globalConfirmFn) {
        console.warn('ConfirmProvider is not mounted. Falling back to window.confirm.');
        const msg = typeof options === 'string' ? options : (typeof options.message === 'string' ? options.message : 'Are you sure?');
        return typeof window !== 'undefined' ? window.confirm(msg) : false;
    }
    return globalConfirmFn(options);
};

