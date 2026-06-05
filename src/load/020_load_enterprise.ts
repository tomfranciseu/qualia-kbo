import fs from 'fs';
import Papa from 'papaparse';
import { parseDate } from './helper';
import { createKboClient } from '../client';
import type { Enterprise } from '../generated/prisma/client';

interface EnterpriseInput {
  EnterpriseNumber: string;
  Status: string;
  JuridicalSituation: string;
  TypeOfEnterprise: string;
  JuridicalForm?: string;
  JuridicalFormCAC?: string;
  StartDate: string;
}

export async function loadEnterpriseCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  const enterprises: Enterprise[] = [];
  const csvFile = fs.createReadStream(filename);

  const parsePromise = new Promise<void>((resolve, reject) => {
    Papa.parse<EnterpriseInput>(csvFile, {
      header: true,
      step(results, parser) {
        const row = results.data;
        const rowUpdate: Enterprise = {
          enterpriseNumber: row.EnterpriseNumber,
          KBOstatusCode: row.Status,
          juridicalSituationCode: row.JuridicalSituation,
          typeOfEnterpriseCode: row.TypeOfEnterprise,
          juridicalFormCode: row.JuridicalForm !== undefined && row.JuridicalForm !== '' ? row.JuridicalForm : null,
          juridicalFormCACCode: row.JuridicalFormCAC !== undefined && row.JuridicalFormCAC !== '' ? row.JuridicalFormCAC : null,
          startDate: parseDate(row.StartDate) ?? new Date(),
        };

        if (upsertMode) {
          prisma.enterprise
            .upsert({
              where: { enterpriseNumber: rowUpdate.enterpriseNumber },
              update: rowUpdate,
              create: rowUpdate,
            })
            .catch((error) => {
              console.error('Error upserting data:', error, row);
              parser.abort();
              reject(error);
            });
        } else {
          enterprises.push(rowUpdate);
        }
      },
      complete: () => {
        if (!upsertMode && enterprises.length > 0) {
          processBatch(enterprises)
            .then(() => {
              console.log('Enterprise CSV file successfully processed');
              resolve();
            })
            .catch((error) => {
              console.error('Error during bulk insertion:', error);
              reject(error);
            });
        } else {
          console.log('Enterprise CSV file successfully processed in upsert mode');
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

async function processBatch(enterprises: Enterprise[]): Promise<void> {
  const prisma = createKboClient();
  const batchSize = 50000;
  for (let i = 0; i < enterprises.length; i += batchSize) {
    const batch = enterprises.slice(i, i + batchSize);
    await prisma.enterprise.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Entreprises: Processed batch ${Math.floor(i / batchSize) + 1}`);
  }
}
