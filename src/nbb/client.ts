import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://ws.cbso.nbb.be';

export type NbbClientConfig = {
  subscriptionKey: string;
  baseUrl: string;
};

export type NbbRequestOptions = {
  retries?: number;
  timeoutMs?: number;
};

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

export function getNbbClientConfig(): NbbClientConfig | null {
  const subscriptionKey = process.env.NBB_CBSO_SUBSCRIPTION_KEY?.trim();
  if (!subscriptionKey) return null;

  const baseUrl = (process.env.NBB_CBSO_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
  return { subscriptionKey, baseUrl };
}

export function normalizeEnterpriseNumber(input: string): string {
  return input.replaceAll(/\D/g, '');
}

export class NbbApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string
  ) {
    super(message);
    this.name = 'NbbApiError';
  }
}

export async function nbbGet<T>(
  path: string,
  fetchImpl: typeof fetch = fetch,
  options: NbbRequestOptions = {}
): Promise<T> {
  const config = getNbbClientConfig();
  if (!config) {
    throw new NbbApiError('NBB CBSO not configured');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${config.baseUrl}/authentic${normalizedPath}`;

  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'NBB-CBSO-Subscription-Key': config.subscriptionKey,
          'X-Request-Id': randomUUID(),
        },
        signal: controller.signal,
      });
      if (response.ok) return (await response.json()) as T;

      const error = new NbbApiError(`NBB CBSO request failed (${response.status})`, response.status, normalizedPath);
      if (response.status !== 429 && response.status !== 503) throw error;
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error && error.name === 'AbortError'
        ? new NbbApiError(`NBB CBSO request timed out after ${timeoutMs}ms`, undefined, normalizedPath)
        : error;
      if (lastError instanceof NbbApiError && lastError.status !== undefined && lastError.status !== 429 && lastError.status !== 503) throw lastError;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < retries) await new Promise<void>((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }

  throw lastError instanceof Error ? lastError : new NbbApiError('NBB CBSO request failed', undefined, normalizedPath);
}
