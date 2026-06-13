import { NbbApiError, nbbGet } from './client';
import type { NbbAccountingData } from './types';

export async function fetchAccountingData(
  referenceNumber: string,
  fetchImpl: typeof fetch = fetch
): Promise<NbbAccountingData | null> {
  try {
    return await nbbGet<NbbAccountingData>(
      `/deposit/${encodeURIComponent(referenceNumber)}/accountingData`,
      fetchImpl
    );
  } catch (error) {
    if (error instanceof NbbApiError && error.status === 404) {
      return null;
    }
    throw error;
  }}
