import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKboClient, disconnectKboClient } from '../client';
import { loadCSV_code } from './010_load_code';
import { loadEnterpriseCSV } from './020_load_enterprise';
import { loadEstablismentCSV } from './030_load_establishment';
import { loadAddressCSV } from './040_load_address';
import { loadContactsCSV } from './050_load_contacts';
import { loadDenominationCSV } from './060_load_denomination';
import { loadBranchCSV } from './070_load_branch';
import { loadActivityCSV } from './080_load_activity';
import { loadMetaCSV } from './090_load_meta';
import { getTableLoadStatuses } from './completeness';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const upsertMode = process.argv.includes('--upsert');

const loaders: Record<string, () => Promise<void>> = {
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
  const db = await createKboClient();
  const statuses = await getTableLoadStatuses(db, dataDir);

  console.log(`${'Table'.padEnd(16)}${'Expected'.padStart(14)}${'Loaded'.padStart(14)}  Action`);
  const missing = statuses.filter((status) => status.incomplete);
  for (const status of statuses) {
    const action = status.incomplete ? 'LOAD' : 'skip';
    console.log(`${status.table.padEnd(16)}${status.expected.toLocaleString().padStart(14)}${status.loaded.toLocaleString().padStart(14)}  ${action}`);
  }

  if (missing.length === 0) {
    console.log('All KBO tables are fully loaded.');
  } else {
    console.log(`Loading ${missing.length} incomplete table(s)…`);
    for (const status of missing) {
      const loader = loaders[status.loader];
      if (!loader) throw new Error(`No loader registered for ${status.loader}`);
      console.log(`→ ${status.table} (${status.loaded.toLocaleString()} / ${status.expected.toLocaleString()})`);
      await loader();
    }
    console.log('KBO missing-table load complete.');
  }
} finally {
  await disconnectKboClient();
}
