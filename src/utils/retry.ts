import { jitter, randomInt } from './random';
import { sleep } from './delay';
import { logger } from './logger';

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  label: string;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn('Operation failed; retrying if attempts remain', {
        label: options.label,
        attempt,
        attempts: options.attempts,
        error,
      });

      if (attempt < options.attempts) {
        const backoff = options.baseDelayMs * 2 ** (attempt - 1);
        await sleep(jitter(backoff + randomInt(0, 500)));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Retry operation failed: ${options.label}`);
}
