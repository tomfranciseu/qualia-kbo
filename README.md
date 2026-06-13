# @qualia/kbo

Belgian KBO (Crossroads Bank for Enterprises) registry — standalone Postgres database, ETL loaders, and lookup service.

## Quickstart

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migrate:deploy
# Drop open-data CSVs into data/
npm run load:all
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `KBO_DATABASE_URL` | `postgresql://kbo:kbo@localhost:5434/kbo` | Postgres connection string |
| `KBO_POSTGRES_PORT` | `5434` | Host port for docker-compose |
| `NBB_CBSO_SUBSCRIPTION_KEY` | — | NBB CBSO API subscription key (annual accounts) |
| `NBB_CBSO_BASE_URL` | `https://ws.cbso.nbb.be` | NBB CBSO API base URL (UAT: `https://ws.uat2.cbso.nbb.be`) |

## Scripts

| Script | Description |
|---|---|
| `npm run migrate:deploy` | Apply Prisma migrations |
| `npm run load:all` | Full ETL pipeline (add `--upsert` for upsert mode) |
| `npm run check:types` | TypeScript check |
| `npm test` | Vitest unit tests |

## Consumption from monday2.0

```json
"@qualia/kbo": "github:tomfranciseu/qualia-kbo#v0.1.0"
```

Set `KBO_DATABASE_URL` on the app runtime for Belgian VAT autofill from local KBO data. Without it, the app falls back to VIES.

### NBB annual accounts (financials)

```typescript
import { fetchCompanyFinancials, checkNbbConfigured } from '@qualia/kbo';

if (checkNbbConfigured()) {
  const financials = await fetchCompanyFinancials('0123456789', { years: 5 });
  // financials.years[].revenue, netResult, marginPercent
}
```

Set `NBB_CBSO_SUBSCRIPTION_KEY` from the [NBB developer portal](https://developer.cbso.nbb.be).

## Production operations (deferred)

1. Provision a dedicated KBO Postgres instance.
2. `npm run migrate:deploy && npm run load:all` after downloading fresh KBO open data.
3. Set `KBO_DATABASE_URL` on the Qualia app server.
4. Before dropping the `kbo` schema from the Qualia DB, migrate any existing data into this database.
