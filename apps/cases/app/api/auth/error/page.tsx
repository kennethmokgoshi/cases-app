'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function AuthErrorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const error = searchParams.get('error');

    useEffect(() => {
        let errorMessage = 'An authentication error occurred';

        if (error === 'CredentialsSignin' || error === 'Configuration') {
            errorMessage = 'Invalid email or password';
        } else if (error === 'AccessDenied') {
            errorMessage = 'Access denied';
        } else if (error) {
            errorMessage = error;
        }

        router.push(`/login?error=${encodeURIComponent(errorMessage)}`);
    }, [error, router]);

    return (
        <div className="text-white text-center">
            <div className="animate-spin h-8 w-8 border-4 border-zeno-cyan border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Redirecting...</p>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <div className="min-h-screen bg-zeno-navy flex items-center justify-center p-4">
            <Suspense fallback={
                <div className="text-white text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-zeno-cyan border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p>Loading...</p>
                </div>
            }>
                <AuthErrorContent />
            </Suspense>
        </div>
    );
}
