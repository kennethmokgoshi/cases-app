// How far a case file is through the workflow, based on the platform's
// 11 status categories (1. Beginning → 10. Settled, 11. Lost).
// Pure module — safe to import from client components.

import { STATUS_CATEGORIES, getStatusByCode, formatStatus } from '@zenowethu/shared-lib/src/statuses/statuses';

export { formatStatus };

// Progress bar colour per workflow category (mirrors STATUS_CATEGORIES colours)
const CATEGORY_BAR_CLASS: Record<string, string> = {
    BEGINNING:         'bg-blue-400/70',
    OVERDUE:           'bg-red-500/80',
    IN_PROGRESS:       'bg-cyan-400/70',
    DETOUR:            'bg-orange-400/70',
    ADVANCED:          'bg-indigo-400/70',
    ADVANCED_DETOUR:   'bg-amber-400/70',
    ADVANCED_PROGRESS: 'bg-teal-400/70',
    COMPLETED:         'bg-green-400/70',
    PAYING:            'bg-teal-400/70',
    SETTLED:           'bg-emerald-400/80',
    LOST:              'bg-gray-500/70',
};

export type WorkflowInfo = {
    label: string;
    description: string | null;
    categoryName: string | null;
    stageNumber: number | null;
    isLost: boolean;
    isOverdue: boolean;
    percent: number;
    barClass: string;
};

export function getWorkflowInfo(statusCode: string): WorkflowInfo {
    const status = getStatusByCode(statusCode);
    const category = status?.category ?? null;
    const idx = category ? STATUS_CATEGORIES.findIndex((c) => c.code === category) : -1;
    const stageNumber = idx >= 0 ? idx + 1 : null;
    const isLost = category === 'LOST';
    const isOverdue = category === 'OVERDUE';
    return {
        label: formatStatus(statusCode),
        description: status?.description ?? null,
        categoryName: idx >= 0 ? STATUS_CATEGORIES[idx].name.replace(/^\d+\.\s*/, '') : null,
        stageNumber,
        isLost,
        isOverdue,
        percent: stageNumber == null || isLost ? 0 : Math.min(100, Math.round((stageNumber / 10) * 100)),
        barClass: category ? CATEGORY_BAR_CLASS[category] : 'bg-gray-500/50',
    };
}
