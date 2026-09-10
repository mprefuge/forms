// @ts-nocheck
import {
  taxExemptionCertificateHandler,
  __resetRateLimit,
} from '../src/functions/taxExemptionCertificate';
import { SalesforceService } from '../src/services/salesforceService';

jest.mock('../src/services/salesforceService');

const body = (overrides: Record<string, any> = {}) => ({
  exemptionId: 'A-12345',
  organizationName: 'Grace Baptist Church',
  organizationType: 'Resident nonprofit religious institution',
  signerName: 'Pat Buyer',
  signerTitle: 'Treasurer',
  signature: 'Pat Buyer',
  signedDate: '2020-01-15',
  source: 'Hospitality Guide order form',
  ...overrides,
});

const buildRequest = (payload: any, headers: Record<string, string> = {}) => ({
  method: 'POST',
  json: async () => payload,
  headers: {
    get: (key: string) => headers[key.toLowerCase()] ?? null,
  },
});

const context = { invocationId: 'cert-inv-1', log: jest.fn() };
const parse = (response: any) => JSON.parse(response.body);

describe('tax-exemption-certificate endpoint', () => {
  let mockSf: any;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimit();

    mockSf = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      getTaxExemptionCertificateByExemptionId: jest.fn().mockResolvedValue(null),
      // Mirrors the real method: an update returns the id it was given, a
      // create mints one. A mock that always returned a new id would have hidden
      // the repeat-buyer case entirely.
      saveTaxExemptionCertificate: jest
        .fn()
        .mockImplementation(async (_fields: any, existingId?: string | null) =>
          existingId || 'a1Y000000000001'
        ),
      findUniqueAccountIdByName: jest.fn().mockResolvedValue(null),
      createAttachments: jest.fn().mockResolvedValue(['06A000000000001']),
    };
    (SalesforceService as jest.MockedClass<any>).mockImplementation(() => mockSf);

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records a complete certificate and returns its id', async () => {
    const response = await taxExemptionCertificateHandler(buildRequest(body()), context);

    expect(response.status).toBe(200);
    expect(parse(response)).toMatchObject({
      recorded: true,
      id: 'a1Y000000000001',
      exemptionId: 'A-12345',
      status: 'Complete',
    });

    const [fields, existingId] = mockSf.saveTaxExemptionCertificate.mock.calls[0];
    expect(existingId).toBeNull();
    expect(fields).toMatchObject({
      Exemption_Id__c: 'A-12345',
      Organization_Name__c: 'Grace Baptist Church',
      Organization_Type__c: 'Resident nonprofit religious institution',
      Signer_Name__c: 'Pat Buyer',
      Signature__c: 'Pat Buyer',
      Signed_Date__c: '2020-01-15',
      Status__c: 'Complete',
      First_Claimed_On__c: '2020-01-15',
    });
  });

  it('refuses an incomplete certificate without touching Salesforce', async () => {
    // A ticked box is a claim. Only the six parts make it a certificate, and
    // nothing short of that should reach the org at all.
    const response = await taxExemptionCertificateHandler(
      buildRequest(body({ signature: '' })),
      context
    );

    expect(response.status).toBe(400);
    expect(parse(response).recorded).toBe(false);
    expect(parse(response).reason).toBe('missing_signature');
    expect(mockSf.authenticate).not.toHaveBeenCalled();
    expect(mockSf.saveTaxExemptionCertificate).not.toHaveBeenCalled();
  });

  it('updates the certificate already on file for a repeat buyer', async () => {
    mockSf.getTaxExemptionCertificateByExemptionId.mockResolvedValue({
      Id: 'a1Y000000000009',
      Organization_Name__c: 'Grace Baptist Church, Inc.',
      Certificate_File_Attached__c: true,
      First_Claimed_On__c: '2019-05-01',
    });

    const response = await taxExemptionCertificateHandler(buildRequest(body()), context);

    expect(response.status).toBe(200);
    expect(parse(response).id).toBe('a1Y000000000009');

    const [fields, existingId] = mockSf.saveTaxExemptionCertificate.mock.calls[0];
    expect(existingId).toBe('a1Y000000000009');
    // The clock does not restart. Days Outstanding counts from the first claim,
    // so rewriting it on every repeat order would hide a months-old liability.
    expect(fields).not.toHaveProperty('First_Claimed_On__c');
    expect(mockSf.findUniqueAccountIdByName).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a certificate belonging to another organization', async () => {
    // One form submission must not be able to rewrite another charity's tax
    // evidence and repoint it at a different account.
    mockSf.getTaxExemptionCertificateByExemptionId.mockResolvedValue({
      Id: 'a1Y000000000009',
      Organization_Name__c: 'First Baptist Church',
    });

    const response = await taxExemptionCertificateHandler(buildRequest(body()), context);

    expect(response.status).toBe(409);
    expect(parse(response).reason).toBe('exemption_id_belongs_to_another_organization');
    expect(mockSf.saveTaxExemptionCertificate).not.toHaveBeenCalled();
  });

  it('links a new certificate to an account only when exactly one name matches', async () => {
    mockSf.findUniqueAccountIdByName.mockResolvedValue('001000000000001');

    await taxExemptionCertificateHandler(buildRequest(body()), context);

    expect(mockSf.saveTaxExemptionCertificate.mock.calls[0][0].Account__c).toBe('001000000000001');
  });

  it('leaves the account blank when nothing matched uniquely', async () => {
    // An exemption filed against the wrong organisation is worse than one filed
    // against none: the wrong org then looks covered on its next order.
    await taxExemptionCertificateHandler(buildRequest(body()), context);
    expect(mockSf.saveTaxExemptionCertificate.mock.calls[0][0]).not.toHaveProperty('Account__c');
  });

  it('attaches an uploaded scan and records that it landed', async () => {
    const response = await taxExemptionCertificateHandler(
      buildRequest(
        body({ file: { fileName: '51A126.pdf', contentType: 'application/pdf', base64: 'QUJD' } })
      ),
      context
    );

    expect(parse(response).fileAttached).toBe(true);
    expect(mockSf.createAttachments).toHaveBeenCalledWith('a1Y000000000001', [
      { fileName: '51A126.pdf', contentType: 'application/pdf', base64: 'QUJD' },
    ]);
    expect(mockSf.saveTaxExemptionCertificate).toHaveBeenLastCalledWith(
      { Certificate_File_Attached__c: true },
      'a1Y000000000001'
    );
  });

  it('still records the certificate when the upload fails', async () => {
    // The scan is corroboration. A failed upload must not turn a good
    // certificate into a taxed order.
    mockSf.createAttachments.mockRejectedValue(new Error('storage limit'));

    const response = await taxExemptionCertificateHandler(
      buildRequest(
        body({ file: { fileName: '51A126.pdf', contentType: 'application/pdf', base64: 'QUJD' } })
      ),
      context
    );

    expect(response.status).toBe(200);
    expect(parse(response).recorded).toBe(true);
    expect(parse(response).fileAttached).toBe(false);
  });

  it('refuses an oversized upload before it reaches Salesforce', async () => {
    const response = await taxExemptionCertificateHandler(
      buildRequest(
        body({
          file: {
            fileName: 'huge.pdf',
            contentType: 'application/pdf',
            base64: 'A'.repeat(9 * 1024 * 1024),
          },
        })
      ),
      context
    );

    expect(response.status).toBe(400);
    expect(parse(response).reason).toBe('file_too_large');
    expect(mockSf.authenticate).not.toHaveBeenCalled();
  });

  it('answers 502 when Salesforce is unreachable, not a rejection', async () => {
    // "We could not record it" and "your certificate is no good" are different
    // things to tell a buyer, and only one of them is true here.
    mockSf.authenticate.mockRejectedValue(new Error('ECONNRESET'));

    const response = await taxExemptionCertificateHandler(buildRequest(body()), context);

    expect(response.status).toBe(502);
    expect(parse(response)).toMatchObject({ recorded: false, reason: 'unavailable' });
  });

  it('rate limits a client that keeps posting', async () => {
    const headers = { 'x-forwarded-for': '198.51.100.7:4444' };

    for (let i = 0; i < 10; i++) {
      const ok = await taxExemptionCertificateHandler(buildRequest(body(), headers), context);
      expect(ok.status).toBe(200);
    }

    const limited = await taxExemptionCertificateHandler(buildRequest(body(), headers), context);
    expect(limited.status).toBe(429);
    expect(parse(limited).reason).toBe('rate_limited');
    expect(mockSf.saveTaxExemptionCertificate).toHaveBeenCalledTimes(10);
  });

  it('does not spend a rate limit slot on a request it never sends', async () => {
    // A buyer correcting a typo should not use up their allowance on attempts
    // that were never going to reach the org.
    const headers = { 'x-forwarded-for': '198.51.100.8:4444' };

    for (let i = 0; i < 20; i++) {
      const bad = await taxExemptionCertificateHandler(
        buildRequest(body({ exemptionId: '' }), headers),
        context
      );
      expect(bad.status).toBe(400);
    }

    const good = await taxExemptionCertificateHandler(buildRequest(body(), headers), context);
    expect(good.status).toBe(200);
  });

  it('refuses a body that is not an object', async () => {
    const response = await taxExemptionCertificateHandler(buildRequest('nope'), context);
    expect(response.status).toBe(400);
    expect(parse(response).reason).toBe('invalid_body');
  });
});
