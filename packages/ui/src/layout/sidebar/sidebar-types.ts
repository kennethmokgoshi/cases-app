// Client-side logger (avoid importing server-only modules from shared-lib)
export const logger = {
    info: (...args: any[]) => console.log('[INFO]', ...args),
    error: (...args: any[]) => console.error('[ERROR]', ...args),
    warn: (...args: any[]) => console.warn('[WARN]', ...args),
    debug: (...args: any[]) => console.debug('[DEBUG]', ...args)
};

export type Project = {
    id: string;
    name: string;
    type: string;
    children?: Project[];
    _count?: { cases: number };
    parentId?: string | null;
};

export type ProjectNode = Project & {
    children?: ProjectNode[];
    level?: number;
};
