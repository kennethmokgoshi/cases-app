'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';

function AuthErrorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const error = searchParams.get('error');

    useEffect(() => {
        let message = 'An authentication error occurred';
        if (error === 'CredentialsSignin' || error === 'Configuration') {
            message = 'Invalid email or password';
        } else if (error === 'AccessDenied') {
            message = 'Access denied';
        } else if (error) {
            message = error;
        }
        router.replace(`/login?error=${encodeURIComponent(message)}`);
    }, [error, router]);

    return (
        <div className="min-h-screen bg-zeno-navy flex items-center justify-center p-4">
            <div className="text-white text-center">
                <div className="animate-spin h-8 w-8 border-4 border-zeno-cyan border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Redirecting...</p>
            </div>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-zeno-navy flex items-center justify-center p-4"><div className="text-white text-center"><p>Loading...</p></div></div>}>
            <AuthErrorContent />
        </Suspense>
    );
}
