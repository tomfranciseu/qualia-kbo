import { registryTable } from './registrySql';
import { createKboClient, type KboClient } from './client';
import type { KboAddress, KboContact, KboLookupResult } from './types';
import { formatEnterpriseNumber, getBelgianEnterpriseNumberFromVat } from './vat';

type EnterpriseRow = { enterpriseNumber: string; status: string | null; juridicalSituation: string | null; startDate: string | null; juridicalForm: string | null };
type AddressRow = { streetNL: string | null; streetFR: string | null; houseNumber: string | null; zipcode: string | null; municipalityNL: string | null; municipalityFR: string | null; countryNL: string | null; countryFR: string | null };

function mapAddress(address: AddressRow): KboAddress {
  return { street: address.streetNL ?? address.streetFR ?? '', houseNumber: address.houseNumber ?? '', postalZone: address.zipcode ?? '', city: address.municipalityNL ?? address.municipalityFR ?? '', country: address.countryNL ?? address.countryFR ?? 'BE' };
}

async function findEnterprise(db: KboClient, where: string, values: unknown[]): Promise<KboLookupResult | null> {
  const [enterprise] = await db.all<EnterpriseRow>(`SELECT e."enterpriseNumber", status."description" AS status, situation."description" AS "juridicalSituation", CAST(CAST(e."startDate" AS DATE) AS VARCHAR) AS "startDate", coalesce(form."description", cacForm."description") AS "juridicalForm" FROM ${registryTable(db, "Enterprise")} e LEFT JOIN ${registryTable(db, "Code")} status ON status."category" = 'Status' AND status."code" = e."KBOstatusCode" LEFT JOIN ${registryTable(db, "Code")} situation ON situation."category" = 'JuridicalSituation' AND situation."code" = e."juridicalSituationCode" LEFT JOIN ${registryTable(db, "Code")} form ON form."category" = 'JuridicalForm' AND form."code" = e."juridicalFormCode" LEFT JOIN ${registryTable(db, "Code")} cacForm ON cacForm."category" = 'JuridicalForm' AND cacForm."code" = e."juridicalFormCACCode" WHERE ${where} LIMIT 1`, values);
  if (!enterprise) return null;
  const [denominations, addresses, contacts] = await Promise.all([
    db.all<{ languageCode: string; denomination: string }>(`SELECT "languageCode", "denomination" FROM ${registryTable(db, "Denomination")} WHERE "enterpriseId" = $1`, [enterprise.enterpriseNumber]),
    db.all<AddressRow>(`SELECT "streetNL", "streetFR", "houseNumber", "zipcode", "municipalityNL", "municipalityFR", "countryNL", "countryFR" FROM ${registryTable(db, "KBOAddress")} WHERE "enterpriseId" = $1`, [enterprise.enterpriseNumber]),
    db.all<{ value: string; type: string }>(`SELECT c."value", t."description" AS type FROM ${registryTable(db, "KBOContact")} c LEFT JOIN ${registryTable(db, "Code")} t ON t."category" = 'ContactType' AND t."code" = c."conctactTypeCode" WHERE c."enterpriseId" = $1`, [enterprise.enterpriseNumber]),
  ]);
  const nl = denominations.find((d) => d.languageCode === 'NL');
  const mappedContacts: KboContact[] = contacts.map((contact) => ({ type: contact.type ?? '', value: contact.value }));
  return { enterpriseNumber: enterprise.enterpriseNumber, name: nl?.denomination ?? denominations[0]?.denomination ?? '', addresses: addresses.map(mapAddress), contacts: mappedContacts, juridicalForm: enterprise.juridicalForm ?? undefined, juridicalSituation: enterprise.juridicalSituation ?? undefined, startDate: enterprise.startDate ?? undefined, status: enterprise.status ?? undefined };
}

export async function lookupByEnterpriseNumber(enterpriseNumber: string, databasePath?: string): Promise<KboLookupResult | null> {
  const normalized = formatEnterpriseNumber(enterpriseNumber.replaceAll(/\s/g, ''));
  const db = await createKboClient(databasePath);
  return findEnterprise(db, `e."enterpriseNumber" = $1`, [normalized]);
}

