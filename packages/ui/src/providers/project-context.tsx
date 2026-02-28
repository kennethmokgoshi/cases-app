'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type Project = {
    id: string;
    name: string;
    description?: string | null;
    type?: string;
};

interface ProjectContextType {
    activeProject: Project | null;
    setActiveProject: (p: Project | null) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [activeProject, setActiveProject] = useState<Project | null>(null);
    return <ProjectContext.Provider value={{ activeProject, setActiveProject }}>{children}</ProjectContext.Provider>;
}

export function useProject() {
    const context = useContext(ProjectContext);
    if (!context) throw new Error('useProject must be used within ProjectProvider');
    return context;
}
