export { createKboClient, disconnectKboClient, checkKboDatabaseHealth } from './client';
export { lookupByEnterpriseNumber, lookupByName, lookupByVatNumber } from './lookup';
export { getBelgianEnterpriseNumberFromVat, formatEnterpriseNumber } from './vat';
export type { KboLookupResult, KboAddress, KboContact } from './types';
