import { insertMany } from '../client';
import { determineEntityType, parseDate } from './helper';
import { nullable, readCsvBatches } from './csv';

type AddressRow = { EntityNumber: string; TypeOfAddress: string; CountryNL?: string; CountryFR?: string; Zipcode?: string; MunicipalityNL?: string; MunicipalityFR?: string; StreetNL?: string; StreetFR?: string; HouseNumber?: string; Box?: string; ExtraAddressInfo?: string; DateStrikingOff?: string };

export async function loadAddressCSV(filename: string, upsertMode: boolean): Promise<void> {
  await readCsvBatches<AddressRow, unknown[]>(filename, (row) => {
    if (row.TypeOfAddress !== 'REGO' && row.TypeOfAddress !== 'BAET') return;
    const kind = determineEntityType(row.EntityNumber);
    return [row.EntityNumber, row.TypeOfAddress, row.CountryNL || 'BE', row.CountryFR || 'BE', nullable(row.Zipcode), nullable(row.MunicipalityNL), nullable(row.MunicipalityFR), nullable(row.StreetNL), nullable(row.StreetFR), nullable(row.HouseNumber), nullable(row.Box), nullable(row.ExtraAddressInfo), parseDate(row.DateStrikingOff ?? null)?.toISOString() ?? null, kind === 'Enterprise' ? row.EntityNumber : null, kind === 'Establishment' ? row.EntityNumber : null];
  }, (batch) => insertMany('KBOAddress', ['entityNumber', 'typeOfAddressCode', 'countryNL', 'countryFR', 'zipcode', 'municipalityNL', 'municipalityFR', 'streetNL', 'streetFR', 'houseNumber', 'box', 'extraAddressInfo', 'dateStrikingOff', 'enterpriseId', 'establishmentId'], batch, upsertMode ? 'ON CONFLICT ("entityNumber", "typeOfAddressCode") DO UPDATE SET "countryNL" = excluded."countryNL", "countryFR" = excluded."countryFR", "zipcode" = excluded."zipcode", "municipalityNL" = excluded."municipalityNL", "municipalityFR" = excluded."municipalityFR", "streetNL" = excluded."streetNL", "streetFR" = excluded."streetFR", "houseNumber" = excluded."houseNumber", "box" = excluded."box", "extraAddressInfo" = excluded."extraAddressInfo", "dateStrikingOff" = excluded."dateStrikingOff", "enterpriseId" = excluded."enterpriseId", "establishmentId" = excluded."establishmentId"' : undefined), 'Address');
}