import 'dotenv/config';
import { loadBranchCSV } from '../src/load/070_load_branch.ts';
import { loadContactsCSV } from '../src/load/050_load_contacts.ts';
import { loadDenominationCSV } from '../src/load/060_load_denomination.ts';
import { createKboClient, disconnectKboClient } from '../src/client.ts';

const upsertMode = process.argv.includes('--upsert');

try {
  const step = process.argv[2] ?? 'all';
  if (step === 'branch' || step === 'all') {
    await loadBranchCSV('data/branch.csv', upsertMode);
  }
  if (step === 'contacts' || step === 'all') {
    await loadContactsCSV('data/contact.csv', upsertMode);
  }
  if (step === 'denomination' || step === 'all') {
    await loadDenominationCSV('data/denomination.csv', upsertMode);
  }

  const prisma = createKboClient();
  const [branch, contact, denomination] = await Promise.all([
    prisma.branch.count(),
    prisma.kBOContact.count(),
    prisma.denomination.count(),
  ]);
  console.log({ branch, contact, denomination });
} finally {
  await disconnectKboClient();
}
