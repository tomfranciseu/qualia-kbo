import path from 'path';
import { fileURLToPath } from 'url';
import { disconnectKboClient } from '../client';
import { loadDeleteAll } from './000_delete_all';
import { loadCSV_code } from './010_load_code';
import { loadEnterpriseCSV } from './020_load_enterprise';
import { loadEstablismentCSV } from './030_load_establishment';
import { loadAddressCSV } from './040_load_address';
import { loadContactsCSV } from './050_load_contacts';
import { loadDenominationCSV } from './060_load_denomination';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const upsertMode = process.argv.includes('--upsert');

try {
  await loadDeleteAll();
  await loadCSV_code(path.join(dataDir, 'code.csv'));
  await loadEnterpriseCSV(path.join(dataDir, 'enterprise.csv'), upsertMode);
  await loadEstablismentCSV(path.join(dataDir, 'establishment.csv'), upsertMode);
  await loadAddressCSV(path.join(dataDir, 'address.csv'), upsertMode);
  await loadContactsCSV(path.join(dataDir, 'contact.csv'), upsertMode);
  await loadDenominationCSV(path.join(dataDir, 'denomination.csv'), upsertMode);
  console.log('KBO load complete.');
} finally {
  await disconnectKboClient();
}
