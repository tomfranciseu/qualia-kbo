import fs from 'fs';
import Papa from 'papaparse';
import { Prisma } from '../generated/prisma/client';
import { determineEntityType } from './helper';
import { createKboClient } from '../client';

type DenominationInput = {
  entityNumber: string;
  languageCode: string;
  typeOfDenominationCode: string;
  denomination: string;
  enterpriseId?: string;
  establishmentId?: string;
};

const BATCH_SIZE = 50_000;

async function insertBatch(batch: DenominationInput[], label: string, batchNumber: number): Promise<void> {
  const prisma = createKboClient();
  try {
    await prisma.denomination.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Denominations: ${label} - Processed batch ${batchNumber}`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      let inserted = 0;
      for (const item of batch) {
        try {
          await prisma.denomination.create({ data: item });
          inserted += 1;
        } catch {
          const { enterpriseId: _e, establishmentId: _s, ...unlinked } = item;
          try {
            await prisma.denomination.create({ data: unlinked });
            inserted += 1;
          } catch {
            // Skip rows that reference missing parent entities.
          }
        }
      }
      console.log(`Denominations: ${label} - Processed batch ${batchNumber} (${inserted}/${batch.length} rows)`);
      return;
    }
    throw error;
  }
}

function rowToInput(row: {
  EntityNumber: string;
  Language: string;
  TypeOfDenomination: string;
  Denomination: string;
}): DenominationInput {
  const base = {
    entityNumber: row.EntityNumber,
    languageCode: row.Language,
    typeOfDenominationCode: row.TypeOfDenomination,
    denomination: row.Denomination,
  };

  switch (determineEntityType(row.EntityNumber)) {
    case 'Enterprise':
      return { ...base, enterpriseId: row.EntityNumber };
    case 'Establishment':
      return { ...base, establishmentId: row.EntityNumber };
    default:
      return base;
  }
}

export async function loadDenominationCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  let enterpriseBuffer: DenominationInput[] = [];
  let establishmentBuffer: DenominationInput[] = [];
  let unlinkedBuffer: DenominationInput[] = [];
  let enterpriseBatchNumber = 0;
  let establishmentBatchNumber = 0;
  let unlinkedBatchNumber = 0;
  let flushChain = Promise.resolve();

  const flushBuffer = (
    parser: Papa.Parser,
    getBuffer: () => DenominationInput[],
    clearBuffer: () => void,
    label: string,
    incrementBatch: () => number,
  ): void => {
    const batch = getBuffer();
    if (batch.length === 0) return;
    clearBuffer();
    const batchNumber = incrementBatch();
    parser.pause();
    flushChain = flushChain
      .then(() => insertBatch(batch, label, batchNumber))
      .then(() => parser.resume())
      .catch((error) => {
        parser.abort();
        throw error;
      });
  };

  await new Promise<void>((resolve, reject) => {
    Papa.parse(fs.createReadStream(filename), {
      header: true,
      step: (results, parser) => {
        const row = results.data as {
          EntityNumber: string;
          Language: string;
          TypeOfDenomination: string;
          Denomination: string;
        };

        if (upsertMode) {
          const input = rowToInput(row);
          flushChain = flushChain
            .then(async () => {
              await prisma.denomination.upsert({
                where: {
                  entityNumber_language_typeOfDenomination: {
                    entityNumber: row.EntityNumber,
                    languageCode: row.Language,
                    typeOfDenominationCode: row.TypeOfDenomination,
                  },
                },
                update: {
                  denomination: row.Denomination,
                  enterpriseId: input.enterpriseId ?? null,
                  establishmentId: input.establishmentId ?? null,
                },
                create: input,
              });
            })
            .catch((error) => {
              console.error('Error upserting data:', error, row);
              parser.abort();
              throw error;
            });
          return;
        }

        const input = rowToInput(row);
        if (input.enterpriseId) {
          enterpriseBuffer.push(input);
          if (enterpriseBuffer.length >= BATCH_SIZE) {
            flushBuffer(
              parser,
              () => enterpriseBuffer,
              () => {
                enterpriseBuffer = [];
              },
              'enterpriseId',
              () => {
                enterpriseBatchNumber += 1;
                return enterpriseBatchNumber;
              },
            );
          }
        } else if (input.establishmentId) {
          establishmentBuffer.push(input);
          if (establishmentBuffer.length >= BATCH_SIZE) {
            flushBuffer(
              parser,
              () => establishmentBuffer,
              () => {
                establishmentBuffer = [];
              },
              'establishmentId',
              () => {
                establishmentBatchNumber += 1;
                return establishmentBatchNumber;
              },
            );
          }
        } else {
          unlinkedBuffer.push(input);
          if (unlinkedBuffer.length >= BATCH_SIZE) {
            flushBuffer(
              parser,
              () => unlinkedBuffer,
              () => {
                unlinkedBuffer = [];
              },
              'unlinked',
              () => {
                unlinkedBatchNumber += 1;
                return unlinkedBatchNumber;
              },
            );
          }
        }
      },
      complete: () => {
        flushChain
          .then(async () => {
            if (!upsertMode) {
              const tasks = [];
              if (enterpriseBuffer.length > 0) {
                enterpriseBatchNumber += 1;
                tasks.push(insertBatch(enterpriseBuffer, 'enterpriseId', enterpriseBatchNumber));
                enterpriseBuffer = [];
              }
              if (establishmentBuffer.length > 0) {
                establishmentBatchNumber += 1;
                tasks.push(insertBatch(establishmentBuffer, 'establishmentId', establishmentBatchNumber));
                establishmentBuffer = [];
              }
              if (unlinkedBuffer.length > 0) {
                unlinkedBatchNumber += 1;
                tasks.push(insertBatch(unlinkedBuffer, 'unlinked', unlinkedBatchNumber));
                unlinkedBuffer = [];
              }
              await Promise.all(tasks);
            }
            console.log('Denomination CSV file successfully processed');
            resolve();
          })
          .catch((error) => {
            console.error('Error during bulk insertion:', error);
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
