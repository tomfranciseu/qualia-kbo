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

/** Keep batches small — activity.csv is ~1.5GB and large in-flight buffers OOMs Node. */
const BATCH_SIZE = 10_000;

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
  let buffer: ActivityInput[] = [];
  let batchNumber = 0;
  /** Single-flight insert gate — never pile up a long promise chain of retained batches. */
  let gate = Promise.resolve();

  const flush = (parser: Papa.Parser): void => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    batchNumber += 1;
    const current = batchNumber;
    const label =
      batch[0]?.enterpriseId != null
        ? 'enterpriseId'
        : batch[0]?.establishmentId != null
          ? 'establishmentId'
          : 'unlinked';

    parser.pause();
    gate = gate
      .then(() => insertBatch(batch, label, current))
      .then(() => {
        parser.resume();
      })
      .catch((error) => {
        parser.abort();
        throw error;
      });
  };

  await new Promise<void>((resolve, reject) => {
    Papa.parse(fs.createReadStream(filename, { highWaterMark: 1024 * 64 }), {
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
          parser.pause();
          gate = gate
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
            .then(() => parser.resume())
            .catch((error) => {
              console.error('Error upserting activity:', error, row);
              parser.abort();
              throw error;
            });
          return;
        }

        buffer.push(rowToActivityInput(row));
        if (buffer.length >= BATCH_SIZE) {
          flush(parser);
        }
      },
      complete: () => {
        gate
          .then(async () => {
            if (!upsertMode && buffer.length > 0) {
              batchNumber += 1;
              const label =
                buffer[0]?.enterpriseId != null
                  ? 'enterpriseId'
                  : buffer[0]?.establishmentId != null
                    ? 'establishmentId'
                    : 'unlinked';
              await insertBatch(buffer, label, batchNumber);
              buffer = [];
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
