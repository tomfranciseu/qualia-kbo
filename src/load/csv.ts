import fs from 'node:fs';
import { createInterface } from 'node:readline';
import Papa from 'papaparse';

const DEFAULT_BATCH_SIZE = 100_000;

export async function countCsvDataRows(filename: string, label: string): Promise<number> {
  console.log(`${label}: counting CSV rows…`);
  let lineCount = 0;
  const lines = createInterface({
    input: fs.createReadStream(filename, { highWaterMark: 1024 * 1024 }),
    crlfDelay: Infinity,
  });

  for await (const _ of lines) lineCount += 1;

  const dataRows = Math.max(0, lineCount - 1);
  console.log(`${label}: ${dataRows.toLocaleString()} data rows found.`);
  return dataRows;
}

export async function readCsvBatches<TInput, TOutput>(filename: string, transform: (row: TInput) => TOutput | undefined, save: (batch: TOutput[]) => Promise<void>, label: string, batchSize = DEFAULT_BATCH_SIZE): Promise<void> {
  const totalRows = await countCsvDataRows(filename, label);
  let buffer: TOutput[] = [];
  let inputRows = 0;
  let savedRows = 0;
  let batches = 0;
  let failed = false;

  const saveBatch = async (batch: TOutput[]) => {
    await save(batch);
    batches += 1;
    savedRows += batch.length;
    const progress = totalRows === 0 ? 100 : Math.min(100, (inputRows / totalRows) * 100);
    console.log(`${label}: ${progress.toFixed(1)}% — processed batch ${batches} (${savedRows} saved rows from ${inputRows} input rows)`);
  };

  await new Promise<void>((resolve, reject) => Papa.parse<TInput>(fs.createReadStream(filename, { highWaterMark: 64 * 1024 }), {
    header: true,
    skipEmptyLines: true,
    step: (result, parser) => {
      inputRows += 1;
      const value = transform(result.data);
      if (value !== undefined) buffer.push(value);
      if (buffer.length < batchSize) return;

      const batch = buffer;
      buffer = [];
      parser.pause();
      void saveBatch(batch).then(() => parser.resume()).catch((error) => {
        failed = true;
        parser.abort();
        reject(error);
      });
    },
    complete: () => {
      if (failed) return;
      void (async () => {
        if (buffer.length) await saveBatch(buffer);
        console.log(`${label}: 100.0% — CSV file successfully processed (${savedRows} saved rows from ${inputRows} input rows)`);
        resolve();
      })().catch(reject);
    },
    error: reject,
  }));
}

export function nullable(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}