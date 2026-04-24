'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { ProjectNode } from './sidebar-types';
import { calculateTotalCases } from './sidebar-tree-utils';

export const ProjectTreeItem = ({ project, depth = 0, autoExpandDate, yearContext }: { project: ProjectNode; depth?: number; autoExpandDate?: { year: string, month: string }, yearContext?: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const projectIdParam = searchParams.get('projectId');
    const activeProjectId = projectIdParam;

    const hasChildren = project.children && project.children.length > 0;
    const paddingLeft = depth * 12 + 12; // indentation
    const totalCases = project.type && project.type.startsWith('V_') ? project._count?.cases || 0 : calculateTotalCases(project);

    // Auto-expand logic
    useEffect(() => {
        if (autoExpandDate) {
            if (project.type === 'V_YEAR' && project.name === autoExpandDate.year) {
                setIsOpen(true);
            }
            if (project.type === 'V_MONTH' && project.name === autoExpandDate.month) {
                setIsOpen(true);
            }
        }
    }, [autoExpandDate, project]);

    return (
        <li>
            <div
                className={`flex items-center justify-between py-2 pr-3 rounded-lg transition-colors group ${activeProjectId === project.id ? 'bg-zeno-cyan/10 text-zeno-cyan' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                style={{ paddingLeft: `${paddingLeft}px` }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {hasChildren ? (
                        <>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsOpen(!isOpen);
                                }}
                                className="p-0.5 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                            >
                                <svg
                                    className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            {(() => {
                                let href = '#';
                                if (project.type === 'V_YEAR') {
                                    href = `/cases?year=${encodeURIComponent(project.name)}`;
                                } else if (project.type === 'V_MONTH') {
                                    if (yearContext) {
                                        href = `/cases?year=${encodeURIComponent(yearContext)}&month=${encodeURIComponent(project.name)}`;
                                    } else {
                                        const parts = project.id.split('-');
                                        if (parts.length >= 4) {
                                            const year = parts[2];
                                            href = `/cases?year=${year}&month=${encodeURIComponent(project.name)}`;
                                        } else {
                                            href = `/cases?projectId=${project.id}`;
                                        }
                                    }
                                } else if (project.type === 'V_SOURCE') {
                                    const parts = project.id.split('-');
                                    if (parts.length >= 5) {
                                        const year = parts[2];
                                        const month = parts[3];
                                        href = `/cases?year=${year}&month=${month}&source=${encodeURIComponent(project.name)}`;
                                    }
                                } else {
                                    href = `/cases?projectId=${project.id}`;
                                }

                                return (
                                    <Link
                                        href={href}
                                        className="truncate flex-1 hover:text-white transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {project.name}
                                    </Link>
                                );
                            })()}
                        </>
                    ) : (
                        <>
                            <div className="w-4" />
                            {(() => {
                                let href = '#';
                                if (project.type === 'V_MONTH') {
                                    if (yearContext) {
                                        href = `/cases?year=${encodeURIComponent(yearContext)}&month=${encodeURIComponent(project.name)}`;
                                    } else {
                                        href = `/cases?projectId=${project.id}`;
                                    }
                                } else {
                                    href = `/cases?projectId=${project.id}`;
                                }
                                return (
                                    <Link
                                        href={href}
                                        className="truncate flex-1"
                                    >
                                        {project.name}
                                    </Link>
                                )
                            })()}
                        </>
                    )}
                </div>
                {totalCases > 0 ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${activeProjectId === project.id ? 'bg-zeno-cyan/20 text-zeno-cyan' : 'bg-zeno-blue text-gray-300 group-hover:bg-zeno-cyan/20 group-hover:text-zeno-cyan'}`}>
                        {totalCases}
                    </span>
                ) : null}
            </div>
            {hasChildren && isOpen && (
                <ul className="space-y-0.5 mt-0.5 border-l border-white/5 ml-3">
                    {project.children!.map(child => (
                        <ProjectTreeItem
                            key={child.id}
                            project={child}
                            depth={depth + 1}
                            autoExpandDate={autoExpandDate}
                            yearContext={project.type === 'V_YEAR' ? project.name : yearContext}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};
