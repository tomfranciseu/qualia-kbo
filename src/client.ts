import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

let pool: Pool | undefined;
let client: PrismaClient | undefined;

export function createKboClient(databaseUrl = process.env.KBO_DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error('KBO_DATABASE_URL is required');
  }
  if (!client) {
    pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectKboClient(): Promise<void> {
  await client?.$disconnect();
  await pool?.end();
  client = undefined;
  pool = undefined;
}

export async function checkKboDatabaseHealth(databaseUrl = process.env.KBO_DATABASE_URL): Promise<boolean> {
  if (!databaseUrl) return false;
  try {
    const db = createKboClient(databaseUrl);
    await db.$queryRawUnsafe('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
