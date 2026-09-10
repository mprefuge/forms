import {
  normalizeExemptionId,
  normalizeText,
  parseCalendarDate,
  todayInEastern,
  validateCertificate,
  validateFile,
  sameOrganization,
  MAX_FILE_BYTES,
} from '../src/services/taxExemptionService';

const complete = (overrides: Record<string, any> = {}) => ({
  exemptionId: 'A-12345',
  organizationName: 'Grace Baptist Church',
  organizationType: 'Resident nonprofit religious institution',
  signerName: 'Pat Buyer',
  signerTitle: 'Treasurer',
  signature: 'Pat Buyer',
  signedDate: '2026-09-10',
  source: 'Hospitality Guide order form',
  ...overrides,
});

// Fixed so the future-date test is not a test that starts failing tomorrow.
const NOW = new Date('2026-09-10T16:00:00Z');

describe('normalizeExemptionId', () => {
  it('upper-cases and keeps only the characters an exemption number uses', () => {
    expect(normalizeExemptionId(' a-12345 ')).toBe('A-12345');
  });

  it('strips a trailing backslash, which escapeSoql would not', () => {
    // escapeSoql escapes quotes and nothing else, so a value ending in a
    // backslash would escape its own closing quote and let the rest of the
    // string become query. The alphabet is the boundary, not the escaping.
    expect(normalizeExemptionId("A123\\")).toBe('A123');
    expect(normalizeExemptionId("A' OR Id != null--")).toBe('AORIDNULL--');
  });

  it('caps at forty characters', () => {
    expect(normalizeExemptionId('A'.repeat(80))).toHaveLength(40);
  });

  it('returns empty for anything that is not a string', () => {
    expect(normalizeExemptionId(null)).toBe('');
    expect(normalizeExemptionId(12345)).toBe('');
  });
});

describe('normalizeText', () => {
  it('collapses the whitespace a person types', () => {
    expect(normalizeText('  Grace   Baptist\n Church ', 255)).toBe('Grace Baptist Church');
  });

  it('truncates to the field length rather than letting Salesforce reject it', () => {
    expect(normalizeText('x'.repeat(300), 121)).toHaveLength(121);
  });
});

describe('parseCalendarDate', () => {
  it('reads a plain calendar date', () => {
    expect(parseCalendarDate('2026-09-10')).toEqual({ y: 2026, m: 9, d: 10 });
  });

  it('refuses a date that does not exist', () => {
    // Date rolls 31 February over to 3 March in silence, which would store a
    // signing date the signer never wrote.
    expect(parseCalendarDate('2026-02-31')).toBeNull();
    expect(parseCalendarDate('2026-04-31')).toBeNull();
  });

  it('refuses anything that is not YYYY-MM-DD', () => {
    expect(parseCalendarDate('09/10/2026')).toBeNull();
    expect(parseCalendarDate('2026-9-10')).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate(undefined)).toBeNull();
  });
});

describe('todayInEastern', () => {
  it('reads the Eastern calendar date, not the UTC one', () => {
    // 01:00 UTC on the 11th is still the evening of the 10th in Louisville. A
    // hardcoded offset would also get this right until the next daylight-saving
    // change, which is exactly why it is not hardcoded.
    expect(todayInEastern(new Date('2026-09-11T01:00:00Z'))).toEqual({ y: 2026, m: 9, d: 10 });
    expect(todayInEastern(new Date('2026-01-11T01:00:00Z'))).toEqual({ y: 2026, m: 1, d: 10 });
  });
});

