import { describe, expect, it, vi } from 'vitest';
import { fetchPublicConsultFinancials, parsePdfAccountingData } from '../src/nbb/publicConsult';

describe('fetchPublicConsultFinancials', () => {
  it('uses the PDF endpoint rather than the XBRL CSV endpoint for PDF-only filings', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({
      content: [{ id: 'pdf-filing', reference: '2025-00106190', periodEndDateYear: 2024, depositDate: '2025-05-21', enterpriseName: 'Example insurer', importFileType: 'PDF' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })).mockResolvedValueOnce(new Response('not a PDF'));

    await expect(fetchPublicConsultFinancials('0403258197', [2024], fetchImpl, { requestDelayMs: 0 })).resolves.toEqual({
      enterpriseName: 'Example insurer',
      years: [{ fiscalYear: 2024, referenceNumber: '2025-00106190', revenue: null, netResult: null, marginPercent: null, employeeCount: null, currency: 'EUR', depositDate: '2025-05-21', error: 'unsupported_format' }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain('/deposits/pdf/pdf-filing');
  });

  it('extracts standard coded current-year rows from NBB PDF text', () => {
    expect(parsePdfAccountingData('20/58 1.250.000 1.000.000\n10/15 450.000 400.000\n9904 ( 12.500 ) 10.000').Rubrics).toEqual([
      { Code: '20/58', Value: '1250000', Period: 'N' },
      { Code: '10/15', Value: '450000', Period: 'N' },
      { Code: '9904', Value: '-12500', Period: 'N' },
    ]);
  });

  it('extracts insurer-specific balance-sheet labels from PDF text', () => {
    const rubrics = parsePdfAccountingData([
      'C. Beleggingen (staten nrs. 1, 2 en 3)  14.117.997.323',
      'D. Beleggingen betreffende de verrichtingen verbonden aan een beleggingsfonds van de groep van activiteiten "Leven"',
      '8.421.173.909',
      "D.'bis. Deel van de herverzekeraars in de technische voorzieningen      1.436.029.873",
      'E. Vorderingen (staten nrs. 18 en 19)   541.614.168',
      'A. Eigen vermogen (staat nr.5)  709.721.385',
      'C. Technische voorzieningen (staat nr.7)        13.785.341.889',
      'II. Voorziening voor verzekering "leven"        9.912.975.255',
      'III. Voorziening voor te betalen schaden        3.413.538.378',
      "F. Deposito's ontvangen van herverzekeraars     1.139.542.368",
      '3. Resultaat van het boekjaar   99.291.520',
    ].join('\n')).Rubrics;
    expect(rubrics).toEqual(expect.arrayContaining([
      { Code: 'INS_INVESTMENTS', Value: '14117997323', Period: 'N' },
      { Code: 'INS_UNIT_LINKED_INVESTMENTS', Value: '8421173909', Period: 'N' },
      { Code: 'INS_REINSURANCE_SHARE_TECHNICAL_PROVISIONS', Value: '1436029873', Period: 'N' },
      { Code: 'INS_RECEIVABLES', Value: '541614168', Period: 'N' },
      { Code: 'INS_EQUITY', Value: '709721385', Period: 'N' },
      { Code: 'INS_TECHNICAL_PROVISIONS', Value: '13785341889', Period: 'N' },
      { Code: 'INS_LIFE_TECHNICAL_PROVISIONS', Value: '9912975255', Period: 'N' },
      { Code: 'INS_CLAIMS_PROVISIONS', Value: '3413538378', Period: 'N' },
      { Code: 'INS_REINSURANCE_DEPOSITS', Value: '1139542368', Period: 'N' },
      { Code: 'INS_NET_RESULT', Value: '99291520', Period: 'N' },
    ]));
  });

  it('skips short insurer row codes before amounts on following lines', () => {
    const rubrics = parsePdfAccountingData('A. Capitaux propres\n11\n1.459.687.316\nC. Placements\n22\n60.368.360.153').Rubrics;
    expect(rubrics).toEqual(expect.arrayContaining([
      { Code: 'INS_EQUITY', Value: '1459687316', Period: 'N' },
      { Code: 'INS_INVESTMENTS', Value: '60368360153', Period: 'N' },
    ]));
  });
});