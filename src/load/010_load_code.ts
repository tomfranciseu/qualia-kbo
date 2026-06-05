import * as fs from 'fs';
import * as Papa from 'papaparse';
import { createKboClient } from '../client';

type CodeRow = { Category: string; Code: string; Language: string; Description: string };

async function processRow(row: CodeRow): Promise<void> {
  if (row.Language !== 'NL') return;
  const prisma = createKboClient();

  switch (row.Category) {
    case 'ContactType':
      await prisma.contactType.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'EntityContact':
      await prisma.entityContact.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'JuridicalForm':
      await prisma.juridicalForm.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'JuridicalSituation':
      await prisma.juridicalSituation.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'Language':
      await prisma.language.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'Status':
      await prisma.kBOStatus.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'TypeOfAddress':
      await prisma.typeOfAddress.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'TypeOfDenomination':
      await prisma.typeOfDenomination.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    case 'TypeOfEnterprise':
      await prisma.typeOfEnterprise.upsert({
        where: { code: row.Code },
        update: { description: row.Description },
        create: { code: row.Code, description: row.Description },
      });
      break;
    default:
      break;
  }
}

async function handleRows(rows: CodeRow[]): Promise<void> {
  for (const row of rows) {
    if (row.Language !== 'NL') continue;
    await processRow(row);
  }
}

export function loadCSV_code(filename: string): Promise<void> {
  const csvFile = fs.createReadStream(filename);

  return new Promise<void>((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true,
      complete: (results) => {
        handleRows(results.data as CodeRow[])
          .then(() => {
            console.log('CSV file successfully processed');
            resolve();
          })
          .catch((error) => {
            console.error('Error processing CSV:', error);
            reject(error);
          });
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        reject(error);
      },
    });
  });
}
