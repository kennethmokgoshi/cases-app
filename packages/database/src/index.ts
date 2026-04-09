import { PrismaClient, Prisma } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

function createPrismaClient() {
    const client = new PrismaClient()

    // Retry middleware for transient connection errors.
    // The Contabo VPS firewall silently drops idle TCP connections after ~6 min;
    // this gives Prisma up to 3 attempts with exponential back-off before failing.
    // Handles P1001 (connection refused), P1002 (timeout), P1017 (server closed),
    // and P2024 (connection pool timeout — all connections stale after VPS idle drop).
    return client.$extends({
        query: {
            $allModels: {
                async $allOperations({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
                    const MAX_RETRIES = 3
                    let lastError: unknown
                    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                        try {
                            return await query(args)
                        } catch (err: unknown) {
                            lastError = err
                            const isConnectionError =
                                err instanceof Prisma.PrismaClientInitializationError ||
                                (err instanceof Prisma.PrismaClientKnownRequestError &&
                                    ['P1001', 'P1002', 'P1017', 'P2024'].includes((err as Prisma.PrismaClientKnownRequestError).code))
                            if (!isConnectionError || attempt === MAX_RETRIES - 1) throw err
                            // On pool exhaustion (P2024), force-disconnect to clear stale connections
                            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2024') {
                                await client.$disconnect().catch(() => {})
                            }
                            // Exponential back-off: 500ms, 1000ms
                            await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
                        }
                    }
                    throw lastError
                },
            },
        },
    })
}

export const prisma = globalForPrisma.prisma ?? (createPrismaClient() as unknown as PrismaClient)

// Cache client in dev to survive HMR (process typed via globalThis to avoid @types/node dep)
const nodeEnv = (globalThis as any).process?.env?.NODE_ENV as string | undefined
if (nodeEnv !== 'production') globalForPrisma.prisma = prisma

// Gracefully disconnect on process exit so connections are released back to PostgreSQL.
// Critical for dev: prevents "too many clients" errors across hot reloads and server restarts.
const proc = globalThis as any
if (!proc.__prismaDisconnectRegistered) {
    proc.__prismaDisconnectRegistered = true
    const disconnect = () => { prisma.$disconnect().catch(() => {}) }
    proc.process?.on?.('beforeExit', disconnect)
    proc.process?.on?.('SIGINT', disconnect)
    proc.process?.on?.('SIGTERM', disconnect)
    proc.process?.on?.('SIGUSR2', disconnect) // nodemon/ts-node restart signal
}

export { PrismaClient, Prisma }
