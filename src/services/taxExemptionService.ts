/**
 * Kentucky Form 51A126 purchase exemption certificates.
 *
 * A buyer who ticks "we are tax exempt" has made a CLAIM. What turns a claim
 * into a certificate is the six things the Commonwealth's form asks for: the
 * exemption number, who the purchaser is, on what basis they are exempt, who
 * signed for them, their signature, and the date. This module is where that
 * distinction is enforced, and it is the only thing standing between a ticked
 * box and six percent of an order going uncollected.
 *
 * Everything here is pure. It never touches Salesforce, so the rules about what
 * makes a certificate valid can be read and tested without an org, and the
 * handler is left with nothing to decide.
 */

/** Statuses shared with Transaction__c.Tax_Certificate_Status__c and the order form. */
export const CERTIFICATE_COMPLETE = 'Complete';
export const CERTIFICATE_PENDING = 'Pending';
export const CERTIFICATE_NOT_APPLICABLE = 'Not Applicable';

/**
 * The bases for exemption Form 51A126 offers. Restricted here as well as in the
 * picklist, because a value the picklist rejects fails the write in Salesforce
 * with an error the buyer would see as "we could not record your certificate" -
 * far better to say which answers are acceptable before anything is sent.
 */
export const ORGANIZATION_TYPES = [
  'Resident nonprofit educational institution',
  'Resident nonprofit charitable institution',
  'Resident nonprofit religious institution',
  'Government agency',
  'Resale',
  'Other',
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

/**
 * Exemption numbers issued by the Kentucky Department of Revenue are short
 * alphanumeric strings, sometimes hyphenated. Normalising to that character set
 * is not cosmetic: `escapeSoql` escapes quotes and nothing else, so a value
 * ending in a backslash would escape its own closing quote and let the rest of
 * the string become query. Restricting the alphabet closes that off before the
 * value can reach a query at all, the same way discount codes do.
 */
export function normalizeExemptionId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

/** Collapse runs of whitespace and trim - what a person typing into a form produces. */
export function normalizeText(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * A calendar date, as a date and not an instant.
 *
 * `new Date('2026-09-10')` is midnight UTC, which in Louisville is the evening
 * of the 9th - so anything that formats it back into a local date moves it a
 * day. Parsed by hand into its three numbers instead, and compared against
 * another date the same way, so no timezone ever gets a vote on what day a
 * certificate was signed.
 */
export function parseCalendarDate(raw: unknown): { y: number; m: number; d: number } | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Reject a date that does not exist (31 February, 31 April). Date rolls those
  // over silently, which would store a signing date the signer never wrote.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }

  return { y, m, d };
}

/** Today in Eastern time, where the organisation is and where the tax is owed. */
export function todayInEastern(now: Date = new Date()): { y: number; m: number; d: number } {
  // en-CA gives YYYY-MM-DD. Asking Intl rather than hardcoding an offset,
  // because an offset stops being right at the next daylight-saving change.
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const parsed = parseCalendarDate(iso);
  // Intl is not going to hand back something unparseable, but a null here would
  // silently disable the future-date check, so it is not left to chance.
  return parsed || { y: 1970, m: 1, d: 1 };
}

function compareDates(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number }
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

export interface CertificateInput {
  exemptionId?: unknown;
  organizationName?: unknown;
  organizationType?: unknown;
  signerName?: unknown;
  signerTitle?: unknown;
  signature?: unknown;
  signedDate?: unknown;
  source?: unknown;
}

export interface CertificateFields {
  exemptionId: string;
  organizationName: string;
  organizationType: OrganizationType;
  signerName: string;
  signerTitle: string;
  signature: string;
  signedDate: string;
  source: string;
}

export type CertificateValidation =
  | { ok: true; certificate: CertificateFields }
  | { ok: false; reason: string; message: string };

/**
 * The six-part test. Anything short of all of it is not a certificate, and this
 * returns a refusal rather than a half-built record - the caller's job on a
 * refusal is to tax the order, not to store a weaker version of the claim.
 */
export function validateCertificate(
  input: CertificateInput,
  now: Date = new Date()
): CertificateValidation {
  const exemptionId = normalizeExemptionId(input.exemptionId);
  if (!exemptionId) {
    return {
      ok: false,
      reason: 'missing_exemption_id',
      message: 'Enter the exemption number from your certificate.',
    };
  }

  const organizationName = normalizeText(input.organizationName, 255);
  if (organizationName.length < 2) {
    return {
      ok: false,
      reason: 'missing_organization_name',
      message: 'Enter the name of the exempt organization.',
    };
  }

  const organizationType = normalizeText(input.organizationType, 255);
  if (!ORGANIZATION_TYPES.includes(organizationType as OrganizationType)) {
    return {
      ok: false,
      reason: 'invalid_organization_type',
      message: 'Choose the type of organization claiming exemption.',
    };
  }

  const signerName = normalizeText(input.signerName, 121);
  if (signerName.length < 2) {
    return {
      ok: false,
      reason: 'missing_signer_name',
      message: 'Enter the name of the person signing the certificate.',
    };
  }

  const signature = normalizeText(input.signature, 121);
  if (signature.length < 2) {
    return {
      ok: false,
      reason: 'missing_signature',
      message: 'Type your name as your signature.',
    };
  }

  const signedDate = parseCalendarDate(input.signedDate);
  if (!signedDate) {
    return {
      ok: false,
      reason: 'invalid_signed_date',
      message: 'Enter the date you are signing this certificate.',
    };
  }

  // A certificate signed tomorrow is a typo or a fabrication. Either way it is
  // not evidence, and it is cheaper to say so now than to find it in an audit.
  if (compareDates(signedDate, todayInEastern(now)) > 0) {
    return {
      ok: false,
      reason: 'signed_date_in_future',
      message: 'The signing date cannot be in the future.',
    };
  }

  return {
    ok: true,
    certificate: {
      exemptionId,
      organizationName,
      organizationType: organizationType as OrganizationType,
      signerName,
      signerTitle: normalizeText(input.signerTitle, 128),
      signature,
      signedDate: `${signedDate.y}-${String(signedDate.m).padStart(2, '0')}-${String(
        signedDate.d
      ).padStart(2, '0')}`,
      source: normalizeText(input.source, 255) || 'Order form',
    },
  };
}

/**
 * Whether an existing certificate under this exemption number belongs to the
 * organisation now claiming it.
 *
 * The exemption number is unique, which is what lets a repeat buyer reuse the
 * certificate already on file. It also means a buyer who types somebody else's
 * number would otherwise overwrite that organisation's certificate and point it
 * at their own account - one form submission quietly rewriting another
 * charity's tax evidence. Compared loosely enough to survive punctuation and
 * "Inc." coming and going, strictly enough that two different churches do not
 * pass for each other.
 */
export function sameOrganization(a: string, b: string): boolean {
  const key = (s: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/\b(the|inc|llc|corp|corporation|co|company|of)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  const ka = key(a);
  const kb = key(b);
  return ka.length > 0 && ka === kb;
}

/** What an accepted upload may be. Anything else is refused before it is decoded. */
export const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

/**
 * 5 MB decoded. A scan of a one-page form is well under that; anything larger
 * is a phone photo nobody needs at full resolution, or it is not a certificate.
 * Capped because this endpoint is anonymous and writes files into Salesforce.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type FileValidation =
  | { ok: true; file: { fileName: string; contentType: string; base64: string } | null }
  | { ok: false; reason: string; message: string };

/**
 * The upload is OPTIONAL and stays optional: the captured fields are themselves
 * a certificate in electronic form, which is what Kentucky accepts, and the
 * scan is corroboration. So "no file" is a success with nothing attached, not a
 * refusal - but a file that IS sent has to be what it says it is.
 */
export function validateFile(raw: unknown): FileValidation {
  if (raw === null || typeof raw === 'undefined') return { ok: true, file: null };
  if (typeof raw !== 'object') {
    return { ok: false, reason: 'invalid_file', message: 'That file could not be read.' };
  }

  const file = raw as Record<string, unknown>;
  const base64 = typeof file.base64 === 'string' ? file.base64.replace(/\s/g, '') : '';
  if (!base64) return { ok: true, file: null };

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false, reason: 'invalid_file', message: 'That file could not be read.' };
  }

  // Length before decoding, so an oversized upload is refused without ever
  // being held in memory in two forms.
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: 'file_too_large',
      message: 'That file is larger than 5 MB. Please upload a smaller scan.',
    };
  }

  const contentType = normalizeText(file.contentType, 120).toLowerCase();
  const extensions = ALLOWED_FILE_TYPES[contentType];
  if (!extensions) {
    return {
      ok: false,
      reason: 'unsupported_file_type',
      message: 'Upload the certificate as a PDF, JPG or PNG.',
    };
  }

  // Salesforce decides how to render a file from its name, not from anything we
  // claim about it, so the name has to agree with the type. Stripped of
  // directory separators as well: the value goes into Title and PathOnClient.
  const rawName = normalizeText(file.fileName, 120).replace(/[\\/]/g, '');
  const extension = (rawName.split('.').pop() || '').toLowerCase();
  const fileName = extensions.includes(extension) ? rawName : `certificate.${extensions[0]}`;

  return { ok: true, file: { fileName, contentType, base64 } };
}
