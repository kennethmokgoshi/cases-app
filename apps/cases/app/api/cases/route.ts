import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';
import { auth, createLogger } from '@zenowethu/shared-lib';

const logger = createLogger('api/cases-minimal');

export async function GET(request: Request) {
    try {
        console.log('>>> API CASES REACHED');
        const session = await auth();
        if (!session?.user?.id) {
            console.log('>>> API CASES UNAUTHORIZED');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const slim = searchParams.get('slim') === 'true';

        if (slim) {
            console.log('>>> API CASES SLIM MODE');
            const data = await prisma.case.findMany({
                select: { id: true, createdAt: true },
                take: 100,
                orderBy: { createdAt: 'desc' }
            });
            return NextResponse.json(data);
        }

        console.log('>>> API CASES FULL MODE (CLIENT INCLUDE)');
        const cases = await prisma.case.findMany({
            include: {
                client: true,
                projects: { include: { project: true } }
            },
            take: 20,
            orderBy: { createdAt: 'desc' }
        });

        const enriched = cases.map(c => ({
            ...c,
            // Ensure client object exists for frontend
            client: c.client || { firstName: 'Unknown', lastName: 'Client', idNumber: 'N/A', phone: 'N/A' }
        }));
        
        console.log('>>> API CASES SUCCESS, COUNT:', enriched.length);
        return NextResponse.json(enriched);
    } catch (err: any) {
        console.error('>>> API CASES CRASHED:', err);
        return NextResponse.json({ 
            error: 'Internal Server Error', 
            message: err?.message || 'Unknown error',
            stack: err?.stack 
        }, { status: 500 });
    }
}