export async function lookupByName(name: string, databasePath?: string): Promise<KboLookupResult | null> {
  const search = name.trim();
  if (!search) return null;
  const db = await createKboClient(databasePath);
  const escapeLike = search.replaceAll(/[%_\\]/g, '\\$&');
  const [exact] = await db.all<{ enterpriseNumber: string }>(`SELECT "enterpriseId" AS "enterpriseNumber" FROM ${registryTable(db, "Denomination")} WHERE lower("denomination") = lower($1) AND "enterpriseId" IS NOT NULL LIMIT 1`, [search]);
  const [partial] = exact ? [] : await db.all<{ enterpriseNumber: string }>(`SELECT "enterpriseId" AS "enterpriseNumber" FROM ${registryTable(db, "Denomination")} WHERE lower("denomination") LIKE '%' || lower($1) || '%' ESCAPE '\\' AND "enterpriseId" IS NOT NULL LIMIT 1`, [escapeLike]);
  const number = exact?.enterpriseNumber ?? partial?.enterpriseNumber;
  return number ? findEnterprise(db, `e."enterpriseNumber" = $1`, [number]) : null;
}

export async function lookupByVatNumber(countryCode: string, vatNumber: string, databasePath?: string): Promise<KboLookupResult | null> {
  if (countryCode.toUpperCase() !== 'BE') return null;
  const digits = getBelgianEnterpriseNumberFromVat(vatNumber);
  return digits ? lookupByEnterpriseNumber(formatEnterpriseNumber(digits), databasePath) : null;
}

export type KboCompanySearchHit = { enterpriseNumber: string; name: string; city?: string; status?: string };
export type SearchEnterprisesByNameOptions = { limit?: number; databasePath?: string };

/** Case-insensitive literal substring search, one hit per enterprise in stable number order.
 * Limits results to 100; LIKE metacharacters are escaped and values parameterized.
 * Supports DuckDB, modern PostgreSQL and the existing Prisma-managed kbo schema.
 */
export async function searchEnterprisesByName(query: string, options: SearchEnterprisesByNameOptions = {}): Promise<KboCompanySearchHit[]> {
  const search = query.trim();
  if (!search) return [];
  const limit = Number.isFinite(options.limit) ? Math.min(100, Math.max(1, Math.floor(options.limit!))) : 20;
  const db = await createKboClient(options.databasePath);
  const rows = await db.all<{ enterpriseNumber: string; name: string; city: string | null; status: string | null }>(`
    SELECT e."enterpriseNumber", coalesce((
      SELECT d."denomination" FROM ${registryTable(db, 'Denomination')} d
      WHERE d."enterpriseId" = e."enterpriseNumber"
      ORDER BY CASE d."languageCode" WHEN 'NL' THEN 0 WHEN 'FR' THEN 1 ELSE 2 END, d."typeOfDenominationCode", d."denomination" LIMIT 1
    ), '') AS name, (
      SELECT coalesce(a."municipalityNL", a."municipalityFR") FROM ${registryTable(db, 'KBOAddress')} a
      WHERE a."enterpriseId" = e."enterpriseNumber" ORDER BY a."typeOfAddressCode" LIMIT 1
    ) AS city, (
      SELECT s."description" FROM ${registryTable(db, 'Code')} s
      WHERE s."category" = 'Status' AND s."code" = e."KBOstatusCode" LIMIT 1
    ) AS status
    FROM ${registryTable(db, 'Enterprise')} e
    WHERE EXISTS (
      SELECT 1 FROM ${registryTable(db, 'Denomination')} d
      WHERE d."enterpriseId" = e."enterpriseNumber"
        AND lower(d."denomination") LIKE '%' || lower($1) || '%' ESCAPE '!'
    ) ORDER BY e."enterpriseNumber" LIMIT $2
  `, [search.replaceAll(/[!%_]/g, '!$&'), limit]);
  return rows.map(row => ({ enterpriseNumber: row.enterpriseNumber, name: row.name,
    ...(row.city == null ? {} : { city: row.city }), ...(row.status == null ? {} : { status: row.status }) }));
}
