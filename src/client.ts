import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DuckDBInstance, VARCHAR, type DuckDBConnection } from '@duckdb/node-api';

const defaultDatabasePath = resolve(process.env.LOCALAPPDATA ?? process.cwd(), 'qualia-kbo', 'kbo.duckdb');

const schema = `
CREATE TABLE IF NOT EXISTS "Code" ("category" VARCHAR, "code" VARCHAR, "description" VARCHAR, PRIMARY KEY ("category", "code"));
CREATE TABLE IF NOT EXISTS "Enterprise" ("enterpriseNumber" VARCHAR PRIMARY KEY, "KBOstatusCode" VARCHAR, "juridicalSituationCode" VARCHAR, "typeOfEnterpriseCode" VARCHAR, "juridicalFormCode" VARCHAR, "juridicalFormCACCode" VARCHAR, "startDate" TIMESTAMP);
CREATE TABLE IF NOT EXISTS "Establishment" ("establishmentNumber" VARCHAR PRIMARY KEY, "startDate" TIMESTAMP, "enterpriseNumber" VARCHAR);
CREATE TABLE IF NOT EXISTS "Branch" ("id" VARCHAR PRIMARY KEY, "startDate" TIMESTAMP, "enterpriseNumber" VARCHAR);
CREATE TABLE IF NOT EXISTS "Meta" ("variable" VARCHAR PRIMARY KEY, "value" VARCHAR);
CREATE TABLE IF NOT EXISTS "KBOAddress" ("entityNumber" VARCHAR, "typeOfAddressCode" VARCHAR, "countryNL" VARCHAR, "countryFR" VARCHAR, "zipcode" VARCHAR, "municipalityNL" VARCHAR, "municipalityFR" VARCHAR, "streetNL" VARCHAR, "streetFR" VARCHAR, "houseNumber" VARCHAR, "box" VARCHAR, "extraAddressInfo" VARCHAR, "dateStrikingOff" TIMESTAMP, "enterpriseId" VARCHAR, "establishmentId" VARCHAR, PRIMARY KEY ("entityNumber", "typeOfAddressCode"));
CREATE TABLE IF NOT EXISTS "KBOContact" ("entityNumber" VARCHAR, "entityContactCode" VARCHAR, "conctactTypeCode" VARCHAR, "value" VARCHAR, "enterpriseId" VARCHAR, "establishmentId" VARCHAR, PRIMARY KEY ("entityNumber", "entityContactCode", "conctactTypeCode"));
CREATE TABLE IF NOT EXISTS "Denomination" ("entityNumber" VARCHAR, "languageCode" VARCHAR, "typeOfDenominationCode" VARCHAR, "denomination" VARCHAR, "enterpriseId" VARCHAR, "establishmentId" VARCHAR, PRIMARY KEY ("entityNumber", "languageCode", "typeOfDenominationCode"));
CREATE TABLE IF NOT EXISTS "Activity" ("entityNumber" VARCHAR, "activityGroupCode" VARCHAR, "naceVersion" VARCHAR, "naceCode" VARCHAR, "classification" VARCHAR, "enterpriseId" VARCHAR, "establishmentId" VARCHAR, PRIMARY KEY ("entityNumber", "activityGroupCode", "naceVersion", "naceCode", "classification"));
CREATE INDEX IF NOT EXISTS "Activity_naceCode_idx" ON "Activity" ("naceCode");
CREATE INDEX IF NOT EXISTS "Activity_naceCode_naceVersion_idx" ON "Activity" ("naceCode", "naceVersion");
CREATE INDEX IF NOT EXISTS "Denomination_name_idx" ON "Denomination" ("denomination");
`;

export type KboClient = {
  run: (sql: string, values?: unknown[]) => Promise<void>;
  all: <T>(sql: string, values?: unknown[]) => Promise<T[]>;
  transaction: <T>(action: () => Promise<T>) => Promise<T>;
};

let connection: DuckDBConnection | undefined;
let databasePath: string | undefined;
let transactionDepth = 0;
const MAX_PARAMETERS_PER_INSERT = 10_000;

export function getKboDatabasePath(path = process.env.KBO_DATABASE_PATH): string {
  return path ? resolve(path) : defaultDatabasePath;
}

export async function createKboClient(path = process.env.KBO_DATABASE_PATH): Promise<KboClient> {
  const targetPath = getKboDatabasePath(path);
  if (!connection) {
    mkdirSync(dirname(targetPath), { recursive: true });
    const instance = await DuckDBInstance.fromCache(targetPath);
    connection = await instance.connect();
    databasePath = targetPath;
    await connection.run(schema);
  } else if (databasePath !== targetPath) {
    throw new Error(`KBO database is already open at ${databasePath}`);
  }

  return {
    async run(sql, values = []) {
      await connection!.run(sql, values as never[], values.map(() => VARCHAR));
    },
    async all<T>(sql: string, values: unknown[] = []) {
      const reader = await connection!.runAndReadAll(sql, values as never[], values.map(() => VARCHAR));
      return reader.getRowObjectsJS() as T[];
    },
    async transaction<T>(action: () => Promise<T>) {
      const outermost = transactionDepth === 0;
      if (outermost) await connection!.run('BEGIN TRANSACTION');
      transactionDepth += 1;
      try {
        const result = await action();
        transactionDepth -= 1;
        if (outermost) await connection!.run('COMMIT');
        return result;
      } catch (error) {
        transactionDepth -= 1;
        if (outermost) await connection!.run('ROLLBACK');
        throw error;
      }
    },
  };
}

export async function disconnectKboClient(): Promise<void> {
  connection?.closeSync();
  connection = undefined;
  databasePath = undefined;
  transactionDepth = 0;
}

export async function checkKboDatabaseHealth(path = process.env.KBO_DATABASE_PATH): Promise<boolean> {
  try {
    const db = await createKboClient(path);
    await db.all('SELECT 1 AS healthy');
    return true;
  } catch {
    return false;
  }
}

export async function insertMany(table: string, columns: string[], rows: unknown[][], conflictClause = 'ON CONFLICT DO NOTHING'): Promise<void> {
  if (rows.length === 0) return;
  const db = await createKboClient();
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMETERS_PER_INSERT / columns.length));
  await db.transaction(async () => {
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const batch = rows.slice(offset, offset + chunkSize);
      const placeholders = batch.map((row, rowIndex) => `(${row.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`).join(', ');
      await db.run(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${placeholders} ${conflictClause}`, batch.flat());
    }
  });
}
