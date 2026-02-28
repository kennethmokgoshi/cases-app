import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';

export async function GET() {
    try {
        const zdmProjects = await prisma.project.findMany({
            where: { name: { contains: 'ZDM' } },
            include: {
                members: {
                    include: { user: { select: { id: true, firstName: true, email: true } } }
                },
                parent: true
            }
        });

        const bheki = await prisma.user.findFirst({
            where: { firstName: { contains: 'Bheki' } },
            select: { id: true, email: true, firstName: true }
        });

        return NextResponse.json({
            zdmProjects,
            bhekiUser: bheki,
            projectCount: zdmProjects.length,
            environment: process.env.NODE_ENV
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
}
