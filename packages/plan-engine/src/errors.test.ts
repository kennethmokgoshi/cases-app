import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyPlanGenerationError, describeAiProvider } from './errors';

describe('describeAiProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers OpenRouter when OPENROUTER_API_KEY is set', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-abc123');
    const info = describeAiProvider();
    expect(info.provider).toBe('OpenRouter');
    expect(info.envVar).toBe('OPENROUTER_API_KEY');
    expect(info.keyConfigured).toBe(true);
    expect(info.keyLooksWrong).toBe(false);
  });

  it('flags an OpenAI-style key pasted into OPENROUTER_API_KEY as wrong-looking', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-proj-notanopenrouterkey');
    const info = describeAiProvider();
    expect(info.provider).toBe('OpenRouter');
    expect(info.keyLooksWrong).toBe(true);
    expect(info.expectedPrefix).toBe('sk-or-');
  });

  it('falls back to Anthropic when only ANTHROPIC_API_KEY is set', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-abc123');
    const info = describeAiProvider();
    expect(info.provider).toBe('Anthropic');
    expect(info.envVar).toBe('ANTHROPIC_API_KEY');
    expect(info.keyConfigured).toBe(true);
    expect(info.keyLooksWrong).toBe(false);
  });

  it('reports no key configured when both env vars are empty', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const info = describeAiProvider();
    expect(info.keyConfigured).toBe(false);
  });
});

describe('classifyPlanGenerationError', () => {
  beforeEach(() => {
    // Default: OpenRouter configured with a wrong-provider key (the real-world failure seen in prod)
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-proj-wrongkey');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('classifies a 401 as auth failure and calls out the wrong-looking key', () => {
    const err = Object.assign(new Error('401 Missing Authentication header'), { status: 401 });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('AI_AUTH_FAILED');
    expect(result.message).toContain('OpenRouter');
    expect(result.detail).toContain('does not look like a OpenRouter key');
    expect(result.hint).toContain('OPENROUTER_API_KEY');
    expect(result.httpStatus).toBe(502);
  });

  it('classifies a 401 without the wrong-key note when the key prefix is correct', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-validlooking');
    const err = Object.assign(new Error('401 Unauthorized'), { status: 401 });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('AI_AUTH_FAILED');
    expect(result.detail).not.toContain('does not look like');
  });

  it('classifies missing configuration when no key is set', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const result = classifyPlanGenerationError(new Error('anything'));
    expect(result.code).toBe('AI_NOT_CONFIGURED');
    expect(result.httpStatus).toBe(503);
  });

  it('classifies a 429 as rate limiting', () => {
    const err = Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('AI_RATE_LIMITED');
    expect(result.httpStatus).toBe(502);
  });

  it('classifies a 404 as a model error', () => {
    const err = Object.assign(new Error('404 model not found'), { status: 404 });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('AI_MODEL_ERROR');
  });

  it('classifies provider 5xx errors', () => {
    const err = Object.assign(new Error('502 Bad Gateway'), { status: 502 });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('AI_PROVIDER_ERROR');
  });

  it('classifies network failures by error code', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('AI_NETWORK_ERROR');
  });

  it('classifies fetch failures as network errors', () => {
    const result = classifyPlanGenerationError(new Error('fetch failed'));
    expect(result.code).toBe('AI_NETWORK_ERROR');
  });

  it('classifies unparseable AI output', () => {
    const result = classifyPlanGenerationError(new Error('No JSON found in Claude response'));
    expect(result.code).toBe('AI_BAD_RESPONSE');
  });

  it('classifies Prisma errors as database errors', () => {
    const err = Object.assign(new Error('connection pool timeout'), {
      name: 'PrismaClientKnownRequestError',
    });
    const result = classifyPlanGenerationError(err);
    expect(result.code).toBe('DATABASE_ERROR');
  });

  it('falls back to UNKNOWN with the original message as detail', () => {
    const result = classifyPlanGenerationError(new Error('something odd'));
    expect(result.code).toBe('UNKNOWN');
    expect(result.detail).toBe('something odd');
  });

  it('handles non-Error throwables', () => {
    const result = classifyPlanGenerationError('string failure');
    expect(result.code).toBe('UNKNOWN');
    expect(result.detail).toContain('string failure');
  });
});
