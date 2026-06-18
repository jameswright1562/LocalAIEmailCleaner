export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
};

const transientStatusCodes = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function statusFromError(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
    if (typeof candidate.status === "number") return candidate.status;
    if (typeof candidate.response?.status === "number") return candidate.response.status;
  }
  return undefined;
}

export function isRetryableError(error: unknown): boolean {
  const status = statusFromError(error);
  if (status !== undefined) return transientStatusCodes.has(status);
  const code = (error as { code?: unknown } | undefined)?.code;
  if (typeof code === "string") {
    return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "EPIPE"].includes(code);
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 8000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableError(error)) break;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.random() * baseDelayMs;
      const delayMs = Math.round(exponential + jitter);
      options.onRetry?.(attempt + 1, error, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
