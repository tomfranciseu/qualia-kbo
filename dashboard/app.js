const $ = (selector) => document.querySelector(selector);
const state = { postcodes: [], companies: [], companySort: 'none', financialRows: [], naceCodes: [], reportRun: null, localReportRows: [], reportColumns: [], reportView: 'rows', pivotValue: 'revenue', pivotNaceCode: '', pivotPostalCode: '', workspaceTab: 'scope', loadedReportSelection: null, selectedPostalCode: '', postcodeTotal: 0 };
const number = new Intl.NumberFormat('en-BE');
const currency = new Intl.NumberFormat('en-BE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
let naceSearchTimer;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const csvNumber = (value) => { const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; };
const formatMoney = (value) => value === null || value === undefined ? '—' : currency.format(value);
const formatDate = (value) => { if (!value) return '—'; const date = new Date(`${String(value).slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat('nl-BE').format(date); };
const reportFieldLabels = { revenue: 'Revenue', netResult: 'Net profit/loss', employeeCount: 'Employees (FTE)', totalAssets: 'Total assets', equity: 'Equity', cashAndInvestments: 'Cash & investments', financialDebt: 'Financial debt', tradeReceivables: 'Trade receivables', tradePayables: 'Trade payables', marginPercent: 'Net profit margin', fixedAssets: 'Fixed assets', currentAssets: 'Current assets', currentLiabilities: 'Current liabilities', provisions: 'Provisions and deferred taxes', operatingResult: 'Operating result', depreciation: 'Depreciation and impairments', retainedEarnings: 'Retained earnings', insuranceInvestments: 'Insurance investments', unitLinkedInvestments: 'Unit-linked investments', technicalProvisions: 'Technical provisions', lifeTechnicalProvisions: 'Life technical provisions', claimsProvisions: 'Claims provisions', reinsuranceShareTechnicalProvisions: 'Reinsurance share of technical provisions', insuranceReceivables: 'Insurance receivables', reinsuranceDeposits: 'Deposits received from reinsurers' };
const insuranceReportFields = new Set(['insuranceInvestments', 'unitLinkedInvestments', 'technicalProvisions', 'lifeTechnicalProvisions', 'claimsProvisions', 'reinsuranceShareTechnicalProvisions', 'insuranceReceivables', 'reinsuranceDeposits']);
const dashboardStateKey = 'qualia-kbo-dashboard-selections';

function saveDashboardSelections() {
  const saved = { naceVersion: $('#naceVersion').value, naceCode: $('#naceCode').value, classification: $('#classification').value, reportPostalCode: $('#reportPostalCode').value, historyYears: selectedHistoryYears(), fields: selectedFinancialFields() };
  localStorage.setItem(dashboardStateKey, JSON.stringify(saved));
}

function loadDashboardSelections() {
  try { return JSON.parse(localStorage.getItem(dashboardStateKey) || '{}'); } catch { return {}; }
}

function selection() { return { naceCode: $('#naceCode').value.trim(), naceVersion: $('#naceVersion').value, classification: $('#classification').value, postalCode: state.selectedPostalCode }; }
async function setWorkspaceTab(tab) { state.workspaceTab = tab; const results = tab === 'results'; $('.filter-card').classList.toggle('hidden', results); $('#kboSection').classList.toggle('hidden', results || !state.postcodes.length); $('#companiesSection').classList.toggle('hidden', !results && !state.companies.length); $('#scopeCompanyHeading').classList.toggle('hidden', results); $('#reportScopeTab').classList.toggle('hidden', results); $('#reportResultsTab').classList.toggle('hidden', !results); document.querySelectorAll('[data-workspace-tab]').forEach((button) => { const active = button.dataset.workspaceTab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); }); const activeReport = typeof state.reportRun === 'string' || state.reportRun?.status === 'queued' || state.reportRun?.status === 'running'; if (results && !activeReport) await loadAllStoredReports(); }
function query(params) { const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value)); return `/api/${params.endpoint}?${search}`; }
async function getJson(url) {
  let response;
  try { response = await fetch(url); } catch { throw new Error('The local dashboard server is unreachable. Keep `npm run dashboard` running, then refresh this page.'); }
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
}
function metric(label, value, hint = '') { return `<div class="metric"><p>${label}</p><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`; }
function bars(target, rows, label, value, formatter = number.format, onSelect) { const maximum = Math.max(...rows.map(value), 1); const chart = $(target); chart.innerHTML = rows.length ? rows.map((row) => `<div class="bar${onSelect ? ' selectable-bar' : ''}"${onSelect ? ` role="button" tabindex="0" data-value="${escapeHtml(label(row))}" aria-label="Analyse postal code ${escapeHtml(label(row))}"` : ''}><span class="bar-label" title="${escapeHtml(label(row))}">${escapeHtml(label(row))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, value(row) / maximum * 100)}%"></div></div><span class="bar-value">${formatter(value(row))}</span></div>`).join('') : '<p class="empty">No matching records.</p>';
  chart.onclick = onSelect ? (event) => { const bar = event.target.closest('[data-value]'); if (bar) onSelect(bar.dataset.value); } : null;
  chart.onkeydown = onSelect ? (event) => { if (event.key !== 'Enter' && event.key !== ' ') return; const bar = event.target.closest('[data-value]'); if (bar) { event.preventDefault(); onSelect(bar.dataset.value); } } : null;
}

function filteredPostcodes() {
  const term = $('#postcodeSearch')?.value.trim().toLowerCase() ?? '';
  const minimum = Math.max(1, Number($('#postcodeMinCount')?.value) || 1);
  const sort = $('#postcodeSort')?.value || 'count-desc';
  const rows = state.postcodes.filter((row) => row.postalCode !== 'Unknown' && row.enterpriseCount >= minimum && (!term || row.postalCode.toLowerCase().includes(term)));
  rows.sort((left, right) => {
    if (sort === 'count-asc') return left.enterpriseCount - right.enterpriseCount || left.postalCode.localeCompare(right.postalCode);
    if (sort === 'code-asc') return left.postalCode.localeCompare(right.postalCode);
    if (sort === 'code-desc') return right.postalCode.localeCompare(left.postalCode);
    return right.enterpriseCount - left.enterpriseCount || left.postalCode.localeCompare(right.postalCode);
  });
  return rows;
}

function renderPostcodePivot() {
  const rows = filteredPostcodes();
  const total = state.postcodeTotal || 1;
  $('#postcodePivotCount').textContent = `${number.format(rows.length)} shown`;
  $('#postcodePivotRows').innerHTML = rows.length
    ? rows.map((row) => {
      const share = (row.enterpriseCount / total) * 100;
      const selected = row.postalCode === state.selectedPostalCode ? ' class="selected-row"' : '';
      return `<tr${selected} data-postal="${escapeHtml(row.postalCode)}"><td>${escapeHtml(row.postalCode)}</td><td>${number.format(row.enterpriseCount)}</td><td>${share.toFixed(1)}%</td><td><button type="button" class="ghost row-action" data-postal="${escapeHtml(row.postalCode)}">Analyse</button></td></tr>`;
    }).join('')
    : '<tr><td colspan="4">No postal codes match the current filters.</td></tr>';
}

async function loadNaceCodes(search = '') {
  const version = $('#naceVersion').value;
  if (!version) return;
  const data = await getJson(query({ endpoint: 'nace-codes', version, search }));
  state.naceCodes = data.rows;
  const current = $('#naceCode').value;
  const options = data.rows.map((row) => `<option value="${escapeHtml(row.code)}">${escapeHtml(row.code)} · ${escapeHtml(row.description)}</option>`).join('');
  $('#naceCodeSelect').innerHTML = `<option value="">Select from matching activities</option>${options}`;
  $('#naceCodeSelect').value = current;
  $('#naceCodeSelect').classList.toggle('hidden', !search.trim());
  $('#naceCode').value = current;
  updateNaceDescription();
}

function updateNaceDescription() {
  const code = $('#naceCode').value;
  const match = state.naceCodes.find((row) => row.code === code);
  $('#naceDescription').textContent = match ? match.description : code ? 'Search or enter an activity code from the selected NACE version.' : 'Start typing a code or activity name.';
  return match?.description;
}

async function selectVersion() {
  const version = $('#naceVersion').value;
  $('#naceCode').value = '';
  $('#naceCode').disabled = !version;
  $('#naceCodeSelect').disabled = !version;
  $('#naceDescription').textContent = version ? 'Loading activity codes…' : 'Choose a NACE version to search its activity codes.';
  state.naceCodes = [];
  if (version) await loadNaceCodes();
}

async function checkHealth() {
  try { const health = await getJson('/api/health'); $('#connection').classList.toggle('ready', health.healthy); $('#connection').lastElementChild.textContent = health.healthy ? 'Local DuckDB connected' : 'Database not loaded'; } catch { $('#connection').lastElementChild.textContent = 'Database unavailable'; }
}

async function analyse() {
  const filters = selection();
  if (!filters.naceVersion || !filters.naceCode) { $('#naceDescription').textContent = 'Select a NACE version and an activity code before analysing.'; return; }
  $('#analyse').textContent = 'Loading…';
  try {
    state.selectedPostalCode = '';
    $('#reportPostalCode').value = '';
    filters.postalCode = '';
    if (!state.naceCodes.some((row) => row.code === filters.naceCode)) await loadNaceCodes(filters.naceCode);
    const description = updateNaceDescription();
    const data = await getJson(query({ endpoint: 'postcodes', ...filters }));
    state.postcodes = data.rows;
    $('#kboSection').classList.remove('hidden');
    $('#selectionTitle').textContent = description ? `${filters.naceCode} · ${description}` : `NACE ${filters.naceCode} market footprint`;
    $('#selectionDescription').textContent = `NACE-BEL ${filters.naceVersion} · ${filters.classification || 'all activity classifications'}`;
    const total = data.rows.reduce((sum, row) => sum + row.enterpriseCount, 0);
    const missingPostcode = data.rows.find((row) => row.postalCode === 'Unknown')?.enterpriseCount ?? 0;
    const postcodeRows = data.rows.filter((row) => row.postalCode !== 'Unknown');
    const mappedTotal = total - missingPostcode;
    state.postcodeTotal = total;
    const top = [...postcodeRows].sort((a, b) => b.enterpriseCount - a.enterpriseCount);
    const largest = top[0]; const share = total ? (largest?.enterpriseCount ?? 0) / total * 100 : 0;
    $('#kboMetrics').innerHTML = metric('Distinct enterprises', number.format(total), description || `NACE ${filters.naceCode}`) + metric('Postal-code markets', number.format(postcodeRows.length), `${number.format(mappedTotal)} with postcode`) + metric('No registered-office postcode', number.format(missingPostcode), missingPostcode ? 'Excluded from map' : 'All enterprises mapped') + metric('Largest postcode', largest?.postalCode ?? '—', largest ? `${number.format(largest.enterpriseCount)} enterprises` : 'No mapped addresses');
    renderPostcodePivot();
    $('#marketInsight').innerHTML = largest ? `<strong>${escapeHtml(largest.postalCode)}</strong> is the largest mapped pocket, with <strong>${number.format(largest.enterpriseCount)} enterprises</strong>. Filter the pivot table to isolate a NACE × postal-code combination, then analyse it. ${missingPostcode ? `<strong>${number.format(missingPostcode)}</strong> have no KBO registered-office address and are excluded.` : ''}` : 'No registered enterprises with a mapped registered-office postcode were found.';
    $('#coverageRing').style.setProperty('--progress', `${share}%`); $('#coverageRing span').textContent = `${share.toFixed(0)}%`;
    updateReportCommand();
  } catch (error) { alert(error.message); } finally { $('#analyse').innerHTML = 'Analyse KBO data <span>→</span>'; }
}

function selectPostcodeForAnalysis(postalCode) {
  state.selectedPostalCode = postalCode;
  $('#reportPostalCode').value = postalCode;
  renderPostcodePivot();
  updateReportCommand();
  void loadCompanies();
  $('#companiesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadCompanies() {
  const filters = selection();
  $('#companiesSection').classList.remove('hidden');
  $('#companySubtitle').textContent = filters.postalCode ? `NACE ${filters.naceCode} · registered office ${filters.postalCode}` : 'Showing the first 500 matching enterprises across all postcodes.';
  $('#companyRows').innerHTML = '<tr><td colspan="7">Loading enterprises…</td></tr>';
  try {
    const data = await getJson(query({ endpoint: 'enterprises', ...filters, limit: 500 }));
    state.companies = data.rows ?? data.enterprises ?? [];
    $('#companyCount').textContent = data.total ? `${number.format(data.total)} total` : `${number.format(state.companies.length)} shown`;
    renderCompanies();
  } catch (error) { $('#companyRows').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`; }
}
function renderCompanies() { const term = $('#companySearch').value.trim().toLowerCase(); const rows = state.companies.filter((row) => `${row.name} ${row.enterpriseNumber}`.toLowerCase().includes(term)); if (state.companySort !== 'none') rows.sort((left, right) => (left.name || '').localeCompare(right.name || '', 'nl-BE', { sensitivity: 'base' }) * (state.companySort === 'ascending' ? 1 : -1)); $('#enterpriseHeader').setAttribute('aria-sort', state.companySort); $('#sortEnterprises').innerHTML = `Enterprise <span aria-hidden="true">${state.companySort === 'ascending' ? '↑' : state.companySort === 'descending' ? '↓' : '↕'}</span>`; $('#companyRows').innerHTML = rows.length ? rows.map((row) => `<tr><td>${escapeHtml(row.name || '—')}</td><td>${escapeHtml(row.enterpriseNumber)}</td><td>${escapeHtml(row.postalCode || row.city || '—')}</td><td>${escapeHtml(row.status || '—')}</td><td>${escapeHtml(row.juridicalSituation || '—')}</td><td>${formatDate(row.startDate)}</td><td>${escapeHtml(row.juridicalForm || '—')}</td></tr>`).join('') : '<tr><td colspan="7">No enterprises match the search.</td></tr>'; }

function renderHistoryYears() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2022 + 1 }, (_, index) => currentYear - index);
  $('#historyOptions').innerHTML = years.map((year) => `<label><input type="checkbox" value="${year}" checked> ${year}</label>`).join('');
  $('#historyOptions').querySelectorAll('input').forEach((input) => input.addEventListener('change', updateReportCommand));
  updateReportCommand();
}

function selectedHistoryYears() { return [...$('#historyOptions').querySelectorAll('input:checked')].map((input) => Number(input.value)).sort((left, right) => right - left); }
function selectedFinancialFields() { return [...document.querySelectorAll('#fieldOptions input:checked, #advancedFieldOptions input:checked')].map((input) => input.value); }
function updateReportCommand() {
  const filters = selection(); const postalCode = $('#reportPostalCode').value.trim();
  const years = selectedHistoryYears(); const fields = selectedFinancialFields();
  const enterpriseCount = state.postcodes.find((row) => row.postalCode === postalCode)?.enterpriseCount;
  $('#historySummary').textContent = years.length ? years.join(', ') : 'No years selected';
  $('#fieldSummary').textContent = `${fields.length} selected`;
  const canBuild = Boolean(filters.naceCode && filters.naceVersion && postalCode && years.length && fields.length);
  $('#reportCommand').textContent = canBuild ? `Ready: ${filters.naceCode} · ${postalCode} · ${enterpriseCount === undefined ? '—' : number.format(enterpriseCount)} enterprises · ${years.join(', ')} · ${fields.length} account fields` : 'Select a NACE activity, postal code, fiscal years, and account fields to enable the run.';
  $('#reportSelectionSummary').textContent = filters.naceCode && postalCode ? `NACE ${filters.naceCode} · postal code ${postalCode} · ${enterpriseCount === undefined ? '—' : number.format(enterpriseCount)} enterprises · ${years.length} fiscal years · ${fields.length} account fields` : 'Select a NACE activity and postal code to prepare this report.';
  $('#runReport').disabled = !canBuild;
  $('#resetReport').disabled = !canBuild;
  $('#reportBuilderHint').textContent = canBuild ? `Requests ${years.length} fiscal year${years.length === 1 ? '' : 's'} and stores results in local DuckDB. Public NBB calls are made one at a time.` : 'The report run becomes available once all required selections are made.';
  if (canBuild) void loadStoredReport(filters, postalCode, years, fields);
}

async function runReport(reset = false) {
  const filters = selection(); const payload = { ...filters, postalCode: $('#reportPostalCode').value.trim(), years: selectedHistoryYears(), fields: selectedFinancialFields(), reset };
  $('#runReport').disabled = true; $('#resetReport').disabled = true; $('#runReport').textContent = reset ? 'Resetting…' : 'Starting…';
  try { const response = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not start the NBB report.'); state.reportRun = result.id; state.loadedReportSelection = null; await setWorkspaceTab('results'); void pollReport(); } catch (error) { $('#reportBuilderHint').textContent = error.message; $('#runReport').disabled = false; $('#resetReport').disabled = false; } finally { $('#runReport').textContent = 'Run NBB report'; }
}

function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function exportLocalReport() { const rows = state.localReportRows; const excluded = ['currency', 'error', 'referenceNumber', 'depositDate', 'fiscalYear', 'kboStatus', 'juridicalSituation', 'startDate', 'juridicalForm']; const fields = [...new Set(rows.flatMap((row) => Object.keys(row.data).filter((key) => !excluded.includes(key))))]; const header = ['Enterprise number','Company','Postal code','KBO status','Legal situation','Start date','Legal form','Fiscal year','NBB status',...fields]; const csv = [header, ...rows.map((row) => [row.enterpriseNumber,row.name,row.postalCode,row.data.kboStatus,row.data.juridicalSituation,row.data.startDate,row.data.juridicalForm,row.fiscalYear,row.status,...fields.map((field) => row.data[field])])].map((row) => row.map(csvCell).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type:'text/csv;charset=utf-8' })); const link=document.createElement('a'); link.href=url; link.download='kbo-nbb-report.csv'; link.click(); URL.revokeObjectURL(url); }
function reportDataFields(rows) { return [...new Set(rows.flatMap((row) => Object.keys(row.data).filter((key) => key in reportFieldLabels)))].filter((field) => !insuranceReportFields.has(field) || rows.some((row) => row.data[field] !== null && row.data[field] !== undefined)); }
function formatReportValue(field, value) { if (value === null || value === undefined) return '—'; const formatted = field === 'employeeCount' || field === 'marginPercent' ? number.format(value) : formatMoney(value); return Number(value) < 0 ? `<span class="negative-value">${formatted}</span>` : formatted; }
function renderLocalReport() {
  const rows = state.localReportRows; const available = reportDataFields(rows);
  if (!state.reportColumns.length) state.reportColumns = available;
  state.reportColumns = state.reportColumns.filter((field) => available.includes(field));
  $('#reportColumnOptions').innerHTML = available.map((field) => `<label><input type="checkbox" value="${field}" ${state.reportColumns.includes(field) ? 'checked' : ''}> ${reportFieldLabels[field]}</label>`).join('');
  $('#reportColumnOptions').querySelectorAll('input').forEach((input) => input.addEventListener('change', () => { state.reportColumns = [...$('#reportColumnOptions').querySelectorAll('input:checked')].map((item) => item.value); renderLocalReport(); }));
  $('#pivotValue').innerHTML = available.map((field) => `<option value="${field}">${reportFieldLabels[field]}</option>`).join('');
  if (!available.includes(state.pivotValue)) state.pivotValue = available[0] ?? 'revenue'; $('#pivotValue').value = state.pivotValue;
  const pivot = state.reportView === 'pivot'; $('#pivotValueLabel').classList.toggle('hidden', !pivot); $('#pivotNaceLabel').classList.remove('hidden'); $('#pivotPostalLabel').classList.remove('hidden'); $('#pivotFilterHint').classList.remove('hidden');
  const processedRows = rows.filter((row) => row.status === 'ok');
  const naceCandidates = state.pivotPostalCode ? processedRows.filter((row) => row.postalCode === state.pivotPostalCode) : processedRows;
  const naceCodes = [...new Set(naceCandidates.map((row) => row.naceCode).filter(Boolean))].sort();
  if (state.pivotNaceCode && !naceCodes.includes(state.pivotNaceCode)) state.pivotNaceCode = '';
  $('#pivotNaceCode').innerHTML = `<option value="">All NACE scopes</option>${naceCodes.map((naceCode) => `<option value="${escapeHtml(naceCode)}">${escapeHtml(naceCode)}</option>`).join('')}`;
  $('#pivotNaceCode').value = state.pivotNaceCode;
  const postalCandidates = state.pivotNaceCode ? processedRows.filter((row) => row.naceCode === state.pivotNaceCode) : processedRows;
  const postcodes = [...new Set(postalCandidates.map((row) => row.postalCode).filter(Boolean))].sort();
  if (state.pivotPostalCode && !postcodes.includes(state.pivotPostalCode)) state.pivotPostalCode = '';
  $('#pivotPostalCode').innerHTML = `<option value="">All processed postcodes</option>${postcodes.map((postalCode) => `<option value="${escapeHtml(postalCode)}">${escapeHtml(postalCode)}</option>`).join('')}`;
  $('#pivotPostalCode').value = state.pivotPostalCode;
  const filteredRows = processedRows.filter((row) => (!state.pivotNaceCode || row.naceCode === state.pivotNaceCode) && (!state.pivotPostalCode || row.postalCode === state.pivotPostalCode));
  if (pivot) {
    const pivotRows = filteredRows;
    const years = [...new Set(pivotRows.map((row) => row.fiscalYear))].sort((a, b) => b - a); const companies = new Map();
    pivotRows.forEach((row) => { const company = companies.get(row.enterpriseNumber) ?? { name: row.name, enterpriseNumber: row.enterpriseNumber, values: {} }; company.values[row.fiscalYear] = row.data[state.pivotValue]; companies.set(row.enterpriseNumber, company); });
    $('#localReportHead').innerHTML = `<tr><th>Company</th><th>Enterprise number</th>${years.map((year) => `<th>${year}</th>`).join('')}</tr>`;
    $('#localReportRows').innerHTML = [...companies.values()].map((company) => `<tr><td>${escapeHtml(company.name)}</td><td>${escapeHtml(company.enterpriseNumber)}</td>${years.map((year) => `<td>${formatReportValue(state.pivotValue, company.values[year])}</td>`).join('')}</tr>`).join('') || '<tr><td>No results available.</td></tr>';
  } else {
    $('#localReportHead').innerHTML = `<tr><th>Company</th><th>Enterprise number</th><th>Postal code</th><th>KBO status</th><th>Legal situation</th><th>Start date</th><th>Legal form</th><th>Year</th>${state.reportColumns.map((field) => `<th>${reportFieldLabels[field]}</th>`).join('')}<th>NBB status</th><th>Message</th></tr>`;
    $('#localReportRows').innerHTML = filteredRows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.enterpriseNumber)}</td><td>${escapeHtml(row.postalCode)}</td><td>${escapeHtml(row.data.kboStatus || '—')}</td><td>${escapeHtml(row.data.juridicalSituation || '—')}</td><td>${formatDate(row.data.startDate)}</td><td>${escapeHtml(row.data.juridicalForm || '—')}</td><td>${row.fiscalYear}</td>${state.reportColumns.map((field) => `<td>${formatReportValue(field, row.data[field])}</td>`).join('')}<td><span class="status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>${escapeHtml(row.message || '—')}</td></tr>`).join('') || '<tr><td colspan="12">No NBB-processed results match the filters.</td></tr>';
  }
}
function showLocalReport(data, stored = false) { state.localReportRows = data.rows.map((row) => ({ ...row, naceCode: data.run.naceCode })); state.reportRun = data.run; state.reportColumns = []; const active = data.run.status === 'queued' || data.run.status === 'running'; if (active) { $('#runReport').disabled = true; $('#resetReport').disabled = true; $('#runReport').textContent = data.run.status === 'queued' ? 'Queued…' : `Running… ${data.run.completedCompanies || 0}/${data.run.totalCompanies || '—'}`; } $('#runProgress').textContent = stored ? `Saved ${data.run.status} report · ${data.rows.length} rows` : `${data.run.status} · ${data.run.completedCompanies || 0} / ${data.run.totalCompanies || 0} companies`; $('#reportResultSelection').textContent = `NACE ${data.run.naceCode} · ${data.run.postalCode} · ${data.run.totalCompanies || '—'} enterprises`; $('#exportLocalReport').disabled = !data.rows.length; renderLocalReport(); }
async function loadAllStoredReports() { try { const data = await getJson('/api/reports?all=true'); state.localReportRows = data.rows; state.reportRun = null; state.reportColumns = []; $('#runProgress').textContent = `${data.rows.length} stored NBB result rows`; $('#reportResultSelection').textContent = 'All completed reports · use Result NACE scope and Result postal code to analyse a subset.'; $('#exportLocalReport').disabled = !data.rows.length; renderLocalReport(); } catch (error) { $('#runProgress').textContent = error.message; } }
async function loadStoredReport(filters, postalCode, years, fields) { const selectionKey = JSON.stringify({ ...filters, postalCode, years, fields }); if (selectionKey === state.loadedReportSelection) return; state.loadedReportSelection = selectionKey; try { const data = await getJson(query({ endpoint: 'reports', naceCode: filters.naceCode, naceVersion: filters.naceVersion, classification: filters.classification, postalCode, fiscalYears: years.join(','), fields: fields.join(',') })); if (selectionKey !== state.loadedReportSelection || !data.run) return; showLocalReport(data, true); if (data.run.status === 'queued' || data.run.status === 'running') pollReport(); } catch { /* The report builder remains usable if a saved-report lookup fails. */ } }
async function pollReport() { if (!state.reportRun) return; try { const runId = typeof state.reportRun === 'string' ? state.reportRun : state.reportRun.id; const data = await getJson(`/api/reports/${runId}`); showLocalReport(data); if (data.run.status === 'queued' || data.run.status === 'running') setTimeout(pollReport, 1500); else updateReportCommand(); } catch (error) { $('#runProgress').textContent = error.message; updateReportCommand(); } }

function parseCsv(text) { const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean); const split = (line) => { const values=[]; let value=''; let quote=false; for (let index=0; index<line.length; index += 1) { const char=line[index]; if (char === '"' && line[index + 1] === '"' && quote) { value += '"'; index += 1; } else if (char === '"') quote = !quote; else if (char === ',' && !quote) { values.push(value); value=''; } else value += char; } values.push(value); return values; }; const header = split(lines.shift() || ''); return lines.map((line) => Object.fromEntries(split(line).map((value, index) => [header[index], value]))); }
function loadFinancialFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { state.financialRows = parseCsv(reader.result).map((row) => ({ ...row, revenue: csvNumber(row['Revenue EUR']), netResult: csvNumber(row['Net profit/loss EUR']), fte: csvNumber(row['Total employees FTE']) })); $('#reportName').textContent = file.name; $('#nbbDashboard').classList.remove('hidden'); renderFinancials(); }; reader.readAsText(file); }
function renderFinancials() {
  const status = $('#financialStatus').value; const minimum = csvNumber($('#minRevenue').value) ?? 0; const profitable = $('#profitableOnly').checked;
  const rows = state.financialRows.filter((row) => (!status || row['Financial data status'] === status) && (row.revenue ?? -1) >= minimum && (!profitable || (row.netResult ?? 0) > 0));
  const complete = rows.filter((row) => row['Financial data status'] === 'ok').length; const revenue = rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0); const profit = rows.reduce((sum, row) => sum + (row.netResult ?? 0), 0); const fte = rows.reduce((sum, row) => sum + (row.fte ?? 0), 0); const quality = rows.length ? complete / rows.length * 100 : 0;
  $('#financialMetrics').innerHTML = metric('Companies / filings', number.format(rows.length), `${number.format(complete)} complete`) + metric('Total revenue', formatMoney(revenue), 'Available disclosures') + metric('Net result', formatMoney(profit), profit >= 0 ? 'Aggregate profit' : 'Aggregate loss') + metric('Total FTE', number.format(fte), 'Available social balance data');
  bars('#revenueChart', [...rows].filter((row) => row.revenue !== null).sort((a,b) => b.revenue-a.revenue).slice(0, 10), (row) => row['KBO name'] || row['NBB name'] || row['Enterprise number'], (row) => row.revenue, (value) => currency.format(value));
  $('#financialInsight').innerHTML = rows.length ? `<strong>${quality.toFixed(0)}%</strong> of the active selection has complete revenue and FTE disclosure. Blank metrics in NBB filings remain blank — never treated as zero.` : 'No financial rows match the active filters.';
  $('#qualityRing').style.setProperty('--progress', `${quality}%`); $('#qualityRing span').textContent = `${quality.toFixed(0)}%`; $('#financialCount').textContent = `${number.format(rows.length)} rows`;
  $('#financialRows').innerHTML = rows.slice(0, 250).map((row) => `<tr><td>${escapeHtml(row['KBO name'] || row['NBB name'] || '—')}</td><td>${escapeHtml(row['Postal code'] || '—')}</td><td>${escapeHtml(row['Returned fiscal year'] || '—')}</td><td>${formatMoney(row.revenue)}</td><td>${formatMoney(row.netResult)}</td><td>${row.fte ?? '—'}</td><td><span class="status ${escapeHtml(row['Financial data status'])}">${escapeHtml(row['Financial data status'] || '—')}</span></td></tr>`).join('') || '<tr><td colspan="7">No rows match the financial filters.</td></tr>';
}

