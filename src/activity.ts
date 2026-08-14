import { createKboClient } from './client';

export type ListEnterprisesByNaceOptions = { naceVersion?: string; classification?: string; limit?: number; offset?: number; /** @deprecated Pass KBO_DATABASE_PATH instead. */ databaseUrl?: string; databasePath?: string };
export type KboNaceEnterpriseHit = { enterpriseNumber: string; name: string; city?: string; status?: string; juridicalForm?: string; naceCodes: string[]; classifications: string[] };
export type ListEnterprisesByNaceResult = { enterprises: KboNaceEnterpriseHit[]; total: number };
export type NaceActivityFilter = { naceCode: string; naceVersion?: string; classification?: string };
export type EnterprisesByPostalCodeRow = { postalCode: string; enterpriseCount: number };
export type NacePostalEnterprise = { enterpriseNumber: string; name: string; postalCode: string };

export async function listEnterprisesByNaceCode(naceCode: string, options: ListEnterprisesByNaceOptions = {}): Promise<ListEnterprisesByNaceResult> {
  const code = naceCode.trim();
  if (!code) return { enterprises: [], total: 0 };
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const version = options.naceVersion?.trim() || null;
  const classification = options.classification?.trim() || null;
  const db = await createKboClient(options.databasePath ?? options.databaseUrl);
  const params = [code, version, classification];
  const source = `SELECT a."enterpriseId" AS "enterpriseNumber" FROM "Activity" a WHERE (a."naceCode" = $1 OR a."naceCode" LIKE $1 || '%') AND a."enterpriseId" IS NOT NULL AND ($2 IS NULL OR a."naceVersion" = $2) AND ($3 IS NULL OR a."classification" = $3) UNION SELECT est."enterpriseNumber" FROM "Activity" a JOIN "Establishment" est ON est."establishmentNumber" = a."establishmentId" WHERE (a."naceCode" = $1 OR a."naceCode" LIKE $1 || '%') AND a."establishmentId" IS NOT NULL AND ($2 IS NULL OR a."naceVersion" = $2) AND ($3 IS NULL OR a."classification" = $3)`;
  const [{ total }] = await db.all<{ total: number }>(`WITH hits AS (${source}) SELECT count(*) AS total FROM hits`, params);
  const hits = await db.all<{ enterpriseNumber: string }>(`WITH hits AS (${source}) SELECT "enterpriseNumber" FROM hits ORDER BY "enterpriseNumber" LIMIT $4 OFFSET $5`, [...params, limit, offset]);
  if (hits.length === 0) return { enterprises: [], total: Number(total) };
  const enterprises = await Promise.all(hits.map(async ({ enterpriseNumber }) => {
    const [row] = await db.all<{ name: string | null; city: string | null; status: string | null; juridicalForm: string | null }>(`SELECT coalesce((SELECT d."denomination" FROM "Denomination" d WHERE d."enterpriseId" = e."enterpriseNumber" ORDER BY CASE d."languageCode" WHEN 'NL' THEN 0 WHEN 'FR' THEN 1 ELSE 2 END, d."typeOfDenominationCode" LIMIT 1), '') AS name, coalesce(address."municipalityNL", address."municipalityFR") AS city, status."description" AS status, form."description" AS "juridicalForm" FROM "Enterprise" e LEFT JOIN "KBOAddress" address ON address."enterpriseId" = e."enterpriseNumber" LEFT JOIN "Code" status ON status."category" = 'Status' AND status."code" = e."KBOstatusCode" LEFT JOIN "Code" form ON form."category" = 'JuridicalForm' AND form."code" = e."juridicalFormCode" WHERE e."enterpriseNumber" = $1 LIMIT 1`, [enterpriseNumber]);
    return row ? { enterpriseNumber, name: row.name ?? '', city: row.city ?? undefined, status: row.status ?? undefined, juridicalForm: row.juridicalForm ?? undefined, naceCodes: [code], classifications: classification ? [classification] : [] } : null;
  }));
  return { total: Number(total), enterprises: enterprises.filter((row) => row !== null).map((row) => ({
    enterpriseNumber: row.enterpriseNumber,
    name: row.name,
    ...(row.city ? { city: row.city } : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(row.juridicalForm ? { juridicalForm: row.juridicalForm } : {}),
    naceCodes: row.naceCodes,
    classifications: row.classifications,
  })) };
}

export function buildNaceActivityWhere(naceCode: string, options: Pick<ListEnterprisesByNaceOptions, 'naceVersion' | 'classification'> = {}): NaceActivityFilter {
  return { naceCode: naceCode.trim(), ...(options.naceVersion?.trim() ? { naceVersion: options.naceVersion.trim() } : {}), ...(options.classification?.trim() ? { classification: options.classification.trim() } : {}) };
}

/** Counts distinct enterprises with a matching enterprise or establishment activity by registered-office postal code. */
export async function countEnterprisesByNacePostalCode(naceCode: string, options: Pick<ListEnterprisesByNaceOptions, 'naceVersion' | 'classification' | 'databasePath' | 'databaseUrl'> = {}): Promise<EnterprisesByPostalCodeRow[]> {
  const code = naceCode.trim();
  if (!code) return [];
  const version = options.naceVersion?.trim() || null;
  const classification = options.classification?.trim() || null;
  const db = await createKboClient(options.databasePath ?? options.databaseUrl);
  const rows = await db.all<{ postalCode: string | null; enterpriseCount: number }>(`
    WITH hits AS (
      SELECT a."enterpriseId" AS "enterpriseNumber"
      FROM "Activity" a
      WHERE (a."naceCode" = $1 OR a."naceCode" LIKE $1 || '%')
        AND a."enterpriseId" IS NOT NULL
        AND ($2 IS NULL OR a."naceVersion" = $2)
        AND ($3 IS NULL OR a."classification" = $3)
      UNION
      SELECT est."enterpriseNumber"
      FROM "Activity" a
      JOIN "Establishment" est ON est."establishmentNumber" = a."establishmentId"
      WHERE (a."naceCode" = $1 OR a."naceCode" LIKE $1 || '%')
        AND a."establishmentId" IS NOT NULL
        AND ($2 IS NULL OR a."naceVersion" = $2)
        AND ($3 IS NULL OR a."classification" = $3)
    )
    SELECT coalesce(nullif(address."zipcode", ''), 'Unknown') AS "postalCode", count(*) AS "enterpriseCount"
    FROM hits
    LEFT JOIN "KBOAddress" address
      ON address."enterpriseId" = hits."enterpriseNumber"
      AND address."typeOfAddressCode" = 'REGO'
    GROUP BY 1
    ORDER BY 1
  `, [code, version, classification]);

  return rows.map((row) => ({ postalCode: row.postalCode ?? 'Unknown', enterpriseCount: Number(row.enterpriseCount) }));
}

/** Lists each enterprise once when its own or an establishment's activity matches the NACE code and its registered office is in the postal code. */
export async function listEnterprisesByNaceAndPostalCode(naceCode: string, postalCode: string, options: Pick<ListEnterprisesByNaceOptions, 'naceVersion' | 'classification' | 'databasePath' | 'databaseUrl'> = {}): Promise<NacePostalEnterprise[]> {
  const code = naceCode.trim();
  const postcode = postalCode.trim();
  if (!code || !postcode) return [];
  const version = options.naceVersion?.trim() || null;
  const classification = options.classification?.trim() || null;
  const db = await createKboClient(options.databasePath ?? options.databaseUrl);
  return db.all<NacePostalEnterprise>(`
    WITH hits AS (
      SELECT a."enterpriseId" AS "enterpriseNumber"
      FROM "Activity" a
      WHERE (a."naceCode" = $1 OR a."naceCode" LIKE $1 || '%') AND a."enterpriseId" IS NOT NULL
        AND ($3 IS NULL OR a."naceVersion" = $3)
        AND ($4 IS NULL OR a."classification" = $4)
      UNION
      SELECT est."enterpriseNumber"
      FROM "Activity" a
      JOIN "Establishment" est ON est."establishmentNumber" = a."establishmentId"
      WHERE (a."naceCode" = $1 OR a."naceCode" LIKE $1 || '%') AND a."establishmentId" IS NOT NULL
        AND ($3 IS NULL OR a."naceVersion" = $3)
        AND ($4 IS NULL OR a."classification" = $4)
    )
    SELECT hits."enterpriseNumber", coalesce((
      SELECT d."denomination"
      FROM "Denomination" d
      WHERE d."enterpriseId" = hits."enterpriseNumber"
      ORDER BY CASE d."languageCode" WHEN 'NL' THEN 0 WHEN 'FR' THEN 1 ELSE 2 END, d."typeOfDenominationCode"
      LIMIT 1
    ), '') AS "name", $2 AS "postalCode"
    FROM hits
    JOIN "KBOAddress" address
      ON address."enterpriseId" = hits."enterpriseNumber"
      AND address."typeOfAddressCode" = 'REGO'
      AND address."zipcode" = $2
    ORDER BY hits."enterpriseNumber"
  `, [code, postcode, version, classification]);
}