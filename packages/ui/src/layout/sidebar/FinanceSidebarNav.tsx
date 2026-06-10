'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildFinanceNav, findActiveHref } from './finance-nav-items';

const ACCENT_ACTIVE: Record<string, string> = {
    cyan: 'bg-zeno-cyan/10 text-zeno-cyan',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    orange: 'bg-zeno-orange/10 text-zeno-orange',
};

type FinanceSidebarNavProps = {
    session: any;
};

export function FinanceSidebarNav({ session }: FinanceSidebarNavProps) {
    const pathname = usePathname();
    const sections = buildFinanceNav(session);
    const activeHref = findActiveHref(sections, pathname);

    return (
        <div>
            {sections.map((section, sectionIndex) => (
                <div key={section.title}>
                    {sectionIndex > 0 && (
                        <div className="mt-4 mb-2 px-2">
                            <div className="h-px bg-white/5"></div>
                        </div>
                    )}
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                        {section.title}
                    </h3>
                    <ul className="space-y-1 mb-2">
                        {section.items.map((item) => {
                            const isActive = item.href === activeHref;
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            isActive
                                                ? ACCENT_ACTIVE[item.accent]
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.iconPath} />
                                        </svg>
                                        {item.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </div>
    );
}
