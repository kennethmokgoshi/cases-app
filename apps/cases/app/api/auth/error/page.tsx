'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Custom NextAuth error page.
 * Instead of showing a generic error page, this redirects back to login
 * with the error message in the URL so it can be displayed inline.
 */
export default function AuthErrorPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const error = searchParams.get('error');

    useEffect(() => {
        // Map NextAuth error codes to user-friendly messages
        let errorMessage = 'An authentication error occurred';

        if (error === 'CredentialsSignin' || error === 'Configuration') {
            errorMessage = 'Invalid email or password';
        } else if (error === 'AccessDenied') {
            errorMessage = 'Access denied';
        } else if (error) {
            errorMessage = error;
        }

        // Redirect back to login with error message
        router.push(`/login?error=${encodeURIComponent(errorMessage)}`);
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
