import { insertMany } from '../client';
import { parseDate } from './helper';
import { nullable, readCsvBatches } from './csv';

type EnterpriseInput = { EnterpriseNumber: string; Status: string; JuridicalSituation: string; TypeOfEnterprise: string; JuridicalForm?: string; JuridicalFormCAC?: string; StartDate: string };

export async function loadEnterpriseCSV(filename: string, upsertMode: boolean): Promise<void> {
  await readCsvBatches<EnterpriseInput, unknown[]>(filename, (row) => [row.EnterpriseNumber, row.Status, row.JuridicalSituation, row.TypeOfEnterprise, nullable(row.JuridicalForm), nullable(row.JuridicalFormCAC), (parseDate(row.StartDate) ?? new Date()).toISOString()], (batch) => insertMany('Enterprise', ['enterpriseNumber', 'KBOstatusCode', 'juridicalSituationCode', 'typeOfEnterpriseCode', 'juridicalFormCode', 'juridicalFormCACCode', 'startDate'], batch, upsertMode ? 'ON CONFLICT ("enterpriseNumber") DO UPDATE SET "KBOstatusCode" = excluded."KBOstatusCode", "juridicalSituationCode" = excluded."juridicalSituationCode", "typeOfEnterpriseCode" = excluded."typeOfEnterpriseCode", "juridicalFormCode" = excluded."juridicalFormCode", "juridicalFormCACCode" = excluded."juridicalFormCACCode", "startDate" = excluded."startDate"' : undefined), 'Enterprise');
}