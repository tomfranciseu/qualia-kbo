import { createKboClient } from './client.js';
import type { KboAddress, KboContact, KboLookupResult } from './types.js';
import { formatEnterpriseNumber, getBelgianEnterpriseNumberFromVat } from './vat.js';

const enterpriseInclude = {
  denominations: true,
  addresses: true,
  contacts: { include: { contactType: true } },
  juridicalForm: true,
  KBOstatus: true,
} as const;

type EnterpriseRecord = Awaited<
  ReturnType<ReturnType<typeof createKboClient>['enterprise']['findUnique']>
> & {
  denominations: Array<{ languageCode: string; denomination: string }>;
  addresses: Array<{
    streetNL: string | null;
    streetFR: string | null;
    houseNumber: string | null;
    zipcode: string | null;
    municipalityNL: string | null;
    municipalityFR: string | null;
    countryNL: string | null;
    countryFR: string | null;
  }>;
  contacts: Array<{ value: string; contactType: { description: string } }>;
  juridicalForm: { description: string } | null;
  KBOstatus: { description: string } | null;
};

function mapAddress(address: EnterpriseRecord['addresses'][number]): KboAddress {
  return {
    street: address.streetNL ?? address.streetFR ?? '',
    houseNumber: address.houseNumber ?? '',
    postalZone: address.zipcode ?? '',
    city: address.municipalityNL ?? address.municipalityFR ?? '',
    country: address.countryNL ?? address.countryFR ?? 'BE',
  };
}

function mapEnterpriseToResult(enterprise: EnterpriseRecord): KboLookupResult {
  const nlDenomination = enterprise.denominations.find((d) => d.languageCode === 'NL');
  const name =
    nlDenomination?.denomination ??
    enterprise.denominations[0]?.denomination ??
    '';

  const contacts: KboContact[] = enterprise.contacts.map((c) => ({
    type: c.contactType.description,
    value: c.value,
  }));

  return {
    enterpriseNumber: enterprise.enterpriseNumber,
    name,
    addresses: enterprise.addresses.map(mapAddress),
    contacts,
    juridicalForm: enterprise.juridicalForm?.description,
    status: enterprise.KBOstatus?.description,
  };
}

export async function lookupByEnterpriseNumber(
  enterpriseNumber: string,
  databaseUrl?: string
): Promise<KboLookupResult | null> {
  const prisma = createKboClient(databaseUrl);
  const normalized = formatEnterpriseNumber(enterpriseNumber.replaceAll(/\s/g, ''));

  const enterprise = await prisma.enterprise.findUnique({
    where: { enterpriseNumber: normalized },
    include: enterpriseInclude,
  });

  if (!enterprise) return null;
  return mapEnterpriseToResult(enterprise as EnterpriseRecord);
}

export async function lookupByName(
  name: string,
  databaseUrl?: string
): Promise<KboLookupResult | null> {
  const prisma = createKboClient(databaseUrl);
  const search = name.trim();
  if (!search) return null;

  const findByMatch = async (mode: 'equals' | 'contains') => {
    const rows = await prisma.enterprise.findMany({
      where: {
        denominations: {
          some: {
            denomination: { [mode]: search, mode: 'insensitive' },
          },
        },
      },
      include: enterpriseInclude,
      take: 1,
    });
    return rows[0] ?? null;
  };

  const exact = await findByMatch('equals');
  const enterprise = exact ?? (await findByMatch('contains'));
  if (!enterprise) return null;
  return mapEnterpriseToResult(enterprise as EnterpriseRecord);
}

export async function lookupByVatNumber(
  countryCode: string,
  vatNumber: string,
  databaseUrl?: string
): Promise<KboLookupResult | null> {
  if (countryCode.toUpperCase() !== 'BE') return null;

  const digits = getBelgianEnterpriseNumberFromVat(vatNumber);
  if (!digits) return null;

  return lookupByEnterpriseNumber(formatEnterpriseNumber(digits), databaseUrl);
}
