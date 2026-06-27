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
    // and P2024 (connection pool timeout).
    //
    // IMPORTANT: this client is a single shared/global instance. We must NOT call
    // client.$disconnect() here on retry — under concurrency that tears down
    // connections other in-flight requests are actively using, turning one
    // request's pool timeout into a cascading failure across all users. For a
    // genuinely dropped connection (P1001/P1002/P1017) Prisma reconnects lazily
    // on the next query; for pool exhaustion (P2024) backing off lets in-flight
    // queries return their connections to the pool. Backoff alone is correct.
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
                            // Exponential back-off: 500ms, 1000ms. No $disconnect — see note above.
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

// Re-export Prisma-generated enum types so consumers can import from '@zenowethu/database'
// instead of directly from '@prisma/client' (which may not be hoisted in all workspace packages).
export type {
    ReferrerCommissionStage,
} from '@prisma/client'
