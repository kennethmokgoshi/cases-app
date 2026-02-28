import { NextResponse } from 'next/server';
import { prisma } from '@zenowethu/database';

export async function GET() {
    try {
        // Check database connectivity
        await prisma.$queryRaw`SELECT 1`;

        return NextResponse.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: process.env.APP_VERSION || '0.1.0',
            database: 'connected'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        return NextResponse.json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 503 });
    }
}
