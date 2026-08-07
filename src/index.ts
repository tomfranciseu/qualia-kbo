export { createKboClient, disconnectKboClient, checkKboDatabaseHealth } from './client';
export { lookupByEnterpriseNumber, lookupByName, lookupByVatNumber } from './lookup';
export { listEnterprisesByNaceCode } from './activity';
export type {
  KboNaceEnterpriseHit,
  ListEnterprisesByNaceOptions,
  ListEnterprisesByNaceResult,
} from './activity';
export { getBelgianEnterpriseNumberFromVat, formatEnterpriseNumber } from './vat';
export type { KboLookupResult, KboAddress, KboContact } from './types';
export { fetchCompanyFinancials, checkNbbConfigured } from './nbb/financials';
export type {
  NbbAnnualAccountSummary,
  NbbFinancialLookupResult,
  FetchCompanyFinancialsOptions,
} from './nbb/types';