describe('validateCertificate', () => {
  it('accepts a certificate with all six parts', () => {
    const result = validateCertificate(complete(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.certificate.exemptionId).toBe('A-12345');
      expect(result.certificate.signedDate).toBe('2026-09-10');
    }
  });

  it.each([
    ['exemptionId', 'missing_exemption_id'],
    ['organizationName', 'missing_organization_name'],
    ['signerName', 'missing_signer_name'],
    ['signature', 'missing_signature'],
    ['signedDate', 'invalid_signed_date'],
  ])('refuses a certificate missing %s', (field, reason) => {
    const result = validateCertificate(complete({ [field]: '' }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it('refuses an organization type outside the 51A126 list', () => {
    // The picklist is restricted, so a value it does not know fails the write
    // in Salesforce - after the buyer has been told their certificate was
    // accepted. Caught here instead.
    const result = validateCertificate(complete({ organizationType: 'Church' }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_organization_type');
  });

  it('refuses a certificate signed in the future', () => {
    const result = validateCertificate(complete({ signedDate: '2026-09-11' }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signed_date_in_future');
  });

  it('accepts a certificate signed today in Eastern time', () => {
    // Late evening Eastern is already tomorrow in UTC. Comparing instants
    // rather than calendar dates would reject a certificate signed just now.
    const result = validateCertificate(
      complete({ signedDate: '2026-09-10' }),
      new Date('2026-09-11T02:30:00Z')
    );
    expect(result.ok).toBe(true);
  });

  it('does not require a signer title', () => {
    const result = validateCertificate(complete({ signerTitle: '' }), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.certificate.signerTitle).toBe('');
  });

  it('never returns a partial certificate to store', () => {
    // A refusal has to be a refusal. Returning a half-built record would invite
    // a caller to store the claim as though it were evidence.
    const result = validateCertificate(complete({ signature: '' }), NOW);
    expect(result.ok).toBe(false);
    expect((result as any).certificate).toBeUndefined();
  });
});

describe('sameOrganization', () => {
  it('matches through punctuation, case and the usual suffixes', () => {
    expect(sameOrganization('Grace Baptist Church', 'grace baptist church')).toBe(true);
    expect(sameOrganization('Grace Baptist Church, Inc.', 'Grace Baptist Church')).toBe(true);
    expect(sameOrganization('The Grace Baptist Church', 'Grace Baptist Church')).toBe(true);
  });

  it('does not let two different churches pass for each other', () => {
    // This is the check that stops one form submission overwriting another
    // organisation's tax evidence and repointing it at the wrong account.
    expect(sameOrganization('Grace Baptist Church', 'First Baptist Church')).toBe(false);
    expect(sameOrganization('Grace Baptist Church', 'Grace Presbyterian Church')).toBe(false);
  });

  it('treats an empty name as matching nothing', () => {
    expect(sameOrganization('', '')).toBe(false);
    expect(sameOrganization('', 'Grace Baptist Church')).toBe(false);
  });
});

describe('validateFile', () => {
  const pdf = (bytes: number) => ({
    fileName: '51A126.pdf',
    contentType: 'application/pdf',
    base64: 'A'.repeat(Math.ceil((bytes * 4) / 3)),
  });

  it('treats no file as a success with nothing attached', () => {
    // The upload is corroboration, not the certificate. Refusing an order for
    // want of a scan would be refusing a certificate Kentucky accepts.
    expect(validateFile(undefined)).toEqual({ ok: true, file: null });
    expect(validateFile(null)).toEqual({ ok: true, file: null });
    expect(validateFile({ fileName: 'x.pdf', contentType: 'application/pdf', base64: '' })).toEqual({
      ok: true,
      file: null,
    });
  });

  it('accepts a PDF, a JPEG and a PNG', () => {
    for (const [type, name] of [
      ['application/pdf', 'cert.pdf'],
      ['image/jpeg', 'cert.jpg'],
      ['image/png', 'cert.png'],
    ]) {
      const result = validateFile({ fileName: name, contentType: type, base64: 'QUJD' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.file?.fileName).toBe(name);
    }
  });

  it('refuses a type that is not on the list', () => {
    const result = validateFile({
      fileName: 'cert.html',
      contentType: 'text/html',
      base64: 'QUJD',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_file_type');
  });

  it('refuses a file over the cap', () => {
    const result = validateFile(pdf(MAX_FILE_BYTES + 1024));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('file_too_large');
  });

  it('refuses base64 that is not base64', () => {
    const result = validateFile({
      fileName: 'cert.pdf',
      contentType: 'application/pdf',
      base64: '<script>alert(1)</script>',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_file');
  });

  it('renames a file whose extension disagrees with its type', () => {
    // Salesforce decides how to render a file from its name, not from what the
    // upload claimed about it, so the two have to agree.
    const result = validateFile({
      fileName: 'cert.exe',
      contentType: 'application/pdf',
      base64: 'QUJD',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file?.fileName).toBe('certificate.pdf');
  });

  it('strips directory separators out of the name', () => {
    const result = validateFile({
      fileName: '../../etc/passwd.pdf',
      contentType: 'application/pdf',
      base64: 'QUJD',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file?.fileName).toBe('....etcpasswd.pdf');
  });
});
