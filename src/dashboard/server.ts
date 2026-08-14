import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import { countEnterprisesByNacePostalCode, listEnterprisesByNaceAndPostalCode, listEnterprisesByNaceCode } from '../activity';
import { checkKboDatabaseHealth, createKboClient, disconnectKboClient, getKboDatabaseLocation } from '../client';
import { fetchPublicConsultFinancials } from '../nbb/publicConsult';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dashboardRoot = path.join(packageRoot, 'dashboard');
const port = Number.parseInt(process.env.KBO_DASHBOARD_PORT ?? '4173', 10);
type NaceCode = { code: string; description: string };
let naceCodes: Record<string, NaceCode[]> | undefined;

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response: ServerResponse, value: unknown, statusCode = 200): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

function optionalParam(url: URL, name: string): string | undefined {
  return url.searchParams.get(name)?.trim() || undefined;
}

function requiredParam(url: URL, name: string): string {
  const value = optionalParam(url, name);
  if (!value) throw new Error(`Query parameter "${name}" is required.`);
  return value;
}

async function requestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const chunk of request) body += String(chunk);
  return JSON.parse(body || '{}') as Record<string, unknown>;
}

async function runFinancialReport(runId: string, input: { naceCode: string; naceVersion: string; classification?: string; postalCode: string; years: number[]; fields: string[] }): Promise<void> {
  const db = await createKboClient();
  const fieldMap: Record<string, string> = { revenue: 'revenue', 'net-result': 'netResult', employees: 'employeeCount', 'total-assets': 'totalAssets', equity: 'equity', cash: 'cashAndInvestments', 'financial-debt': 'financialDebt', receivables: 'tradeReceivables', payables: 'tradePayables', 'profit-margin': 'marginPercent', 'fixed-assets': 'fixedAssets', 'current-assets': 'currentAssets', 'current-liabilities': 'currentLiabilities', provisions: 'provisions', 'operating-result': 'operatingResult', depreciation: 'depreciation', 'retained-earnings': 'retainedEarnings' };
  try {
    const companies = await listEnterprisesByNaceAndPostalCode(input.naceCode, input.postalCode, { naceVersion: input.naceVersion, classification: input.classification });
    await db.run('UPDATE "DashboardReportRun" SET "status" = $1, "totalCompanies" = $2, "updatedAt" = current_timestamp WHERE "id" = $3', ['running', String(companies.length), runId]);
    let completed = 0;
    for (const company of companies) {
      try {
        const financials = await fetchPublicConsultFinancials(company.enterpriseNumber, input.years, fetch, { requestDelayMs: 750 });
        const entries = financials.years.length ? financials.years : [];
        if (entries.length === 0) {
          const data = Object.fromEntries(input.fields.map((field) => [fieldMap[field], null]));
          await db.run('INSERT INTO "DashboardReportRow" ("runId", "enterpriseNumber", "name", "postalCode", "fiscalYear", "status", "message", "data") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT ("runId", "enterpriseNumber", "fiscalYear") DO UPDATE SET "name" = excluded."name", "postalCode" = excluded."postalCode", "status" = excluded."status", "message" = excluded."message", "data" = excluded."data"', [runId, company.enterpriseNumber, company.name, company.postalCode, String(input.years[0]), 'no_account_for_year', 'NBB returned no published annual account for the selected fiscal years.', JSON.stringify(data)]);
        }
        for (const entry of entries) {
          const status = entry.error ? 'partial_financial_data' : 'ok';
          const data = Object.fromEntries(input.fields.map((field) => [fieldMap[field], entry[fieldMap[field] as keyof typeof entry] ?? null]));
          await db.run('INSERT INTO "DashboardReportRow" ("runId", "enterpriseNumber", "name", "postalCode", "fiscalYear", "status", "message", "data") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT ("runId", "enterpriseNumber", "fiscalYear") DO UPDATE SET "name" = excluded."name", "postalCode" = excluded."postalCode", "status" = excluded."status", "message" = excluded."message", "data" = excluded."data"', [runId, company.enterpriseNumber, company.name, company.postalCode, String(entry.fiscalYear), status, entry.error ?? null, JSON.stringify(data)]);
        }
      } catch (error) {
        await db.run('INSERT INTO "DashboardReportRow" ("runId", "enterpriseNumber", "name", "postalCode", "fiscalYear", "status", "message", "data") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT ("runId", "enterpriseNumber", "fiscalYear") DO UPDATE SET "name" = excluded."name", "postalCode" = excluded."postalCode", "status" = excluded."status", "message" = excluded."message", "data" = excluded."data"', [runId, company.enterpriseNumber, company.name, company.postalCode, String(input.years[0]), 'fetch_failed', error instanceof Error ? error.message : 'NBB retrieval failed.', '{}']);
      }
      completed += 1;
      await db.run('UPDATE "DashboardReportRun" SET "completedCompanies" = $1, "updatedAt" = current_timestamp WHERE "id" = $2', [String(completed), runId]);
    }
    await db.run('UPDATE "DashboardReportRun" SET "status" = $1, "updatedAt" = current_timestamp WHERE "id" = $2', ['completed', runId]);
  } catch (error) {
    await db.run('UPDATE "DashboardReportRun" SET "status" = $1, "message" = $2, "updatedAt" = current_timestamp WHERE "id" = $3', ['failed', error instanceof Error ? error.message : 'Report failed.', runId]);
  }
}

