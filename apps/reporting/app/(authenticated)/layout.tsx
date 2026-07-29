'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { canAccessDashboard } from '../../lib/role-check';
import { roleDashboardMap, UserRole } from '../../lib/roles';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  const role = ((session?.user as any)?.reportingRole || 'staff') as UserRole;

  useEffect(() => {
    if (mounted && status === 'unauthenticated') {
      router.push('/');
    }
  }, [mounted, status, router]);

  useEffect(() => {
    if (mounted && status === 'authenticated') {
      // Role-based route protection
      if (pathname.startsWith('/admin') && !canAccessDashboard(role, 'admin')) {
        router.push(roleDashboardMap[role] || '/staff');
      } else if (pathname.startsWith('/executive') && !canAccessDashboard(role, 'executive')) {
        router.push(roleDashboardMap[role] || '/staff');
      } else if (pathname.startsWith('/manager') && !canAccessDashboard(role, 'manager')) {
        router.push(roleDashboardMap[role] || '/staff');
      } else if (pathname.startsWith('/finance') && !canAccessDashboard(role, 'finance')) {
        router.push(roleDashboardMap[role] || '/staff');
      }
    }
  }, [mounted, status, role, pathname, router]);

  if (!mounted || status === 'loading') {
    return (
      <main className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-cyan-400 font-medium animate-pulse">Loading Zenowethu Reporting...</div>
      </main>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  // Determine which dashboards this user is allowed to access
  const navigationItems = [
    { name: 'Staff', path: '/staff', role: 'staff' },
    { name: 'Finance', path: '/finance', role: 'finance' },
    { name: 'Manager', path: '/manager', role: 'manager' },
    { name: 'Executive', path: '/executive', role: 'executive' },
    { name: 'Admin', path: '/admin', role: 'admin' },
  ].filter(item => canAccessDashboard(role, item.role as UserRole));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Premium Header */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center shadow-md shadow-cyan-500/20">
                <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">Zenowethu</span>
                <span className="text-xs text-cyan-400 block -mt-1 font-semibold tracking-wider uppercase">Reporting</span>
              </div>
            </div>

            {/* Navigation links for allowed dashboards */}
            <nav className="hidden md:flex space-x-1">
              {navigationItems.map((item) => {
                const isActive = pathname.startsWith(item.path);
                return (
                  <a
                    key={item.path}
                    href={item.path}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-slate-800 text-cyan-400 border-b-2 border-cyan-400 rounded-b-none'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.name}
                  </a>
                );
              })}
            </nav>

            {/* User Profile and Sign Out */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-white">{session?.user?.firstName || 'User'}</p>
                <p className="text-xs text-slate-400 font-mono capitalize">{role}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-3 py-1.5 bg-slate-800 hover:bg-red-950 hover:text-red-300 text-slate-300 text-sm font-medium rounded-lg border border-slate-700 hover:border-red-900/50 transition-all duration-150"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Links */}
        <div className="md:hidden border-t border-slate-800 bg-slate-900/50">
          <div className="px-2 pt-2 pb-3 space-y-1 flex flex-wrap gap-2">
            {navigationItems.map((item) => {
              const isActive = pathname.startsWith(item.path);
              return (
                <a
                  key={item.path}
                  href={item.path}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.name}
                </a>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
