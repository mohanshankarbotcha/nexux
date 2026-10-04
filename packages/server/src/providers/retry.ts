import {
  NexusError,
  ProviderRateLimitError,
  NetworkError,
  TaskCancelledError,
  logger,
} from '@nexus/core';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  providerName: string;
  abortSignal?: AbortSignal;
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof NexusError) {
    return err.isRetryable;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('fetch failed')
    );
  }
  return false;
}

export async function withSafeRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const signal = options.abortSignal;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new TaskCancelledError('Operation aborted by user or timeout');
    }

    try {
      return await operation(attempt);
    } catch (err: unknown) {
      lastError = err;

      if (signal?.aborted) {
        throw new TaskCancelledError('Operation aborted by user or timeout');
      }

      // Check if error is safe to retry
      const canRetry = attempt < maxRetries && isRetryableError(err);
      if (!canRetry) {
        throw err;
      }

      // Exponential backoff with jitter
      const jitter = Math.floor(Math.random() * 150);
      const delayMs = baseDelayMs * Math.pow(2, attempt) + jitter;

      logger.warn(
        `withSafeRetry: [${options.providerName}] transient error encountered, retrying in ${delayMs}ms (attempt ${
          attempt + 1
        }/${maxRetries}): ${err instanceof Error ? err.message : String(err)}`
      );

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new TaskCancelledError('Operation aborted during retry backoff'));
            },
            { once: true }
          );
        }
      });
    }
  }

  throw lastError;
}
