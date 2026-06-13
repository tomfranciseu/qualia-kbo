export type NbbAnnualAccountSummary = {
  fiscalYear: number;
  referenceNumber: string;
  revenue: number | null;
  netResult: number | null;
  marginPercent: number | null;
  currency: 'EUR';
  depositDate?: string;
  error?: 'no_json' | 'fetch_failed';
};

export type NbbFinancialLookupResult = {
  enterpriseNumber: string;
  enterpriseName?: string;
  years: NbbAnnualAccountSummary[];
};

export type NbbDepositReference = {
  referenceNumber: string;
  depositDate?: string;
  fiscalYear: number;
  enterpriseName?: string;
  accountingDataUrl?: string;
};

export type NbbRubric = {
  Code: string;
  Value: string;
  Period?: 'N' | 'NM1' | string;
  DataType?: string;
  TypeAmount?: string;
};

export type NbbAccountingData = {
  ReferenceNumber?: string;
  EnterpriseName?: string;
  Rubrics?: NbbRubric[];
};

export type FetchCompanyFinancialsOptions = {
  years?: number;
};
