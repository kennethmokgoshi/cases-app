import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

const chatCreate = vi.fn();
const rateLimitState = { allowed: true, retryAfterSeconds: 0 };

vi.mock('@zenowethu/shared-lib', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  clientIpFromHeaders: () => '203.0.113.9',
  checkRateLimit: vi.fn(() => ({ ...rateLimitState })),
  getAiClientForTask: vi.fn(async () => ({
    client: { chat: { completions: { create: chatCreate } } },
    model: 'gpt-4o-mini',
  })),
}));

vi.mock('@zenowethu/database', () => ({
  prisma: {
    consumerAccount: { findUnique: vi.fn() },
  },
}));

import { auth } from '@/auth';
import { prisma } from '@zenowethu/database';
import { getAiClientForTask } from '@zenowethu/shared-lib';
import { POST } from './route';

const db = prisma as unknown as {
  consumerAccount: { findUnique: ReturnType<typeof vi.fn> };
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/ai-coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitState.allowed = true;
  rateLimitState.retryAfterSeconds = 0;
  vi.mocked(auth).mockResolvedValue({ user: { id: 'consumer1' } } as never);
  db.consumerAccount.findUnique.mockResolvedValue({
    firstName: 'Thabo',
    province: 'Gauteng',
    language: 'English',
    linkedClient: null,
  });
  chatCreate.mockResolvedValue({
    model: 'gpt-4o-mini',
    choices: [{ message: { content: 'Here is some advice.' } }],
  });
});

describe('POST /api/ai-coach', () => {
  it('rejects anonymous callers before touching the AI provider', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await POST(makeRequest({ message: 'hello' }));

    expect(res.status).toBe(401);
    expect(getAiClientForTask).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After when the rate limit is exceeded', async () => {
    rateLimitState.allowed = false;
    rateLimitState.retryAfterSeconds = 120;

    const res = await POST(makeRequest({ message: 'hello' }));

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('120');
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it('loads context for the session user only, ignoring any consumerId in the body', async () => {
    const res = await POST(makeRequest({ message: 'hello', consumerId: 'someone-else' }));

    expect(res.status).toBe(200);
    expect(db.consumerAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'consumer1' } })
    );
    expect(chatCreate).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json.reply).toBe('Here is some advice.');
  });

  it('rejects an invalid body', async () => {
    const res = await POST(makeRequest({ message: '' }));

    expect(res.status).toBe(400);
    expect(chatCreate).not.toHaveBeenCalled();
  });
});
