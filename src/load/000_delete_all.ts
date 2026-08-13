import { createKboClient } from '../client';

export async function loadDeleteAll(): Promise<void> {
  const db = await createKboClient();
  await db.transaction(async () => {
    for (const table of ['Activity', 'KBOContact', 'KBOAddress', 'Denomination', 'Establishment', 'Enterprise']) {
      await db.run(`DELETE FROM "${table}"`);
    }
  });
}