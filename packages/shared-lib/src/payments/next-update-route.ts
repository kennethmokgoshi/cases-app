// Reusable Next.js route handlers for a per-app next-update date. Each app wires
// it in one line with its own app key, guaranteeing the date stays isolated to
// that app:
//
//   // apps/legal/app/api/cases/[id]/next-update/route.ts
//   import { createNextUpdateRoute } from '@zenowethu/shared-lib/src/payments/next-update-route';
//   export const { GET, PATCH } = createNextUpdateRoute('LEGAL');
//
// Node-only — do not import from the package root.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../auth';
import {
    getCaseAppNextUpdate,
    setCaseAppNextUpdate,
} from './case-app-next-update-service';
import type { NextUpdateApp } from './next-update';

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
    // ISO date string, or null/empty to clear the date
    nextUpdateDate: z.string().trim().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
});

export function createNextUpdateRoute(app: NextUpdateApp) {
    async function GET(_request: Request, { params }: Ctx) {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;
        const row = await getCaseAppNextUpdate(id, app);
        return NextResponse.json({ app, nextUpdate: row });
    }

    async function PATCH(request: Request, { params }: Ctx) {
        const session = await auth();
        if (!session?.user) return new NextResponse('Unauthorized', { status: 401 });
        const { id } = await params;

        const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
        }

        const raw = parsed.data.nextUpdateDate;
        let date: Date | null = null;
        if (raw) {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) {
                return NextResponse.json({ error: { nextUpdateDate: ['Invalid date'] } }, { status: 400 });
            }
            date = d;
        }

        const row = await setCaseAppNextUpdate({
            caseId: id,
            app,
            nextUpdateDate: date,
            note: parsed.data.note ?? null,
            userId: (session.user as { id?: string }).id ?? null,
        });
        return NextResponse.json({ app, nextUpdate: row });
    }

    return { GET, PATCH };
}
