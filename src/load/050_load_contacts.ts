import { insertMany } from '../client';
import { readCsvBatches } from './csv';

type ContactRow = { EntityNumber: string; EntityContact: string; ContactType: string; Value: string };

export async function loadContactsCSV(filename: string, upsertMode: boolean): Promise<void> {
  await readCsvBatches<ContactRow, unknown[]>(filename, (row) => row.EntityContact === 'ENT' || row.EntityContact === 'EST' ? [row.EntityNumber, row.EntityContact, row.ContactType, row.Value, row.EntityContact === 'ENT' ? row.EntityNumber : null, row.EntityContact === 'EST' ? row.EntityNumber : null] : undefined, (batch) => insertMany('KBOContact', ['entityNumber', 'entityContactCode', 'conctactTypeCode', 'value', 'enterpriseId', 'establishmentId'], batch, upsertMode ? 'ON CONFLICT ("entityNumber", "entityContactCode", "conctactTypeCode") DO UPDATE SET "value" = excluded."value", "enterpriseId" = excluded."enterpriseId", "establishmentId" = excluded."establishmentId"' : undefined), 'Contact');
}