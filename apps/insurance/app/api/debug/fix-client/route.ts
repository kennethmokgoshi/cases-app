
import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';

export async function GET() {
    try {
        const idNumber = '9206185360083';
        const client = await prisma.client.findFirst({
            where: { idNumber },
            include: { cases: true }
        });

        if (!client) {
            return NextResponse.json({ message: 'Client not found' });
        }

        if (client.cases.length === 0) {
            await prisma.client.delete({ where: { id: client.id } });
            return NextResponse.json({ message: `Deleted orphaned client: ${client.firstName} ${client.lastName}` });
        } else {
            return NextResponse.json({ message: 'Client has cases, cannot delete', cases: client.cases.length });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
