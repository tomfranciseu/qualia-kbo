export { createKboClient, disconnectKboClient, checkKboDatabaseHealth } from './client.js';
export { lookupByEnterpriseNumber, lookupByName, lookupByVatNumber } from './lookup.js';
export { getBelgianEnterpriseNumberFromVat, formatEnterpriseNumber } from './vat.js';
export type { KboLookupResult, KboAddress, KboContact } from './types.js';
