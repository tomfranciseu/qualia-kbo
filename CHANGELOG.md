# Changelog

## 0.2.0

- NBB CBSO Authentic Data Query client: `fetchCompanyFinancials`, `checkNbbConfigured`
- Fetch last N fiscal years of revenue, net result, and computed margin from annual account rubrics
- Env: `NBB_CBSO_SUBSCRIPTION_KEY`, optional `NBB_CBSO_BASE_URL`

## 0.1.1

- Remove `.js` import extensions for Next.js `transpilePackages` compatibility

## 0.1.0

- Initial standalone release extracted from monday2.0
- Dedicated KBO Postgres schema and baseline migration
- ETL loaders ported from root `kbo/` scripts
- Lookup service: `lookupByEnterpriseNumber`, `lookupByName`, `lookupByVatNumber`
