/**
 * Classifies failures during AI plan generation into structured, human-readable
 * diagnostics so staff can tell a configuration problem from a provider outage
 * from a bad AI response — instead of a generic "Failed to generate plan".
 */

export type PlanErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'AI_RATE_LIMITED'
  | 'AI_MODEL_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'AI_NETWORK_ERROR'
  | 'AI_BAD_RESPONSE'
  | 'DATABASE_ERROR'
  | 'UNKNOWN';

export interface ClassifiedPlanError {
  code: PlanErrorCode;
  /** Short human-readable headline, safe to show in the UI. */
  message: string;
  /** What actually happened, in plain English (no secrets). */
  detail: string;
  /** What staff/admin should do about it. */
  hint: string;
  /** Suggested HTTP status for the API response. */
  httpStatus: number;
}

export interface AiProviderInfo {
  provider: 'OpenRouter' | 'Anthropic';
  envVar: 'OPENROUTER_API_KEY' | 'ANTHROPIC_API_KEY';
  keyConfigured: boolean;
  /** True when the configured key does not match the provider's expected prefix. */
  keyLooksWrong: boolean;
  expectedPrefix: string;
}

/** Describes which AI provider the planner will use, based on current env vars. */
export function describeAiProvider(): AiProviderInfo {
  const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const key = useOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.ANTHROPIC_API_KEY;
  const expectedPrefix = useOpenRouter ? 'sk-or-' : 'sk-ant-';
  return {
    provider: useOpenRouter ? 'OpenRouter' : 'Anthropic',
    envVar: useOpenRouter ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY',
    keyConfigured: !!key,
    keyLooksWrong: !!key && !key.startsWith(expectedPrefix),
    expectedPrefix,
  };
}

interface ErrorLike {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  name?: unknown;
}

export function classifyPlanGenerationError(error: unknown): ClassifiedPlanError {
  const err = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const message = typeof err.message === 'string' ? err.message : String(error ?? 'Unknown error');
  const status = typeof err.status === 'number' ? err.status : undefined;
  const code = typeof err.code === 'string' ? err.code : undefined;
  const name = typeof err.name === 'string' ? err.name : '';
  const provider = describeAiProvider();

  // No key configured at all
  if (!provider.keyConfigured) {
    return {
      code: 'AI_NOT_CONFIGURED',
      message: 'AI provider is not configured',
      detail: `Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set, so the plan engine has no AI provider to call.`,
      hint: 'Add a valid OPENROUTER_API_KEY (starts with sk-or-) or ANTHROPIC_API_KEY (starts with sk-ant-) to the environment, then restart the app.',
      httpStatus: 503,
    };
  }

  // Authentication failures from the provider
  if (status === 401 || status === 403) {
    const wrongKeyNote = provider.keyLooksWrong
      ? ` The configured key does not look like a ${provider.provider} key (expected it to start with "${provider.expectedPrefix}") — it may belong to a different provider (e.g. an OpenAI key pasted into the wrong variable).`
      : '';
    return {
      code: 'AI_AUTH_FAILED',
      message: `${provider.provider} rejected the API key`,
      detail: `${provider.provider} returned ${status} (${message}).${wrongKeyNote}`,
      hint: `Check ${provider.envVar} in the environment (.env.local). ${provider.provider} keys start with "${provider.expectedPrefix}". Restart the app after changing it.`,
      httpStatus: 502,
    };
  }

  if (status === 429) {
    return {
      code: 'AI_RATE_LIMITED',
      message: `${provider.provider} rate limit reached`,
      detail: `${provider.provider} returned 429 (${message}). Too many requests or the account is out of credits.`,
      hint: `Wait a minute and retry. If it persists, check the ${provider.provider} account's usage limits and credit balance.`,
      httpStatus: 502,
    };
  }

  // Model not found / invalid request to the provider
  if (status === 404 || status === 400) {
    return {
      code: 'AI_MODEL_ERROR',
      message: `${provider.provider} rejected the request`,
      detail: `${provider.provider} returned ${status} (${message}). The model ID may be invalid or unavailable on this account.`,
      hint: `Verify the model configured in the plan engine is available on ${provider.provider}.`,
      httpStatus: 502,
    };
  }

  if (typeof status === 'number' && status >= 500) {
    return {
      code: 'AI_PROVIDER_ERROR',
      message: `${provider.provider} service error`,
      detail: `${provider.provider} returned ${status} (${message}). The provider is having problems.`,
      hint: 'Retry in a few minutes. If it persists, check the provider status page.',
      httpStatus: 502,
    };
  }

  // Network-level failures (DNS, refused connection, timeout, no internet)
  const networkCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'];
  if (
    (code && networkCodes.includes(code)) ||
    name === 'APIConnectionError' ||
    name === 'APIConnectionTimeoutError' ||
    /fetch failed|network|socket hang up/i.test(message)
  ) {
    return {
      code: 'AI_NETWORK_ERROR',
      message: `Could not reach ${provider.provider}`,
      detail: `Network error while calling ${provider.provider}: ${message}.`,
      hint: 'Check the server\'s internet connection, DNS, and any firewall/proxy rules, then retry.',
      httpStatus: 502,
    };
  }

  // AI responded but not with usable JSON
  if (/No JSON found/i.test(message) || name === 'SyntaxError') {
    return {
      code: 'AI_BAD_RESPONSE',
      message: 'AI returned an unusable response',
      detail: `The AI model responded, but the reply could not be parsed as a plan (${message}).`,
      hint: 'Retry generation — this is usually transient. If it keeps happening, the model or prompt may need attention.',
      httpStatus: 502,
    };
  }

  // Prisma / database failures
  if (name.startsWith('PrismaClient') || (code?.startsWith('P') && /^\d+$/.test(code.slice(1)))) {
    return {
      code: 'DATABASE_ERROR',
      message: 'Database error while generating the plan',
      detail: `The database operation failed: ${message}.`,
      hint: 'Check the database connection and server logs.',
      httpStatus: 500,
    };
  }

  return {
    code: 'UNKNOWN',
    message: 'Failed to generate plan',
    detail: message,
    hint: 'Check the server logs for the full error, then retry.',
    httpStatus: 500,
  };
}
