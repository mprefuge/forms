import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { Logger } from '../../services/logger';
import { SalesforceService } from '../../services/salesforceService';
import {
  CERTIFICATE_COMPLETE,
  validateCertificate,
  validateFile,
  sameOrganization,
} from '../../services/taxExemptionService';
import { resolveRequestObject, resolveRequestId } from '../shared/requestUtils';
import { buildSalesforceConfig } from '../shared/salesforceUtils';

/**
 * POST /api/form/tax-exemption-certificate
 *
 * Records a Kentucky Form 51A126 purchase exemption certificate and answers one
 * question: is there now a complete certificate on file for this order?
 *
 * The order form calls this BEFORE it sends the buyer to Stripe, and treats
 * anything other than a 200 as "no certificate", which means the order is
 * taxed. That ordering is the whole point. If the certificate were recorded
 * after payment, a failure here would leave an untaxed order with no evidence
 * behind it, and the six percent would be the organisation's own to pay. Taxing
 * a buyer who is genuinely exempt is a refund; failing to tax one who is not is
 * a debt to the Commonwealth.
 *
 * Anonymous, like the rest of /api/form, because the buyer filling in a
 * certificate has no account. That makes it a public write endpoint, so it is
 * built narrow: a fixed set of fields, a strict character set on the exemption
 * number, an allow-list of file types with a size cap, a rate limit, create and
 * edit but no delete on the object, and a refusal to overwrite a certificate
 * that belongs to somebody else.
 *
 * WHAT THIS ENDPOINT DOES NOT DO: it does not verify the certificate. Nothing
 * here calls the Department of Revenue to ask whether that exemption number is
 * real or belongs to that organisation. A buyer determined to lie can put a
 * complete-looking certificate in and pay no tax - and the record this creates
 * is exactly what makes that recoverable: the claim is signed, attributed and
 * dated, it lands in a list staff work, and an exemption that does not hold up
 * can be rejected and the tax re-billed. That is how a paper 51A126 works too.
 */

/**
 * Lower than the discount code endpoint's thirty, because this one writes.
 * Every accepted request creates or updates a Salesforce record and may store a
 * file; a buyer filling in one certificate needs a handful of tries at most.
 */
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_CLIENTS = 10000;

const requestLog = new Map<string, number[]>();

function clientKey(request: HttpRequest, reqObj: any): string {
  const headers: any = reqObj?.headers || request.headers || {};
  const read = (name: string): string => {
    try {
      if (typeof headers.get === 'function') return headers.get(name) || '';
      return headers[name] || headers[name.toLowerCase()] || '';
    } catch (e) {
      return '';
    }
  };

  const forwarded = read('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    const withoutPort = first.includes(']') ? first : first.replace(/:\d+$/, '');
    if (withoutPort) return withoutPort;
  }

  return read('x-azure-clientip') || read('client-ip') || 'unknown';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  const seen = (requestLog.get(key) || []).filter((at) => at > cutoff);

  if (seen.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(key, seen);
    return true;
  }

  seen.push(now);

  if (!requestLog.has(key) && requestLog.size >= RATE_LIMIT_MAX_CLIENTS) {
    const oldest = requestLog.keys().next();
    if (!oldest.done) requestLog.delete(oldest.value);
  }

  requestLog.set(key, seen);
  return false;
}

