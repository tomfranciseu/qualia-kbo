import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKboClient, disconnectKboClient } from '../client';
import { getTableLoadStatuses } from './completeness';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

try {
  const db = await createKboClient();
  const statuses = await getTableLoadStatuses(db, dataDir);
  let hasMismatch = false;

  console.log(`${'Table'.padEnd(16)}${'Expected'.padStart(14)}${'Loaded'.padStart(14)}${'Difference'.padStart(14)}  Status`);
  for (const status of statuses) {
    const difference = status.loaded - status.expected;
    const label = difference === 0 ? 'MATCH' : 'MISMATCH';
    hasMismatch ||= difference !== 0;
    console.log(`${status.table.padEnd(16)}${status.expected.toLocaleString().padStart(14)}${status.loaded.toLocaleString().padStart(14)}${difference.toLocaleString().padStart(14)}  ${label}`);
  }

  if (hasMismatch) process.exitCode = 1;
} finally {
  await disconnectKboClient();
}
