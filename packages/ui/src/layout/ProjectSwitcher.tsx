'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Project, useProject } from '../providers/project-context';

// Client-side logger (avoid importing server-only modules from shared-lib)
const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export function ProjectSwitcher() {
    const router = useRouter();
    const { activeProject, setActiveProject } = useProject();
    const [isOpen, setIsOpen] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch projects on mount
        async function fetchProjects() {
            setLoading(true);
            try {
                const res = await fetch('/api/projects?flat=true');
                if (res.ok) {
                    const data = await res.json();
                    setProjects(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                logger.error('Failed to load projects', error);
            } finally {
                setLoading(false);
            }
        }
        fetchProjects();

        // Close dropdown on outside click
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredProjects = projects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelect = (project: Project) => {
        setActiveProject(project);
        router.push(`/cases?projectId=${project.id}`);
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-zeno-blue to-zeno-navy border border-zeno-blue/50 text-white rounded-lg hover:border-zeno-cyan/50 hover:bg-zeno-blue/80 transition-all font-medium min-w-[180px]"
            >
                <div className="bg-zeno-cyan text-zeno-navy p-1 rounded">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                </div>
                <span>{activeProject ? activeProject.name : "Select a project"}</span>
                <svg className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-zeno-navy border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-white/5 bg-zeno-blue/20">
                        <input
                            type="text"
                            placeholder="Find a project..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zeno-navy border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-zeno-cyan focus:outline-none placeholder-gray-500"
                            autoFocus
                        />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {loading ? (
                            <div className="p-4 text-center text-gray-400 text-sm">Loading projects...</div>
                        ) : filteredProjects.length > 0 ? (
                            <ul className="py-1">
                                {filteredProjects.map((project) => (
                                    <li key={project.id}>
                                        <button
                                            onClick={() => handleSelect(project)}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2 group"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-zeno-cyan transition-colors"></span>
                                            {project.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="p-4 text-center text-gray-500 text-sm">No projects found</div>
                        )}
                    </div>
                    <div className="p-2 border-t border-white/5 bg-zeno-blue/10">
                        <button
                            onClick={() => { router.push('/cases'); setIsOpen(false); }}
                            className="w-full text-center text-xs text-zeno-cyan hover:text-white transition-colors py-1"
                        >
                            View All Cases
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
