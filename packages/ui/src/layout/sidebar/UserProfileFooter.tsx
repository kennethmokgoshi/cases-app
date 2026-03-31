'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';

type UserProfileFooterProps = {
    session: any;
};

function getRoleBadge(session: any) {
    if (session?.user?.isAdmin) {
        return <span className="ml-1 text-zeno-orange font-bold">• Admin</span>;
    }
    if (session?.user?.isExecutive) {
        return <span className="ml-1 text-yellow-400 font-bold">• Executive</span>;
    }
    if (session?.user?.isSeniorManager) {
        return <span className="ml-1 text-violet-400 font-bold">• Senior Manager</span>;
    }
    if (session?.user?.role === 'MANAGER') {
        return <span className="ml-1 text-purple-400 font-bold">• Manager</span>;
    }
    if (session?.user?.role === 'FINANCE') {
        return <span className="ml-1 text-emerald-400 font-bold">• Finance</span>;
    }
    if (session?.user?.role === 'ACCOUNTS') {
        return <span className="ml-1 text-emerald-400 font-bold">• Accounts</span>;
    }
    if (session?.user?.role === 'B2B_MANAGER') {
        return <span className="ml-1 text-blue-400 font-bold">• B2B Manager</span>;
    }
    if (session?.user?.role === 'B2B_MEMBER') {
        return <span className="ml-1 text-blue-300 font-bold">• B2B Member</span>;
    }
    return <span className="ml-1 text-zeno-cyan font-bold">• Member</span>;
}

export function UserProfileFooter({ session }: UserProfileFooterProps) {
    return (
        <div className="p-4 border-t border-zeno-blue/50">
            <Link href="/account" className="flex items-center gap-3 px-2 py-2 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all group">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zeno-cyan to-blue-600 flex items-center justify-center text-white font-bold text-xs overflow-hidden shadow-lg shadow-black/20">
                    {session?.user?.avatarUrl ? (
                        <img src={session?.user?.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                        <span>{session?.user?.firstName?.[0]}{session?.user?.lastName?.[0]}</span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-zeno-cyan transition-colors">
                        {session?.user?.firstName} {session?.user?.lastName}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate uppercase tracking-wider">
                        {session?.user?.organization || 'Zenowethu'}
                        {getRoleBadge(session)}
                    </p>
                </div>
                <svg className="w-4 h-4 text-gray-600 group-hover:text-zeno-cyan transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </Link>
            <button
                onClick={async () => { try { await signOut({ redirect: false }); } finally { window.location.replace('/login'); } }}
                className="mt-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all flex items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
            </button>
        </div>
    );
}