$('#analyse').addEventListener('click', analyse); $('#showCompanies').addEventListener('click', loadCompanies); $('#companySearch').addEventListener('input', renderCompanies); $('#sortEnterprises').addEventListener('click', () => { state.companySort = state.companySort === 'ascending' ? 'descending' : 'ascending'; renderCompanies(); });
$('#postcodeSearch').addEventListener('input', renderPostcodePivot); $('#postcodeSort').addEventListener('change', renderPostcodePivot); $('#postcodeMinCount').addEventListener('input', renderPostcodePivot);
$('#postcodePivotRows').addEventListener('click', (event) => {
  const action = event.target.closest('[data-postal]');
  if (!action) return;
  selectPostcodeForAnalysis(action.dataset.postal);
});
$('#naceVersion').addEventListener('change', () => { void selectVersion(); });
$('#naceCode').addEventListener('input', () => { const search = $('#naceCode').value.trim(); $('#naceCodeSelect').classList.toggle('hidden', !search); clearTimeout(naceSearchTimer); naceSearchTimer = setTimeout(() => { void loadNaceCodes(search); }, 180); });
$('#naceCode').addEventListener('change', () => { updateNaceDescription(); updateReportCommand(); });
$('#naceCodeSelect').addEventListener('change', () => { $('#naceCode').value = $('#naceCodeSelect').value; updateNaceDescription(); updateReportCommand(); saveDashboardSelections(); });
document.querySelectorAll('[data-nace]').forEach((button) => button.addEventListener('click', async () => { $('#naceVersion').value = '2025'; await selectVersion(); await loadNaceCodes(button.dataset.nace); $('#naceCode').value = button.dataset.nace; updateNaceDescription(); analyse(); }));
$('#reportPostalCode').addEventListener('input', () => { state.selectedPostalCode = $('#reportPostalCode').value.trim(); renderPostcodePivot(); updateReportCommand(); }); $('#fieldOptions').querySelectorAll('input').forEach((input) => input.addEventListener('change', updateReportCommand)); $('#advancedFieldOptions').querySelectorAll('input').forEach((input) => input.addEventListener('change', updateReportCommand)); $('#runReport').addEventListener('click', () => { void runReport(); }); $('#resetReport').addEventListener('click', () => { if (confirm('Delete the saved report for this exact selection and fetch it again from NBB?')) void runReport(true); }); $('#exportLocalReport').addEventListener('click', exportLocalReport);
$('#reportView').addEventListener('change', () => { state.reportView = $('#reportView').value; renderLocalReport(); }); $('#pivotValue').addEventListener('change', () => { state.pivotValue = $('#pivotValue').value; renderLocalReport(); });
$('#pivotNaceCode').addEventListener('change', () => { state.pivotNaceCode = $('#pivotNaceCode').value; renderLocalReport(); }); $('#pivotPostalCode').addEventListener('change', () => { state.pivotPostalCode = $('#pivotPostalCode').value; renderLocalReport(); });
document.querySelectorAll('[data-workspace-tab]').forEach((button) => button.addEventListener('click', () => { void setWorkspaceTab(button.dataset.workspaceTab); }));
document.addEventListener('change', saveDashboardSelections); document.addEventListener('input', (event) => { if (event.target.matches('#naceCode, #reportPostalCode')) saveDashboardSelections(); });
void (async () => { renderHistoryYears(); const saved = loadDashboardSelections(); $('#naceVersion').value = saved.naceVersion || '2025'; $('#classification').value = saved.classification || 'MAIN'; await selectVersion(); $('#naceCode').value = saved.naceCode || ''; $('#reportPostalCode').value = saved.reportPostalCode || ''; state.selectedPostalCode = $('#reportPostalCode').value.trim(); if (Array.isArray(saved.historyYears)) $('#historyOptions').querySelectorAll('input').forEach((input) => { input.checked = saved.historyYears.includes(Number(input.value)); }); if (Array.isArray(saved.fields)) document.querySelectorAll('#fieldOptions input, #advancedFieldOptions input').forEach((input) => { input.checked = saved.fields.includes(input.value); }); updateNaceDescription(); updateReportCommand(); })(); checkHealth();