/** Exposed for tests, which need a clean slate between cases. */
export function __resetRateLimit(): void {
  requestLog.clear();
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function refuse(
  status: number,
  requestId: string,
  reason: string,
  message: string
): HttpResponseInit {
  return {
    status,
    body: JSON.stringify({ recorded: false, reason, message }),
    headers: { ...JSON_HEADERS, 'X-Request-Id': requestId },
  };
}

export async function taxExemptionCertificateHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const reqObj: any = resolveRequestObject(request, context);
  const requestId = resolveRequestId(request, context, reqObj);
  const logger = new Logger(requestId, context.invocationId);

  let body: any;
  try {
    if (request && typeof request.json === 'function') {
      body = await request.json();
    } else if (request && typeof request.body !== 'undefined') {
      body = request.body;
    } else {
      body = {};
    }
  } catch (error: any) {
    logger.error('Invalid request body', error);
    return refuse(400, requestId, 'invalid_body', 'That certificate could not be read.');
  }

  if (!body || typeof body !== 'object') {
    return refuse(400, requestId, 'invalid_body', 'That certificate could not be read.');
  }

  // Validation runs before the rate limit costs a slot and before Salesforce is
  // touched at all: a buyer correcting a typo should not spend their allowance
  // on attempts that were never going to reach the org.
  const validation = validateCertificate(body);
  if (!validation.ok) {
    return refuse(400, requestId, validation.reason, validation.message);
  }

  const fileCheck = validateFile(body.file);
  if (!fileCheck.ok) {
    return refuse(400, requestId, fileCheck.reason, fileCheck.message);
  }

  if (isRateLimited(clientKey(request, reqObj))) {
    logger.info('Tax exemption certificate rate limited');
    return {
      status: 429,
      body: JSON.stringify({
        recorded: false,
        reason: 'rate_limited',
        message: 'Too many attempts. Please wait a moment and try again.',
      }),
      headers: {
        ...JSON_HEADERS,
        'X-Request-Id': requestId,
        'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
      },
    };
  }

  const certificate = validation.certificate;

  try {
    const salesforceService = new SalesforceService(buildSalesforceConfig());
    await salesforceService.authenticate();

    const existing = await salesforceService.getTaxExemptionCertificateByExemptionId(
      certificate.exemptionId
    );

    // A number already on file under a different organisation is not a repeat
    // buyer, it is a buyer using somebody else's exemption - by mistake or
    // otherwise. Refusing means this order is taxed and the certificate that is
    // already there is left exactly as it was.
    if (existing && !sameOrganization(String(existing.Organization_Name__c || ''), certificate.organizationName)) {
      logger.info('Exemption number claimed by a different organization', {
        exemptionId: certificate.exemptionId,
        existingId: existing.Id,
      });
      return refuse(
        409,
        requestId,
        'exemption_id_belongs_to_another_organization',
        'That exemption number is already on file for a different organization. Please check the number, or contact us.'
      );
    }

    const fields: Record<string, any> = {
      Exemption_Id__c: certificate.exemptionId,
      Organization_Name__c: certificate.organizationName,
      Organization_Type__c: certificate.organizationType,
      Signer_Name__c: certificate.signerName,
      Signer_Title__c: certificate.signerTitle,
      Signature__c: certificate.signature,
      Signed_Date__c: certificate.signedDate,
      Status__c: CERTIFICATE_COMPLETE,
      Source__c: certificate.source,
    };

    // First Claimed On is set once and never moved. It is what Days Outstanding
    // counts from, so rewriting it on every repeat order would reset the clock
    // on a certificate that has been outstanding for months.
    if (!existing) {
      fields.First_Claimed_On__c = certificate.signedDate;
      const accountId = await salesforceService.findUniqueAccountIdByName(
        certificate.organizationName
      );
      if (accountId) fields.Account__c = accountId;
    }

    const certificateId = await salesforceService.saveTaxExemptionCertificate(
      fields,
      existing ? String(existing.Id) : null
    );

    // The scan is corroboration, not the certificate. A failed upload must not
    // turn a good certificate into a taxed order, so it is attached on a best
    // effort and the flag records honestly whether it landed.
    let fileAttached = Boolean(existing && existing.Certificate_File_Attached__c);
    if (fileCheck.file) {
      try {
        await salesforceService.createAttachments(certificateId, [fileCheck.file]);
        fileAttached = true;
      } catch (error: any) {
        logger.error('Certificate file could not be attached', error, { certificateId });
      }
    }

    if (fileAttached !== Boolean(existing && existing.Certificate_File_Attached__c)) {
      try {
        await salesforceService.saveTaxExemptionCertificate(
          { Certificate_File_Attached__c: fileAttached },
          certificateId
        );
      } catch (error: any) {
        logger.error('Certificate file flag could not be set', error, { certificateId });
      }
    }

    logger.info('Tax exemption certificate recorded', {
      certificateId,
      exemptionId: certificate.exemptionId,
      created: !existing,
      fileAttached,
    });

    return {
      status: 200,
      body: JSON.stringify({
        recorded: true,
        id: certificateId,
        exemptionId: certificate.exemptionId,
        status: CERTIFICATE_COMPLETE,
        fileAttached,
      }),
      headers: { ...JSON_HEADERS, 'X-Request-Id': requestId },
    };
  } catch (error: any) {
    logger.error('Tax exemption certificate could not be recorded', error);

    // 502, not a 200 saying the certificate is no good. The order form taxes on
    // anything but a 200 either way, but the buyer is told to try again rather
    // than that their certificate was rejected - and a Salesforce outage does
    // not get logged as a rejected exemption.
    const missingCredentials = error?.message?.includes('Missing Salesforce credentials');
    return {
      status: missingCredentials ? 500 : 502,
      body: JSON.stringify({
        recorded: false,
        reason: 'unavailable',
        message: 'We could not record your certificate just now. Please try again.',
      }),
      headers: { ...JSON_HEADERS, 'X-Request-Id': requestId },
    };
  }
}

app.http('taxExemptionCertificate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'form/tax-exemption-certificate',
  handler: taxExemptionCertificateHandler,
});

export default taxExemptionCertificateHandler;
