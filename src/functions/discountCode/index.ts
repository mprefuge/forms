import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { Logger } from '../../services/logger';
import { SalesforceService } from '../../services/salesforceService';
import { DiscountCodeService, normalizeDiscountCode } from '../../services/discountCodeService';
import { resolveRequestObject, resolveRequestId } from '../shared/requestUtils';
import { buildSalesforceConfig } from '../shared/salesforceUtils';
import { getTrimmedFirstQueryValue } from '../shared/queryUtils';

/**
 * GET /api/form/discount-code?code=RUSSELLMOORE&product=hospitality-guide
 *
 * Answers one question - "may this buyer use this code, and for how much off?" -
 * and nothing else. There is deliberately no route that lists codes: they are
 * issued to named partners, and the difference between a code and a published
 * sale is that a code is not public.
 *
 * Anonymous, because the buyer typing the code has no account and never will.
 * That is the same posture as the rest of /api/form, but it does mean this
 * endpoint is reachable by anyone, so it is built to be cheap and quiet: one
 * indexed SOQL lookup on a unique field, a per-instance rate limit below, and a
 * per-instance negative cache in the service.
 *
 * WHAT THIS ENDPOINT DOES NOT DO: it does not make the charged total
 * trustworthy. The order form computes the total in the browser and posts it to
 * the payment service as `amount`, which accepts any positive integer. That was
 * already true of every form in this system before discount codes existed, and
 * validating the code server-side does not change it - a determined buyer can
 * still edit the total in devtools without any code at all. What this does buy
 * is that codes stay secret, that they can be retired instantly, and that the
 * discount actually applied is recorded against the order so a reconciliation
 * can catch a total that does not match the code it claims.
 */

/**
 * Requests allowed per client per window, per Function App instance.
 *
 * The limit exists to protect the Salesforce API quota, which is an org-wide
 * daily budget shared with every other form and integration. Left open, a
 * script guessing codes here could exhaust it and take down submissions for
 * everything else. 30 tries a minute is far more than a buyer typing a code
 * they were given, and far less than a useful guessing rate against a
 * 40-character keyspace.
 *
 * Per-instance, so it is a speed bump rather than a wall: the App can scale out,
 * and the counters do not survive a restart. Anything stronger belongs in front
 * of the App (Front Door / API Management), not in the handler.
 */
const RATE_LIMIT_MAX_REQUESTS = 30;
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

  // Azure puts the caller's address in X-Forwarded-For as "ip:port" and may
  // append proxies; the first entry is the client.
  const forwarded = read('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    // Strip the port, taking care not to mangle a bare IPv6 address.
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
    // Keep the pruned list so a client that keeps hammering does not also keep
    // growing its own array.
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
  // The answer depends on Salesforce data that staff can change at any moment,
  // and on a per-code basis. Nothing in between should hold on to it.
  'Cache-Control': 'no-store',
};

export async function discountCodeHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const reqObj: any = resolveRequestObject(request, context);
  const requestId = resolveRequestId(request, context, reqObj);
  const logger = new Logger(requestId, context.invocationId);

  try {
    const rawCode = getTrimmedFirstQueryValue(request, ['code', 'discountCode', 'discount_code']);
    const product = getTrimmedFirstQueryValue(request, ['product']) || '';
    const code = normalizeDiscountCode(rawCode);

    if (!code) {
      return {
        status: 400,
        body: JSON.stringify({ error: 'Missing required query parameter: code' }),
        headers: { ...JSON_HEADERS, 'X-Request-Id': requestId },
      };
    }

    if (isRateLimited(clientKey(request, reqObj))) {
      logger.info('Discount code lookup rate limited', { product });
      return {
        status: 429,
        body: JSON.stringify({
          valid: false,
          code,
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

    const salesforceService = new SalesforceService(buildSalesforceConfig());
    await salesforceService.authenticate();

    const result = await new DiscountCodeService(salesforceService).resolve(code, product);

    // The code itself is logged: it is not a credential, and knowing which codes
    // are being tried is how a leaked one gets noticed.
    logger.info('Discount code lookup', {
      code,
      product,
      valid: result.valid,
      reason: result.reason,
    });

    return {
      status: 200,
      body: JSON.stringify(result),
      headers: { ...JSON_HEADERS, 'X-Request-Id': requestId },
    };
  } catch (error: any) {
    logger.error('Discount code lookup failed', error);

    // 502 rather than 200-with-valid-false on purpose. "We could not check" is
    // not "that code is no good": the form has to be able to tell the buyer to
    // try again rather than quietly charging them full price for a code that
    // was perfectly good.
    const missingCredentials = error?.message?.includes('Missing Salesforce credentials');
    return {
      status: missingCredentials ? 500 : 502,
      body: JSON.stringify({
        error: 'Discount code could not be checked',
        message: 'We could not check that code just now. Please try again.',
      }),
      headers: { ...JSON_HEADERS, 'X-Request-Id': requestId },
    };
  }
}

app.http('discountCode', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'form/discount-code',
  handler: discountCodeHandler,
});

export default discountCodeHandler;
