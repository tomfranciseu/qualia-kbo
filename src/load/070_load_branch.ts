import fs from 'fs';
import Papa from 'papaparse';
import { parseDate } from './helper';
import { createKboClient } from '../client';

type BranchInput = {
  id: string;
  startDate: Date;
  enterpriseNumber: string;
};

async function processBatch(branches: BranchInput[]): Promise<void> {
  const prisma = createKboClient();
  const batchSize = 50000;

  for (let i = 0; i < branches.length; i += batchSize) {
    const batch = branches.slice(i, i + batchSize);
    await prisma.branch.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Branches: Processed batch ${Math.floor(i / batchSize) + 1}`);
  }
}

export async function loadBranchCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  const branches: BranchInput[] = [];
  const csvFile = fs.createReadStream(filename);

  await new Promise<void>((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true,
      step: (results, parser) => {
        const row = results.data as {
          Id: string;
          StartDate: string;
          EnterpriseNumber: string;
        };

        const branch = {
          id: row.Id,
          startDate: parseDate(row.StartDate) ?? new Date(),
          enterpriseNumber: row.EnterpriseNumber,
        };

        if (upsertMode) {
          prisma.branch
            .upsert({
              where: { id: row.Id },
              update: branch,
              create: branch,
            })
            .catch((error) => {
              console.error('Error upserting branch:', error, row);
              parser.abort();
              reject(error);
            });
        } else {
          branches.push(branch);
        }
      },
      complete: () => {
        if (!upsertMode && branches.length > 0) {
          processBatch(branches)
            .then(() => {
              console.log('Branch CSV file successfully processed');
              resolve();
            })
            .catch((error) => {
              console.error('Error during branch bulk insertion:', error);
              reject(error);
            });
        } else {
          console.log('Branch CSV file successfully processed');
          resolve();
        }
      },
      error: (error) => {
        console.error('Error parsing branch CSV:', error);
        reject(error);
      },
    });
  });
}
