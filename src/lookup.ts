import { createKboClient } from './client';
import type { KboAddress, KboContact, KboLookupResult } from './types';
import { formatEnterpriseNumber, getBelgianEnterpriseNumberFromVat } from './vat';

type EnterpriseRow = { enterpriseNumber: string; status: string | null; juridicalSituation: string | null; startDate: string | null; juridicalForm: string | null };
type AddressRow = { streetNL: string | null; streetFR: string | null; houseNumber: string | null; zipcode: string | null; municipalityNL: string | null; municipalityFR: string | null; countryNL: string | null; countryFR: string | null };

function mapAddress(address: AddressRow): KboAddress {
  return { street: address.streetNL ?? address.streetFR ?? '', houseNumber: address.houseNumber ?? '', postalZone: address.zipcode ?? '', city: address.municipalityNL ?? address.municipalityFR ?? '', country: address.countryNL ?? address.countryFR ?? 'BE' };
}

async function findEnterprise(where: string, values: unknown[]): Promise<KboLookupResult | null> {
  const db = await createKboClient();
  const [enterprise] = await db.all<EnterpriseRow>(`SELECT e."enterpriseNumber", status."description" AS status, situation."description" AS "juridicalSituation", strftime(e."startDate", '%Y-%m-%d') AS "startDate", coalesce(form."description", cacForm."description") AS "juridicalForm" FROM "Enterprise" e LEFT JOIN "Code" status ON status."category" = 'Status' AND status."code" = e."KBOstatusCode" LEFT JOIN "Code" situation ON situation."category" = 'JuridicalSituation' AND situation."code" = e."juridicalSituationCode" LEFT JOIN "Code" form ON form."category" = 'JuridicalForm' AND form."code" = e."juridicalFormCode" LEFT JOIN "Code" cacForm ON cacForm."category" = 'JuridicalForm' AND cacForm."code" = e."juridicalFormCACCode" WHERE ${where} LIMIT 1`, values);
  if (!enterprise) return null;
  const [denominations, addresses, contacts] = await Promise.all([
    db.all<{ languageCode: string; denomination: string }>('SELECT "languageCode", "denomination" FROM "Denomination" WHERE "enterpriseId" = $1', [enterprise.enterpriseNumber]),
    db.all<AddressRow>('SELECT "streetNL", "streetFR", "houseNumber", "zipcode", "municipalityNL", "municipalityFR", "countryNL", "countryFR" FROM "KBOAddress" WHERE "enterpriseId" = $1', [enterprise.enterpriseNumber]),
    db.all<{ value: string; type: string }>(`SELECT c."value", t."description" AS type FROM "KBOContact" c LEFT JOIN "Code" t ON t."category" = 'ContactType' AND t."code" = c."conctactTypeCode" WHERE c."enterpriseId" = $1`, [enterprise.enterpriseNumber]),
  ]);
  const nl = denominations.find((d) => d.languageCode === 'NL');
  const mappedContacts: KboContact[] = contacts.map((contact) => ({ type: contact.type ?? '', value: contact.value }));
  return { enterpriseNumber: enterprise.enterpriseNumber, name: nl?.denomination ?? denominations[0]?.denomination ?? '', addresses: addresses.map(mapAddress), contacts: mappedContacts, juridicalForm: enterprise.juridicalForm ?? undefined, juridicalSituation: enterprise.juridicalSituation ?? undefined, startDate: enterprise.startDate ?? undefined, status: enterprise.status ?? undefined };
}

export async function lookupByEnterpriseNumber(enterpriseNumber: string, databasePath?: string): Promise<KboLookupResult | null> {
  const normalized = formatEnterpriseNumber(enterpriseNumber.replaceAll(/\s/g, ''));
  if (databasePath) await createKboClient(databasePath);
  return findEnterprise('e."enterpriseNumber" = $1', [normalized]);
}

export async function lookupByName(name: string, databasePath?: string): Promise<KboLookupResult | null> {
  const search = name.trim();
  if (!search) return null;
  if (databasePath) await createKboClient(databasePath);
  const db = await createKboClient();
  const escapeLike = search.replaceAll(/[%_\\]/g, '\\$&');
  const [exact] = await db.all<{ enterpriseNumber: string }>('SELECT "enterpriseId" AS "enterpriseNumber" FROM "Denomination" WHERE lower("denomination") = lower($1) AND "enterpriseId" IS NOT NULL LIMIT 1', [search]);
  const [partial] = exact ? [] : await db.all<{ enterpriseNumber: string }>(`SELECT "enterpriseId" AS "enterpriseNumber" FROM "Denomination" WHERE lower("denomination") LIKE '%' || lower($1) || '%' ESCAPE '\\' AND "enterpriseId" IS NOT NULL LIMIT 1`, [escapeLike]);
  const number = exact?.enterpriseNumber ?? partial?.enterpriseNumber;
  return number ? findEnterprise('e."enterpriseNumber" = $1', [number]) : null;
}

export async function lookupByVatNumber(countryCode: string, vatNumber: string, databasePath?: string): Promise<KboLookupResult | null> {
  if (countryCode.toUpperCase() !== 'BE') return null;
  const digits = getBelgianEnterpriseNumberFromVat(vatNumber);
  return digits ? lookupByEnterpriseNumber(formatEnterpriseNumber(digits), databasePath) : null;
}