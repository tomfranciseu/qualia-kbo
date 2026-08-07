import fs from 'fs';
import Papa from 'papaparse';
import { Prisma } from '../generated/prisma/client';
import { determineEntityType } from './helper';
import { createKboClient } from '../client';

type ActivityInput = {
  entityNumber: string;
  activityGroupCode: string;
  naceVersion: string;
  naceCode: string;
  classification: string;
  enterpriseId?: string;
  establishmentId?: string;
};

const BATCH_SIZE = 50_000;

async function insertBatch(batch: ActivityInput[], label: string, batchNumber: number): Promise<void> {
  const prisma = createKboClient();
  try {
    await prisma.activity.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`Activities: ${label} - Processed batch ${batchNumber} (${batch.length} rows)`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      let inserted = 0;
      for (const item of batch) {
        try {
          await prisma.activity.create({ data: item });
          inserted += 1;
        } catch {
          const { enterpriseId: _e, establishmentId: _s, ...unlinked } = item;
          try {
            await prisma.activity.create({ data: unlinked });
            inserted += 1;
          } catch {
            // Skip rows that still fail (missing parents / duplicates).
          }
        }
      }
      console.log(`Activities: ${label} - Processed batch ${batchNumber} (${inserted}/${batch.length} rows)`);
      return;
    }
    throw error;
  }
}

export function rowToActivityInput(row: {
  EntityNumber: string;
  ActivityGroup: string;
  NaceVersion: string;
  NaceCode: string;
  Classification: string;
}): ActivityInput {
  const base = {
    entityNumber: row.EntityNumber,
    activityGroupCode: row.ActivityGroup,
    naceVersion: row.NaceVersion,
    naceCode: row.NaceCode,
    classification: row.Classification,
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

export async function loadActivityCSV(filename: string, upsertMode: boolean): Promise<void> {
  const prisma = createKboClient();
  let enterpriseBuffer: ActivityInput[] = [];
  let establishmentBuffer: ActivityInput[] = [];
  let unlinkedBuffer: ActivityInput[] = [];
  let enterpriseBatchNumber = 0;
  let establishmentBatchNumber = 0;
  let unlinkedBatchNumber = 0;
  let flushChain = Promise.resolve();

  const flushBuffer = (
    parser: Papa.Parser,
    getBuffer: () => ActivityInput[],
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
          ActivityGroup: string;
          NaceVersion: string;
          NaceCode: string;
          Classification: string;
        };

        if (!row.EntityNumber || !row.NaceCode) return;

        if (upsertMode) {
          const input = rowToActivityInput(row);
          flushChain = flushChain
            .then(() =>
              prisma.activity.upsert({
                where: {
                  activity_entity_group_version_code_class: {
                    entityNumber: row.EntityNumber,
                    activityGroupCode: row.ActivityGroup,
                    naceVersion: row.NaceVersion,
                    naceCode: row.NaceCode,
                    classification: row.Classification,
                  },
                },
                update: {
                  enterpriseId: input.enterpriseId ?? null,
                  establishmentId: input.establishmentId ?? null,
                },
                create: input,
              }),
            )
            .catch((error) => {
              console.error('Error upserting activity:', error, row);
              parser.abort();
              throw error;
            });
          return;
        }

        const input = rowToActivityInput(row);
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
            console.log('Activity CSV file successfully processed');
            resolve();
          })
          .catch((error) => {
            console.error('Error during activity bulk insertion:', error);
            reject(error);
          });
      },
      error: (error) => {
        console.error('Error parsing activity CSV:', error);
        reject(error);
      },
    });
  });
}
