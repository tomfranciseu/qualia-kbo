import fs from 'fs';
import Papa from 'papaparse';
import { determineEntityType } from './helper';
import { createKboClient } from '../client';

type KBOContactInput = {
  entityNumber: string;
  entityContactCode: string;
  conctactTypeCode: string;
  value: string;
  enterpriseId?: string;
  establishmentId?: string;
};

async function ensureContactTypes(codes: Iterable<string>): Promise<void> {
  const prisma = createKboClient();
  for (const code of codes) {
    await prisma.contactType.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }
}

export async function loadContactsCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  const contacts: KBOContactInput[] = [];
  const estContacts: KBOContactInput[] = [];
  const csvFile = fs.createReadStream(filename);

  await new Promise<void>((resolve, reject) => {
    Papa.parse(csvFile, {
      header: true,
      step: (results) => {
        const row = results.data as {
          EntityNumber: string;
          EntityContact: string;
          ContactType: string;
          Value: string;
        };

        if (upsertMode) {
          prisma.kBOContact
            .upsert({
              where: {
                entitynumber_contacttype_contact: {
                  entityNumber: row.EntityNumber,
                  entityContactCode: row.EntityContact,
                  conctactTypeCode: row.ContactType,
                },
              },
              update: { value: row.Value },
              create: {
                entityNumber: row.EntityNumber,
                entityContactCode: row.EntityContact,
                conctactTypeCode: row.ContactType,
                value: row.Value,
              },
            })
            .catch((error) => {
              console.error('Error upserting data:', error, row);
              reject(error);
            });
        } else {
          const entityType = determineEntityType(row.EntityNumber);
          if (entityType === 'Enterprise') {
            contacts.push({
              entityNumber: row.EntityNumber,
              entityContactCode: row.EntityContact,
              conctactTypeCode: row.ContactType,
              value: row.Value,
              enterpriseId: row.EntityNumber,
            });
          } else if (entityType === 'Establishment') {
            estContacts.push({
              entityNumber: row.EntityNumber,
              entityContactCode: row.EntityContact,
              conctactTypeCode: row.ContactType,
              value: row.Value,
              establishmentId: row.EntityNumber,
            });
          } else {
            console.error('Unknown entity type', row);
          }
        }
      },
      complete: async () => {
        if (!upsertMode) {
          await processBatch(contacts, 'enterpriseId');
          await processBatch(estContacts, 'establishmentId');
        }
        console.log('All contacts CSV files successfully processed');
        resolve();
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        reject(error);
      },
    });
  });
}

async function processBatch(
  contacts: KBOContactInput[],
  idField: 'enterpriseId' | 'establishmentId'
): Promise<void> {
  const prisma = createKboClient();
  const batchSize = 100000;
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    await ensureContactTypes(new Set(batch.map((contact) => contact.conctactTypeCode)));
    await prisma.kBOContact.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Contacts: ${idField} - Processed batch ${Math.floor(i / batchSize) + 1}`);
  }
}
