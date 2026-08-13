import { insertMany } from '../client';
import { determineEntityType } from './helper';
import { readCsvBatches } from './csv';

type DenominationRow = { EntityNumber: string; Language: string; TypeOfDenomination: string; Denomination: string };

export async function loadDenominationCSV(filename: string, upsertMode: boolean): Promise<void> {
  await readCsvBatches<DenominationRow, unknown[]>(filename, (row) => {
    const kind = determineEntityType(row.EntityNumber);
    return [row.EntityNumber, row.Language, row.TypeOfDenomination, row.Denomination, kind === 'Enterprise' ? row.EntityNumber : null, kind === 'Establishment' ? row.EntityNumber : null];
  }, (batch) => insertMany('Denomination', ['entityNumber', 'languageCode', 'typeOfDenominationCode', 'denomination', 'enterpriseId', 'establishmentId'], batch, upsertMode ? 'ON CONFLICT ("entityNumber", "languageCode", "typeOfDenominationCode") DO UPDATE SET "denomination" = excluded."denomination", "enterpriseId" = excluded."enterpriseId", "establishmentId" = excluded."establishmentId"' : undefined), 'Denomination');
}