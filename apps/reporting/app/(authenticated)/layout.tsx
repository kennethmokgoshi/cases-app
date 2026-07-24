import { auth } from '@zenowethu/shared-lib/src/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from './LogoutButton';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export default async function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const isExecutive = session.user.isAdmin || session.user.isExecutive;
  const userInitials = `${session.user.firstName?.[0] || ''}${session.user.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="min-h-screen bg-[#070b19] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      {/* Header Navigation */}
      <header className="sticky top-0 z-40 bg-slate-950/60 backdrop-blur-md border-b border-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg border border-cyan-400/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <span className="font-extrabold text-lg text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-cyan-400">
                ZENOWETHU
              </span>
              <span className="text-[10px] text-cyan-400/80 font-bold block leading-none tracking-wide uppercase">
                Work Reports
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <Link 
              href="/"
              className="px-4 py-2 rounded-xl text-sm font-medium hover:text-white hover:bg-slate-900/50 transition-all"
            >
              My Logbook
            </Link>
            {isExecutive && (
              <Link 
                href="/manager"
                className="px-4 py-2 rounded-xl text-sm font-medium hover:text-white hover:bg-slate-900/50 transition-all text-cyan-400/90"
              >
                Manager Portal
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 pr-4 border-r border-slate-900">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400 shadow-inner">
              {userInitials || 'ST'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-bold text-slate-200">
                {session.user.firstName} {session.user.lastName}
              </p>
              <p className="text-xs text-slate-500 font-medium leading-none mt-0.5">
                {session.user.role}
              </p>
            </div>
          </div>

          <LogoutButton />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-slate-950 bg-slate-950/20 text-center text-slate-600 text-xs mt-12">
        <p>© 2026 Zenowethu Debt Management (NCRDC3693). All rights reserved.</p>
        <p className="mt-1 text-slate-700">Member of DCASA | Mabopane, South Africa</p>
      </footer>
    </div>
  );
}
