export { createKboClient, disconnectKboClient, checkKboDatabaseHealth, getKboDatabaseLocation } from './client';
export { lookupByEnterpriseNumber, lookupByName, lookupByVatNumber, searchEnterprisesByName } from './lookup';
export { countEnterprisesByNacePostalCode, listEnterprisesByNaceAndPostalCode, listEnterprisesByNaceCode } from './activity';
export type {
  EnterprisesByPostalCodeRow,
  KboNaceEnterpriseHit,
  NacePostalEnterprise,
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

export type { KboCompanySearchHit, SearchEnterprisesByNameOptions } from './lookup';
export type { KboClient } from './client';
