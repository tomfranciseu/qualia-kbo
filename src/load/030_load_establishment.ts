import * as fs from 'fs';
import * as Papa from 'papaparse';
import { parseDate } from './helper';
import { createKboClient } from '../client';
import type { Establishment } from '../generated/prisma/client';

export async function loadEstablismentCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  const establishments: Establishment[] = [];
  const csvFile = fs.createReadStream(filename);

  const parsePromise = new Promise<void>((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true,
      step: (results, parser) => {
        const row = results.data as {
          EstablishmentNumber: string;
          StartDate: string;
          EnterpriseNumber: string;
        };

        if (upsertMode) {
          prisma.establishment
            .upsert({
              where: { establishmentNumber: row.EstablishmentNumber },
              update: {
                startDate: parseDate(row.StartDate),
                enterpriseNumber: row.EnterpriseNumber,
              },
              create: {
                establishmentNumber: row.EstablishmentNumber,
                startDate: parseDate(row.StartDate) ?? new Date(),
                enterpriseNumber: row.EnterpriseNumber,
              },
            })
            .catch((error) => {
              console.error('Error upserting data:', error, row);
              parser.abort();
              reject(error);
            });
        } else {
          establishments.push({
            establishmentNumber: row.EstablishmentNumber,
            startDate: parseDate(row.StartDate) ?? new Date(),
            enterpriseNumber: row.EnterpriseNumber,
          });
        }
      },
      complete: () => {
        if (!upsertMode && establishments.length > 0) {
          processBatch(establishments)
            .then(() => {
              console.log('establishments CSV file successfully processed');
              resolve();
            })
            .catch((error) => {
              console.error('Error during bulk insertion:', error);
              reject(error);
            });
        } else {
          console.log('establishments CSV file successfully processed');
          resolve();
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        reject(error);
      },
    });
  });

  await parsePromise;
}

async function processBatch(establishments: Establishment[]): Promise<void> {
  const prisma = createKboClient();
  const batchSize = 50000;
  for (let i = 0; i < establishments.length; i += batchSize) {
    const batch = establishments.slice(i, i + batchSize);
    await prisma.establishment.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Establishments: Processed batch ${Math.floor(i / batchSize) + 1}`);
  }
}
