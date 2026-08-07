import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { disconnectKboClient } from '../client';
import { loadActivityCSV } from './080_load_activity';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const upsertMode = process.argv.includes('--upsert');
const filename = process.argv.find((arg) => arg.endsWith('.csv')) ?? path.join(dataDir, 'activity.csv');

try {
  await loadActivityCSV(filename, upsertMode);
  console.log('Activity load complete.');
} finally {
  await disconnectKboClient();
}
