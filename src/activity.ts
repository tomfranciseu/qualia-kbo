import { createKboClient } from './client';
import { Prisma } from './generated/prisma/client';

export type ListEnterprisesByNaceOptions = {
  /** NACE nomenclature version, e.g. "2008" or "2025". Omit to match any version. */
  naceVersion?: string;
  /** e.g. "MAIN" for primary activity only. */
  classification?: string;
  limit?: number;
  offset?: number;
  databaseUrl?: string;
};

export type KboNaceEnterpriseHit = {
  enterpriseNumber: string;
  name: string;
  city?: string;
  status?: string;
  juridicalForm?: string;
  naceCodes: string[];
  classifications: string[];
};

export type ListEnterprisesByNaceResult = {
  enterprises: KboNaceEnterpriseHit[];
  total: number;
};

type EnterpriseHitRow = {
  enterpriseNumber: string;
};

/**
 * List distinct enterprises that have (or whose establishments have) the given NACE-BEL code.
 * Entity numbers in KBO are dotted (`XXXX.XXX.XXX` / `X.XXX.XXX.XXX`); no digit stripping needed.
 */
export async function listEnterprisesByNaceCode(
  naceCode: string,
  options: ListEnterprisesByNaceOptions = {},
): Promise<ListEnterprisesByNaceResult> {
  const code = naceCode.trim();
  if (!code) {
    return { enterprises: [], total: 0 };
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const naceVersion = options.naceVersion?.trim() || null;
  const classification = options.classification?.trim() || null;

  const prisma = createKboClient(options.databaseUrl);

  const [hits, countRows] = await Promise.all([
    prisma.$queryRaw<EnterpriseHitRow[]>`
      WITH enterprise_hits AS (
        SELECT DISTINCT a."enterpriseId" AS "enterpriseNumber"
        FROM kbo."Activity" a
        WHERE a."naceCode" = ${code}
          AND a."enterpriseId" IS NOT NULL
          AND (${naceVersion}::text IS NULL OR a."naceVersion" = ${naceVersion})
          AND (${classification}::text IS NULL OR a."classification" = ${classification})

        UNION

        SELECT DISTINCT est."enterpriseNumber"
        FROM kbo."Activity" a
        JOIN kbo."Establishment" est
          ON est."establishmentNumber" = a."establishmentId"
        WHERE a."naceCode" = ${code}
          AND a."establishmentId" IS NOT NULL
          AND (${naceVersion}::text IS NULL OR a."naceVersion" = ${naceVersion})
          AND (${classification}::text IS NULL OR a."classification" = ${classification})
      )
      SELECT "enterpriseNumber" FROM enterprise_hits
      ORDER BY "enterpriseNumber"
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      WITH enterprise_hits AS (
        SELECT DISTINCT a."enterpriseId" AS "enterpriseNumber"
        FROM kbo."Activity" a
        WHERE a."naceCode" = ${code}
          AND a."enterpriseId" IS NOT NULL
          AND (${naceVersion}::text IS NULL OR a."naceVersion" = ${naceVersion})
          AND (${classification}::text IS NULL OR a."classification" = ${classification})

        UNION

        SELECT DISTINCT est."enterpriseNumber"
        FROM kbo."Activity" a
        JOIN kbo."Establishment" est
          ON est."establishmentNumber" = a."establishmentId"
        WHERE a."naceCode" = ${code}
          AND a."establishmentId" IS NOT NULL
          AND (${naceVersion}::text IS NULL OR a."naceVersion" = ${naceVersion})
          AND (${classification}::text IS NULL OR a."classification" = ${classification})
      )
      SELECT COUNT(*)::bigint AS total FROM enterprise_hits
    `,
  ]);

  const total = Number(countRows[0]?.total ?? 0n);
  if (hits.length === 0) {
    return { enterprises: [], total };
  }

  const enterpriseNumbers = hits.map((h: EnterpriseHitRow) => h.enterpriseNumber);

  const activitySelect = {
    where: {
      naceCode: code,
      ...(naceVersion ? { naceVersion } : {}),
      ...(classification ? { classification } : {}),
    },
    select: { naceCode: true, classification: true },
  } as const;

  const enterprises = await prisma.enterprise.findMany({
    where: { enterpriseNumber: { in: enterpriseNumbers } },
    include: {
      denominations: true,
      addresses: { take: 1 },
      KBOstatus: true,
      juridicalForm: true,
      activities: activitySelect,
      establishments: {
        select: {
          activities: activitySelect,
        },
      },
    },
  });

  type EnterpriseWithActivities = (typeof enterprises)[number];
  const byNumber = new Map<string, EnterpriseWithActivities>(
    enterprises.map((e: EnterpriseWithActivities) => [e.enterpriseNumber, e]),
  );

  return {
    total,
    enterprises: enterpriseNumbers.flatMap((enterpriseNumber: string) => {
      const enterprise = byNumber.get(enterpriseNumber);
      if (!enterprise) return [];

      const nlDenomination = enterprise.denominations.find(
        (d: { languageCode: string; denomination: string }) => d.languageCode === 'NL',
      );
      const name =
        nlDenomination?.denomination ??
        enterprise.denominations[0]?.denomination ??
        '';
      const address = enterprise.addresses[0];
      const activityRows = [
        ...enterprise.activities,
        ...enterprise.establishments.flatMap(
          (est: { activities: Array<{ naceCode: string; classification: string }> }) =>
            est.activities,
        ),
      ];
      const naceCodes = [...new Set(activityRows.map((a) => a.naceCode))];
      const classifications = [...new Set(activityRows.map((a) => a.classification))];

      return [
        {
          enterpriseNumber: enterprise.enterpriseNumber,
          name,
          city: address?.municipalityNL ?? address?.municipalityFR ?? undefined,
          status: enterprise.KBOstatus?.description,
          juridicalForm: enterprise.juridicalForm?.description,
          naceCodes: naceCodes.length > 0 ? naceCodes : [code],
          classifications,
        } satisfies KboNaceEnterpriseHit,
      ];
    }),
  };
}

/** Exported for tests — builds Activity where clause filters. */
export function buildNaceActivityWhere(
  naceCode: string,
  options: Pick<ListEnterprisesByNaceOptions, 'naceVersion' | 'classification'> = {},
): Prisma.ActivityWhereInput {
  return {
    naceCode: naceCode.trim(),
    ...(options.naceVersion?.trim() ? { naceVersion: options.naceVersion.trim() } : {}),
    ...(options.classification?.trim()
      ? { classification: options.classification.trim() }
      : {}),
  };
}
