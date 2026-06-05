import fs from 'fs';
import Papa from 'papaparse';
import { determineEntityType, parseDate } from './helper.js';
import { createKboClient } from '../client.js';

interface AddressRow {
  EntityNumber: string;
  TypeOfAddress: string;
  CountryNL?: string;
  CountryFR?: string;
  Zipcode?: string;
  MunicipalityNL?: string;
  MunicipalityFR?: string;
  StreetNL?: string;
  StreetFR?: string;
  HouseNumber?: string;
  Box?: string;
  ExtraAddressInfo?: string;
  DateStrikingOff?: string;
}

interface PrismaAddressRow {
  entityNumber: string;
  typeOfAddressCode: string;
  countryNL?: string;
  countryFR?: string;
  zipcode?: string;
  municipalityNL?: string;
  municipalityFR?: string;
  streetNL?: string;
  streetFR?: string;
  houseNumber?: string;
  box?: string;
  extraAddressInfo?: string;
  dateStrikingOff?: Date;
  enterpriseId?: string;
  establishmentId?: string;
}

async function processBatches(
  addresses: PrismaAddressRow[],
  idField: 'enterpriseId' | 'establishmentId'
): Promise<void> {
  const prisma = createKboClient();
  const batchSize = 10000;
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.kBOAddress.createMany({
          data: batch,
          skipDuplicates: true,
        });
      });
      console.log(`Addresses: ${idField} - Processed batch ${Math.floor(i / batchSize) + 1}`);
    } catch (error) {
      console.error('Batch insert failed, inserting one by one:', error);
      for (const item of batch) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.kBOAddress.create({ data: item });
          });
        } catch (itemError) {
          console.error('Error inserting item:', item, itemError);
        }
      }
    }
  }
  console.log('All batches processed successfully.');
}

export async function loadAddressCSV(filename: string, upsertMode: boolean): Promise<void> {
  const enterprises: PrismaAddressRow[] = [];
  const establishments: PrismaAddressRow[] = [];
  const csvFile = fs.createReadStream(filename);

  await new Promise<void>((resolve, reject) => {
    Papa.parse<AddressRow>(csvFile, {
      header: true,
      step: (results) => {
        const row = results.data;
        if (!row.CountryNL) row.CountryNL = 'BE';
        if (!row.CountryFR) row.CountryFR = 'BE';

        const entityType = determineEntityType(row.EntityNumber);
        const addressData: PrismaAddressRow = {
          entityNumber: row.EntityNumber,
          typeOfAddressCode: row.TypeOfAddress,
          enterpriseId: entityType === 'Enterprise' ? row.EntityNumber : undefined,
          establishmentId: entityType === 'Establishment' ? row.EntityNumber : undefined,
          countryNL: row.CountryNL,
          countryFR: row.CountryFR,
          zipcode: row.Zipcode,
          municipalityNL: row.MunicipalityNL,
          municipalityFR: row.MunicipalityFR,
          streetNL: row.StreetNL,
          streetFR: row.StreetFR,
          houseNumber: row.HouseNumber,
          box: row.Box,
          extraAddressInfo: row.ExtraAddressInfo,
          dateStrikingOff: parseDate(row.DateStrikingOff ?? null),
        };

        if (row.TypeOfAddress === 'REGO') {
          enterprises.push(addressData);
        } else if (row.TypeOfAddress === 'BAET') {
          establishments.push(addressData);
        } else {
          console.error('Unknown address type:', row.EntityNumber, row.TypeOfAddress);
        }
      },
      complete: () => {
        if (!upsertMode && enterprises.length > 0 && establishments.length > 0) {
          Promise.all([
            processBatches(enterprises, 'enterpriseId'),
            processBatches(establishments, 'establishmentId'),
          ])
            .then(() => {
              console.log('addresses CSV file successfully processed');
              resolve();
            })
            .catch((error) => {
              console.error('Error during bulk insertion:', error);
              reject(error);
            });
        } else {
          console.log('Upsert mode is not supported in this script.');
          resolve();
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        reject(error);
      },
    });
  });
}
