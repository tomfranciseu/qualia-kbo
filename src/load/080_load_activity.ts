import { createKboClient } from '../client';
import { determineEntityType } from './helper';
import { countCsvDataRows } from './csv';

type ActivityInput = { entityNumber: string; activityGroupCode: string; naceVersion: string; naceCode: string; classification: string; enterpriseId?: string; establishmentId?: string };
type ActivityRow = { EntityNumber: string; ActivityGroup: string; NaceVersion: string; NaceCode: string; Classification: string };

export function rowToActivityInput(row: ActivityRow): ActivityInput {
  const base = { entityNumber: row.EntityNumber, activityGroupCode: row.ActivityGroup, naceVersion: row.NaceVersion, naceCode: row.NaceCode, classification: row.Classification };
  const type = determineEntityType(row.EntityNumber);
  return type === 'Enterprise' ? { ...base, enterpriseId: row.EntityNumber } : type === 'Establishment' ? { ...base, establishmentId: row.EntityNumber } : base;
}

export async function loadActivityCSV(filename: string, upsertMode: boolean): Promise<void> {
  const db = await createKboClient();
  const totalRows = await countCsvDataRows(filename, 'Activity');
  const startedAt = performance.now();
  const conflictClause = upsertMode
    ? 'ON CONFLICT ("entityNumber", "activityGroupCode", "naceVersion", "naceCode", "classification") DO UPDATE SET "enterpriseId" = excluded."enterpriseId", "establishmentId" = excluded."establishmentId"'
    : 'ON CONFLICT DO NOTHING';

  console.log(`Activity: 0.0% — loading ${totalRows.toLocaleString()} rows with DuckDB…`);
  await db.run(`
    INSERT INTO "Activity" (
      "entityNumber", "activityGroupCode", "naceVersion", "naceCode", "classification", "enterpriseId", "establishmentId"
    )
    SELECT
      "EntityNumber",
      "ActivityGroup",
      "NaceVersion",
      "NaceCode",
      "Classification",
      CASE WHEN regexp_full_match("EntityNumber", '^\\d{4}\\.\\d{3}\\.\\d{3}$') THEN "EntityNumber" END,
      CASE WHEN regexp_full_match("EntityNumber", '^\\d\\.\\d{3}\\.\\d{3}\\.\\d{3}$') THEN "EntityNumber" END
    FROM read_csv($1, header = true, all_varchar = true)
    WHERE "EntityNumber" <> '' AND "NaceCode" <> ''
    ${conflictClause}
  `, [filename]);
  console.log(`Activity: 100.0% — CSV loaded in ${((performance.now() - startedAt) / 1_000).toFixed(1)} seconds.`);
}