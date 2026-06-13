import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'https://ws.cbso.nbb.be';

export type NbbClientConfig = {
  subscriptionKey: string;
  baseUrl: string;
};

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
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const config = getNbbClientConfig();
  if (!config) {
    throw new NbbApiError('NBB CBSO not configured');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${config.baseUrl}/authentic${normalizedPath}`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'NBB-CBSO-Subscription-Key': config.subscriptionKey,
      'X-Request-Id': randomUUID(),
    },
  });

  if (!response.ok) {
    throw new NbbApiError(
      `NBB CBSO request failed (${response.status})`,
      response.status,
      normalizedPath
    );
  }

  return (await response.json()) as T;
}
