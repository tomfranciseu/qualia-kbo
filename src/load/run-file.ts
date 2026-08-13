import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disconnectKboClient } from '../client';
import { loadCSV_code } from './010_load_code';
import { loadEnterpriseCSV } from './020_load_enterprise';
import { loadEstablismentCSV } from './030_load_establishment';
import { loadAddressCSV } from './040_load_address';
import { loadContactsCSV } from './050_load_contacts';
import { loadDenominationCSV } from './060_load_denomination';
import { loadBranchCSV } from './070_load_branch';
import { loadActivityCSV } from './080_load_activity';
import { loadMetaCSV } from './090_load_meta';
import { loadDeleteAll } from './000_delete_all';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const target = process.argv[2];
const upsertMode = process.argv.includes('--upsert');
const loaders: Record<string, () => Promise<void>> = {
  delete: loadDeleteAll,
  code: () => loadCSV_code(path.join(dataDir, 'code.csv')),
  enterprise: () => loadEnterpriseCSV(path.join(dataDir, 'enterprise.csv'), upsertMode),
  establishment: () => loadEstablismentCSV(path.join(dataDir, 'establishment.csv'), upsertMode),
  address: () => loadAddressCSV(path.join(dataDir, 'address.csv'), upsertMode),
  contact: () => loadContactsCSV(path.join(dataDir, 'contact.csv'), upsertMode),
  denomination: () => loadDenominationCSV(path.join(dataDir, 'denomination.csv'), upsertMode),
  branch: () => loadBranchCSV(path.join(dataDir, 'branch.csv'), upsertMode),
  activity: () => loadActivityCSV(path.join(dataDir, 'activity.csv'), upsertMode),
  meta: () => loadMetaCSV(path.join(dataDir, 'meta.csv')),
};

try {
  const loader = target ? loaders[target] : undefined;
  if (!loader) throw new Error(`Unknown KBO CSV loader: ${target ?? '(none)'}`);
  await loader();
} finally {
  await disconnectKboClient();
}