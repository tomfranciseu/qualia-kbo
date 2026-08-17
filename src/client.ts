import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DuckDBInstance, VARCHAR, type DuckDBConnection } from '@duckdb/node-api';
import { Pool, type PoolClient } from 'pg';

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
CREATE TABLE IF NOT EXISTS "DashboardReportRun" ("id" VARCHAR PRIMARY KEY, "createdAt" TIMESTAMP, "updatedAt" TIMESTAMP, "status" VARCHAR, "naceCode" VARCHAR, "naceVersion" VARCHAR, "classification" VARCHAR, "postalCode" VARCHAR, "fiscalYears" VARCHAR, "fields" VARCHAR, "totalCompanies" INTEGER, "completedCompanies" INTEGER, "message" VARCHAR);
CREATE TABLE IF NOT EXISTS "DashboardReportRow" ("runId" VARCHAR, "enterpriseNumber" VARCHAR, "name" VARCHAR, "postalCode" VARCHAR, "fiscalYear" INTEGER, "status" VARCHAR, "message" VARCHAR, "data" VARCHAR, PRIMARY KEY ("runId", "enterpriseNumber", "fiscalYear"));
CREATE INDEX IF NOT EXISTS "Activity_naceCode_idx" ON "Activity" ("naceCode");
CREATE INDEX IF NOT EXISTS "Activity_naceCode_naceVersion_idx" ON "Activity" ("naceCode", "naceVersion");
CREATE INDEX IF NOT EXISTS "Denomination_name_idx" ON "Denomination" ("denomination");
`;

const postgresSchema = schema;

export type KboClient = {
  run: (sql: string, values?: unknown[]) => Promise<void>;
  all: <T>(sql: string, values?: unknown[]) => Promise<T[]>;
  transaction: <T>(action: () => Promise<T>) => Promise<T>;
};

export type KboStorage = 'duckdb' | 'postgres';

let duckConnection: DuckDBConnection | undefined;
let postgresPool: Pool | undefined;
let postgresTransactionClient: PoolClient | undefined;
let storage: KboStorage | undefined;
let databaseLocation: string | undefined;
let transactionDepth = 0;
/** Postgres caps bind params near 65k; DuckDB can take larger inserts for 100k-row CSV batches. */
const MAX_PARAMETERS_PER_INSERT_POSTGRES = 60_000;
const MAX_PARAMETERS_PER_INSERT_DUCKDB = 1_000_000;

function isPostgresUrl(value: string | undefined): boolean {
  return Boolean(value && /^postgres(?:ql)?:\/\//i.test(value));
}

function getStorage(target?: string): KboStorage {
  if (isPostgresUrl(target)) return 'postgres';
  const configured = process.env.KBO_STORAGE?.trim().toLowerCase();
  if (!configured || configured === 'duckdb') return 'duckdb';
  if (configured === 'postgres' || configured === 'postgresql') return 'postgres';
  throw new Error('KBO_STORAGE must be either "duckdb" or "postgres".');
}

function getPostgresUrl(target?: string): string {
  const url = isPostgresUrl(target) ? target : process.env.KBO_DATABASE_URL?.trim();
  if (!url) throw new Error('KBO_DATABASE_URL is required when KBO_STORAGE=postgres.');
  return url;
}

export function getKboDatabasePath(path = process.env.KBO_DATABASE_PATH): string {
  return path ? resolve(path) : defaultDatabasePath;
}

export function getKboDatabaseLocation(): string {
  return databaseLocation ?? (getStorage() === 'postgres' ? getPostgresUrl() : getKboDatabasePath());
}

export async function createKboClient(target = process.env.KBO_DATABASE_PATH): Promise<KboClient> {
  const selectedStorage = getStorage(target);
  const targetLocation = selectedStorage === 'postgres' ? getPostgresUrl(target) : getKboDatabasePath(target);
  if (storage && (storage !== selectedStorage || databaseLocation !== targetLocation)) throw new Error(`KBO database is already open at ${databaseLocation}`);

  if (selectedStorage === 'duckdb' && !duckConnection) {
    mkdirSync(dirname(targetLocation), { recursive: true });
    const instance = await DuckDBInstance.fromCache(targetLocation);
    duckConnection = await instance.connect();
    await duckConnection.run(schema);
  }
  if (selectedStorage === 'postgres' && !postgresPool) {
    postgresPool = new Pool({ connectionString: targetLocation });
    await postgresPool.query(postgresSchema);
  }
  storage = selectedStorage;
  databaseLocation = targetLocation;

  return {
    async run(sql, values = []) {
      if (storage === 'postgres') { await (postgresTransactionClient ?? postgresPool)!.query(sql, values); return; }
      await duckConnection!.run(sql, values as never[], values.map(() => VARCHAR));
    },
    async all<T>(sql: string, values: unknown[] = []) {
      if (storage === 'postgres') return (await (postgresTransactionClient ?? postgresPool)!.query(sql, values)).rows as T[];
      const reader = await duckConnection!.runAndReadAll(sql, values as never[], values.map(() => VARCHAR));
      return reader.getRowObjectsJS() as T[];
    },
    async transaction<T>(action: () => Promise<T>) {
      const outermost = transactionDepth === 0;
      if (outermost && storage === 'postgres') { postgresTransactionClient = await postgresPool!.connect(); await postgresTransactionClient.query('BEGIN'); }
      if (outermost && storage === 'duckdb') await duckConnection!.run('BEGIN TRANSACTION');
      transactionDepth += 1;
      try {
        const result = await action();
        transactionDepth -= 1;
        if (outermost && storage === 'postgres') await postgresTransactionClient!.query('COMMIT');
        if (outermost && storage === 'duckdb') await duckConnection!.run('COMMIT');
        return result;
      } catch (error) {
        transactionDepth -= 1;
        if (outermost && storage === 'postgres') await postgresTransactionClient!.query('ROLLBACK');
        if (outermost && storage === 'duckdb') await duckConnection!.run('ROLLBACK');
        throw error;
      } finally {
        if (outermost && postgresTransactionClient) { postgresTransactionClient.release(); postgresTransactionClient = undefined; }
      }
    },
  };
}

export async function disconnectKboClient(): Promise<void> {
  duckConnection?.closeSync();
  duckConnection = undefined;
  await postgresPool?.end();
  postgresPool = undefined;
  postgresTransactionClient = undefined;
  storage = undefined;
  databaseLocation = undefined;
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
  const maxParameters = storage === 'postgres' ? MAX_PARAMETERS_PER_INSERT_POSTGRES : MAX_PARAMETERS_PER_INSERT_DUCKDB;
  const chunkSize = Math.max(1, Math.floor(maxParameters / columns.length));
  await db.transaction(async () => {
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const batch = rows.slice(offset, offset + chunkSize);
      const placeholders = batch.map((row, rowIndex) => `(${row.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(', ')})`).join(', ');
      await db.run(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${placeholders} ${conflictClause}`, batch.flat());
    }
  });
}
