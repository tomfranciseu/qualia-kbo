import { createKboClient } from '../client';
import { determineEntityType } from './helper';
import { readCsvBatches } from './csv';

type ActivityInput = { entityNumber: string; activityGroupCode: string; naceVersion: string; naceCode: string; classification: string; enterpriseId?: string; establishmentId?: string };
type ActivityRow = { EntityNumber: string; ActivityGroup: string; NaceVersion: string; NaceCode: string; Classification: string };

export function rowToActivityInput(row: ActivityRow): ActivityInput {
  const base = { entityNumber: row.EntityNumber, activityGroupCode: row.ActivityGroup, naceVersion: row.NaceVersion, naceCode: row.NaceCode, classification: row.Classification };
  const type = determineEntityType(row.EntityNumber);
  return type === 'Enterprise' ? { ...base, enterpriseId: row.EntityNumber } : type === 'Establishment' ? { ...base, establishmentId: row.EntityNumber } : base;
}

export async function loadActivityCSV(filename: string, upsertMode: boolean): Promise<void> {
  const conflictClause = upsertMode
    ? 'ON CONFLICT ("entityNumber", "activityGroupCode", "naceVersion", "naceCode", "classification") DO UPDATE SET "enterpriseId" = excluded."enterpriseId", "establishmentId" = excluded."establishmentId"'
    : 'ON CONFLICT DO NOTHING';

  await readCsvBatches<ActivityRow, unknown[]>(filename, (row) => {
    if (!row.EntityNumber || !row.NaceCode) return;
    const activity = rowToActivityInput(row);
    return [activity.entityNumber, activity.activityGroupCode, activity.naceVersion, activity.naceCode, activity.classification, activity.enterpriseId ?? null, activity.establishmentId ?? null];
  }, async (batch) => {
    const db = await createKboClient();
    const columns = ['entityNumber', 'activityGroupCode', 'naceVersion', 'naceCode', 'classification', 'enterpriseId', 'establishmentId'];
    const placeholders = batch.map((row, rowIndex) => `(${row.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`).join(', ');
    await db.run(`INSERT INTO "Activity" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${placeholders} ${conflictClause}`, batch.flat());
  }, 'Activity', 1_400);
}