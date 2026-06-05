import * as fs from 'fs';
import * as Papa from 'papaparse';
import { determineEntityType } from './helper.js';
import { createKboClient } from '../client.js';

type DenominationInput = {
  entityNumber: string;
  languageCode: string;
  typeOfDenominationCode: string;
  denomination: string;
  enterpriseId?: string;
  establishmentId?: string;
};

async function processBatches(
  denominations: DenominationInput[],
  idField: 'enterpriseId' | 'establishmentId'
): Promise<void> {
  const prisma = createKboClient();
  const batchSize = 50000;
  for (let i = 0; i < denominations.length; i += batchSize) {
    const batch = denominations.slice(i, i + batchSize);
    await prisma.denomination.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Denominations: ${idField} - Processed batch ${Math.floor(i / batchSize) + 1}`);
  }
}

export async function loadDenominationCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  const denominations: DenominationInput[] = [];
  const estDenominations: DenominationInput[] = [];
  const csvFile = fs.createReadStream(filename);

  await new Promise<void>((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true,
      step: (results, parser) => {
        const row = results.data as {
          EntityNumber: string;
          Language: string;
          TypeOfDenomination: string;
          Denomination: string;
        };

        const entityType = determineEntityType(row.EntityNumber);
        if (entityType === 'Enterprise') {
          if (upsertMode) {
            prisma.denomination
              .upsert({
                where: {
                  entityNumber_language_typeOfDenomination: {
                    entityNumber: row.EntityNumber,
                    languageCode: row.Language,
                    typeOfDenominationCode: row.TypeOfDenomination,
                  },
                },
                update: { denomination: row.Denomination, enterpriseId: row.EntityNumber },
                create: {
                  entityNumber: row.EntityNumber,
                  languageCode: row.Language,
                  typeOfDenominationCode: row.TypeOfDenomination,
                  denomination: row.Denomination,
                  enterpriseId: row.EntityNumber,
                },
              })
              .catch((error) => {
                console.error('Error upserting data:', error, row);
                parser.abort();
                reject(error);
              });
          } else {
            denominations.push({
              entityNumber: row.EntityNumber,
              languageCode: row.Language,
              typeOfDenominationCode: row.TypeOfDenomination,
              denomination: row.Denomination,
              enterpriseId: row.EntityNumber,
            });
          }
        } else if (upsertMode) {
          prisma.denomination
            .upsert({
              where: {
                entityNumber_language_typeOfDenomination: {
                  entityNumber: row.EntityNumber,
                  languageCode: row.Language,
                  typeOfDenominationCode: row.TypeOfDenomination,
                },
              },
              update: { denomination: row.Denomination, establishmentId: row.EntityNumber },
              create: {
                entityNumber: row.EntityNumber,
                languageCode: row.Language,
                typeOfDenominationCode: row.TypeOfDenomination,
                denomination: row.Denomination,
                establishmentId: row.EntityNumber,
              },
            })
            .catch((error) => {
              console.error('Error upserting data:', error, row);
              parser.abort();
              reject(error);
            });
        } else {
          estDenominations.push({
            entityNumber: row.EntityNumber,
            languageCode: row.Language,
            typeOfDenominationCode: row.TypeOfDenomination,
            denomination: row.Denomination,
            establishmentId: row.EntityNumber,
          });
        }
      },
      complete: () => {
        if (!upsertMode && denominations.length > 0 && estDenominations.length > 0) {
          Promise.all([
            processBatches(denominations, 'enterpriseId'),
            processBatches(estDenominations, 'establishmentId'),
          ])
            .then(() => {
              console.log('Denomination CSV file successfully processed');
              resolve();
            })
            .catch((error) => {
              console.error('Error during bulk insertion:', error);
              reject(error);
            });
        } else {
          console.log('All Denominations have been processed successfully.');
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
