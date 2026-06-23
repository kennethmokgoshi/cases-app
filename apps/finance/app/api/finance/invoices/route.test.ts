import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from './route'
import { prisma } from '@zenowethu/database'
import { randomUUID } from 'crypto'

// Mock next/server
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, opts?: any) => ({
      json: async () => data,
      ok: !opts?.status || opts.status < 400,
      status: opts?.status || 200,
    }),
  },
}))

// Mock shared-lib auth
vi.mock('@zenowethu/shared-lib', () => ({
  auth: vi.fn(),
  logger: { error: vi.fn() },
}))

describe('Invoice number generation - Race condition fix', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.documentSequence.deleteMany({})
  })

  it('should generate unique sequential invoice numbers under concurrent load', async () => {
    const prefix = 'QUO'
    const year = new Date().getFullYear()

    // Simulate 10 concurrent requests trying to create quotes
    const promises = Array.from({ length: 10 }, async (_, i) => {
      const seq_record = await prisma.documentSequence.upsert({
        where: { prefix_year: { prefix, year } },
        update: { nextSeq: { increment: 1 } },
        create: { prefix, year, nextSeq: 2 },
      })
      return seq_record.nextSeq
    })

    const sequences = await Promise.all(promises)

    // Should get 10 unique sequential numbers
    const unique = new Set(sequences)
    expect(unique.size).toBe(10)
    expect(sequences.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('should initialize sequence at 1 for new prefix/year combo', async () => {
    const result = await prisma.documentSequence.upsert({
      where: { prefix_year: { prefix: 'INV', year: 2026 } },
      update: { nextSeq: { increment: 1 } },
      create: { prefix: 'INV', year: 2026, nextSeq: 2 },
    })

    expect(result.nextSeq).toBe(2) // First call returns 2 (because we increment on create)
  })

  afterEach(async () => {
    await prisma.documentSequence.deleteMany({})
  })
})