async function getNaceCodes(version: string): Promise<NaceCode[]> {
  if (!naceCodes) {
    const source = await readFile(path.join(packageRoot, 'data', 'code.csv'), 'utf8');
    const parsed = Papa.parse<{ Category: string; Code: string; Language: string; Description: string }>(source, { header: true, skipEmptyLines: true });
    naceCodes = {};
    for (const row of parsed.data) {
      const match = /^Nace(2003|2008|2025)$/.exec(row.Category);
      if (!match || row.Language !== 'NL') continue;
      (naceCodes[match[1]] ??= []).push({ code: row.Code, description: row.Description });
    }
  }
  return naceCodes[version] ?? [];
}

async function serveStatic(urlPath: string, response: ServerResponse): Promise<void> {
  const requestedPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = path.resolve(dashboardRoot, requestedPath);
  if (!target.startsWith(`${dashboardRoot}${path.sep}`)) {
    sendJson(response, { error: 'Not found.' }, 404);
    return;
  }

  try {
    const content = await readFile(target);
    response.writeHead(200, { 'content-type': contentTypes[path.extname(target)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    sendJson(response, { error: 'Not found.' }, 404);
  }
}

async function handleApi(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const naceCode = optionalParam(url, 'naceCode');
  const options = { naceVersion: optionalParam(url, 'naceVersion'), classification: optionalParam(url, 'classification') };

  if (url.pathname === '/api/health') {
    sendJson(response, { healthy: await checkKboDatabaseHealth(), databasePath: getKboDatabaseLocation() });
    return;
  }

  if (url.pathname === '/api/nace-codes') {
    const version = requiredParam(url, 'version');
    const search = optionalParam(url, 'search')?.toLowerCase() ?? '';
    const searchTerms = search.endsWith('en') ? [search, search.slice(0, -2)] : [search];
    const rows = (await getNaceCodes(version))
      .filter((row) => !search || searchTerms.some((term) => row.code.startsWith(term) || row.description.toLowerCase().includes(term)))
      .slice(0, 100);
    sendJson(response, { version, rows });
    return;
  }

  if (url.pathname === '/api/postcodes') {
    sendJson(response, { naceCode: requiredParam(url, 'naceCode'), rows: await countEnterprisesByNacePostalCode(requiredParam(url, 'naceCode'), options) });
    return;
  }

  if (url.pathname === '/api/enterprises') {
    const postalCode = optionalParam(url, 'postalCode');
    if (postalCode) {
      sendJson(response, { rows: await listEnterprisesByNaceAndPostalCode(requiredParam(url, 'naceCode'), postalCode, options) });
      return;
    }

    const limit = Math.min(Math.max(Number.parseInt(optionalParam(url, 'limit') ?? '100', 10) || 100, 1), 500);
    const result = await listEnterprisesByNaceCode(requiredParam(url, 'naceCode'), { ...options, limit });
    sendJson(response, result);
    return;
  }

  if (url.pathname === '/api/reports' && request.method === 'POST') {
    const input = await requestBody(request);
    const years = Array.isArray(input.years) ? input.years.map(Number).filter(Number.isInteger) : [];
    const naceCodeValue = typeof input.naceCode === 'string' ? input.naceCode.trim() : '';
    const naceVersion = typeof input.naceVersion === 'string' ? input.naceVersion.trim() : '';
    const postalCode = typeof input.postalCode === 'string' ? input.postalCode.trim() : '';
    const classification = typeof input.classification === 'string' ? input.classification.trim() : undefined;
    const fields = Array.isArray(input.fields) ? input.fields.filter((field): field is string => typeof field === 'string') : [];
    if (!naceCodeValue || !naceVersion || !postalCode || !years.length || !fields.length) throw new Error('Select a NACE activity, postal code, one or more fiscal years, and one or more fields.');
    const runId = randomUUID(); const db = await createKboClient();
    await db.run('INSERT INTO "DashboardReportRun" ("id", "createdAt", "updatedAt", "status", "naceCode", "naceVersion", "classification", "postalCode", "fiscalYears", "fields", "totalCompanies", "completedCompanies") VALUES ($1, current_timestamp, current_timestamp, $2, $3, $4, $5, $6, $7, $8, 0, 0)', [runId, 'queued', naceCodeValue, naceVersion, classification ?? null, postalCode, years.join(','), fields.join(',')]);
    void runFinancialReport(runId, { naceCode: naceCodeValue, naceVersion, classification, postalCode, years: [...new Set(years)].sort((a, b) => b - a), fields });
    sendJson(response, { id: runId, status: 'queued' }, 202); return;
  }

  if (url.pathname === '/api/reports' && request.method === 'GET') {
    const naceCodeValue = requiredParam(url, 'naceCode');
    const naceVersion = requiredParam(url, 'naceVersion');
    const postalCode = requiredParam(url, 'postalCode');
    const classification = optionalParam(url, 'classification') ?? null;
    const fiscalYears = requiredParam(url, 'fiscalYears');
    const fields = requiredParam(url, 'fields');
    const db = await createKboClient();
    const [run] = await db.all<Record<string, unknown>>('SELECT * FROM "DashboardReportRun" WHERE "naceCode" = $1 AND "naceVersion" = $2 AND COALESCE("classification", \'\') = COALESCE($3, \'\') AND "postalCode" = $4 AND "fiscalYears" = $5 AND "fields" = $6 ORDER BY "updatedAt" DESC LIMIT 1', [naceCodeValue, naceVersion, classification, postalCode, fiscalYears, fields]);
    if (!run) { sendJson(response, { run: null, rows: [] }); return; }
    const rows = await db.all<{ enterpriseNumber: string; name: string; postalCode: string; fiscalYear: number; status: string; message: string | null; data: string }>('SELECT * FROM "DashboardReportRow" WHERE "runId" = $1 ORDER BY "name", "fiscalYear" DESC', [String(run.id)]);
    sendJson(response, { run, rows: rows.map((row) => ({ ...row, data: JSON.parse(row.data) })) }); return;
  }

  const reportMatch = /^\/api\/reports\/([\w-]+)$/.exec(url.pathname);
  if (reportMatch && request.method === 'GET') {
    const db = await createKboClient(); const [run] = await db.all<Record<string, unknown>>('SELECT * FROM "DashboardReportRun" WHERE "id" = $1', [reportMatch[1]]);
    if (!run) { sendJson(response, { error: 'Report run not found.' }, 404); return; }
    const rows = await db.all<{ enterpriseNumber: string; name: string; postalCode: string; fiscalYear: number; status: string; message: string | null; data: string }>('SELECT * FROM "DashboardReportRow" WHERE "runId" = $1 ORDER BY "name", "fiscalYear" DESC', [reportMatch[1]]);
    sendJson(response, { run, rows: rows.map((row) => ({ ...row, data: JSON.parse(row.data) })) }); return;
  }

  sendJson(response, { error: 'Unknown API endpoint.' }, 404);
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(url, request, response);
    else await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, { error: error instanceof Error ? error.message : 'Unexpected server error.' }, 400);
  }
});

server.listen(port, () => {
  console.log(`KBO Navigator is running at http://localhost:${port}`);
  console.log('Use Ctrl+C to stop the dashboard.');
});

async function shutdown(): Promise<void> {
  server.close();
  await disconnectKboClient();
}

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });