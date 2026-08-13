import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disconnectKboClient } from '../client';
import { loadCSV_code } from './010_load_code';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

try {
  await loadCSV_code(path.join(dataDir, 'code.csv'));
} finally {
  await disconnectKboClient();
}