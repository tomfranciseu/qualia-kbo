# Extraction checklist

This package was extracted from `monday2.0` into the standalone `qualia-kbo` repository.

## Repo ownership

| qualia-kbo | monday2.0 |
|---|---|
| Schema, migrations, ETL | Server actions, UI autofill |
| KBO Postgres + backups | `KBO_DATABASE_URL` (read-only) |
| Lookup service | VIES fallback |

## Publishing a new version

1. Bump `version` in `package.json`.
2. Update `CHANGELOG.md`.
3. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. In monday2.0, update the git dependency pin:

```json
"@qualia/kbo": "github:tomfranciseu/qualia-kbo#vX.Y.Z"
```

## Verification

```bash
rg '@/lib/db|@/prisma' .   # must return zero hits
npm run check:types
npm test
```
