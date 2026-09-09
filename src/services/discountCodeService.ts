import { SalesforceService } from './salesforceService';

/**
 * DISCOUNT CODES
 *
 * A percentage-off code a buyer types into a public order form. Codes live in
 * Salesforce as Discount_Code__c records so staff can add, activate, expire and
 * retire them from a list view without a code change or a deploy - which is the
 * whole point of the object existing.
 *
 * Two things this module is deliberately careful about:
 *
 *   1. It never hands the browser anything but the answer for the one code that
 *      was asked about. There is no endpoint that lists codes, and the reply
 *      carries no record id, no notes, no redemption counts. Codes are given to
 *      named partners, and a list of them is not a thing to publish.
 *
 *   2. Dates are judged in US Eastern time, not UTC and not the buyer's clock.
 *      Salesforce Date fields are date-only, and "expires 15 October" means the
 *      end of the 15th where the organisation is, not 8pm on the 14th because
 *      the server happens to run in UTC.
 */

/** The maximum length of Code__c in Salesforce. */
const MAX_CODE_LENGTH = 40;

/** The timezone every discount window is judged in. */
const DISCOUNT_TIMEZONE = 'America/New_York';

/**
 * How long a "no such code" answer is remembered, in milliseconds.
 *
 * Only negative answers are cached, and this is the reason: a cached positive
 * would keep a code working after somebody unticked Active to kill it, and
 * "untick to switch it off immediately" has to mean immediately. A cached
 * negative can only ever delay a code starting to work, never extend one past
 * its retirement.
 *
 * It is short for the same reason - a minute is long enough to blunt somebody
 * hammering the endpoint with guesses, short enough that a code created by
 * staff and typed straight into the form works on the second try.
 */
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;

/** Cap on the negative cache, so a flood of distinct guesses cannot grow it without bound. */
const NEGATIVE_CACHE_MAX_ENTRIES = 5000;

export type DiscountCodeRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'wrong_product'
  | 'fully_redeemed'
  | 'misconfigured';

export interface DiscountCodeResult {
  valid: boolean;
  /** The normalized code, echoed back so the caller can display what was actually matched. */
  code: string;
  /** Whole percent off the order subtotal. Present only when valid. */
  percentOff?: number;
  /** The record's Name - a human label such as "Russell Moore podcast". Present only when valid. */
  label?: string;
  /** Why the code was refused. Present only when invalid. */
  reason?: DiscountCodeRejection;
  /** A sentence a buyer can act on. Present only when invalid. */
  message?: string;
}

/**
 * Reduce whatever the buyer typed to the redeemable character set: upper case,
 * letters, digits, hyphen and underscore, at most as long as Code__c allows.
 *
 * This is both a convenience and a boundary. The convenience is that
 * " russellmoore " and "RussellMoore" both find RUSSELLMOORE. The boundary is
 * that the result is safe to interpolate into SOQL: it can contain neither a
 * quote nor a backslash, which is what the escaping in SalesforceService does
 * not fully cover.
 *
 * Spaces and punctuation are STRIPPED rather than rejected, so "RUSSELL MOORE"
 * still matches RUSSELLMOORE. A code stored with characters outside this set
 * could never be matched at all, which is why saving one is blocked in
 * Salesforce by the Code_Characters_Redeemable validation rule.
 */
export function normalizeDiscountCode(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, MAX_CODE_LENGTH);
}

/**
 * Today's date in the discount timezone, as YYYY-MM-DD.
 *
 * Formatted rather than arithmetic on purpose: Intl knows when the Eastern
 * offset changes and a hardcoded -04:00 or -05:00 does not, so this stays
 * correct across the daylight-saving boundary that falls in the middle of the
 * Hospitality Guide's launch window.
 */
export function currentDateInDiscountTimezone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISCOUNT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // en-CA formats as YYYY-MM-DD, which is exactly how Salesforce serialises a Date.
  return parts;
}

/**
 * Salesforce returns a Date field as "YYYY-MM-DD". Trim it to that shape so the
 * comparisons below are plain string comparisons, which for ISO dates order the
 * same way the calendar does.
 */
function toDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * Decide whether a Discount_Code__c record may be redeemed right now, for this
 * product.
 *
 * Pure and synchronous, so every branch below is testable without a Salesforce
 * connection - which matters, because these branches decide what a buyer pays.
 *
 * `product` is compared case-insensitively against Product__c. A record with
 * Product__c blank is valid everywhere; that is a deliberate escape hatch for a
 * general-purpose code and not the default.
 */
export function evaluateDiscountCode(
  record: Record<string, any> | null,
  options: { product?: string; now?: Date } = {}
): DiscountCodeResult {
  const code = normalizeDiscountCode(record?.Code__c);

  if (!record) {
    return {
      valid: false,
      code: '',
      reason: 'not_found',
      message: 'That code was not recognised.',
    };
  }

  if (record.Active__c !== true) {
    return {
      valid: false,
      code,
      reason: 'inactive',
      message: 'That code is no longer available.',
    };
  }

  const today = currentDateInDiscountTimezone(options.now || new Date());
  const startDate = toDateString(record.Start_Date__c);
  const endDate = toDateString(record.End_Date__c);

  if (startDate && today < startDate) {
    return {
      valid: false,
      code,
      reason: 'not_started',
      message: 'That code is not active yet.',
    };
  }

  // End_Date__c is the last day the code works, so the comparison is strictly
  // greater-than: a code ending 15 October is still good all day on the 15th.
  if (endDate && today > endDate) {
    return {
      valid: false,
      code,
      reason: 'expired',
      message: 'That code has expired.',
    };
  }

  const wantedProduct = (options.product || '').trim().toLowerCase();
  const recordProduct = isBlank(record.Product__c) ? '' : String(record.Product__c).trim().toLowerCase();
  if (recordProduct && wantedProduct && recordProduct !== wantedProduct) {
    return {
      valid: false,
      code,
      reason: 'wrong_product',
      message: 'That code cannot be used on this order.',
    };
  }

  const maxRedemptions = Number(record.Max_Redemptions__c);
  if (Number.isFinite(maxRedemptions) && maxRedemptions > 0) {
    const timesRedeemed = Number(record.Times_Redeemed__c) || 0;
    if (timesRedeemed >= maxRedemptions) {
      return {
        valid: false,
        code,
        reason: 'fully_redeemed',
        message: 'That code has already been fully redeemed.',
      };
    }
  }

  // Anything outside 1-100 is refused rather than clamped. A code saved at 0
  // would advertise a discount and take nothing off; one saved above 100 would
  // invert the order total. Both are a mis-keyed record, and applying a guess at
  // what was meant is worse than declining and letting somebody fix it.
  const percentOff = Number(record.Percent_Off__c);
  if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) {
    return {
      valid: false,
      code,
      reason: 'misconfigured',
      message: 'That code is not set up correctly. Please contact us.',
    };
  }

  return {
    valid: true,
    code,
    // Rounded to a whole percent, matching the field's scale of 0. Everything
    // downstream multiplies a cent total by this, so a stray fraction would show
    // up as a rounding difference between what the form quotes and what is
    // charged.
    percentOff: Math.round(percentOff),
    label: typeof record.Name === 'string' && record.Name.trim() ? record.Name.trim() : undefined,
  };
}

/**
 * Looks codes up in Salesforce and evaluates them.
 *
 * The negative cache is per process, so it is per Function App instance and is
 * lost on a restart. That is fine for what it is for - taking the edge off
 * repeated guesses at codes that do not exist, and off the Salesforce API quota
 * those guesses would otherwise spend. It is not, and is not relied on as, a
 * security control.
 */
export class DiscountCodeService {
  private salesforceService: SalesforceService;
  private negativeCache = new Map<string, number>();

  constructor(salesforceService: SalesforceService) {
    this.salesforceService = salesforceService;
  }

  private cacheKey(code: string, product: string): string {
    return `${product}|${code}`;
  }

  private rememberMiss(key: string): void {
    if (this.negativeCache.size >= NEGATIVE_CACHE_MAX_ENTRIES) {
      // Map iterates in insertion order, so the first key is the oldest.
      const oldest = this.negativeCache.keys().next();
      if (!oldest.done) this.negativeCache.delete(oldest.value);
    }
    this.negativeCache.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
  }

  private isRememberedMiss(key: string): boolean {
    const expiresAt = this.negativeCache.get(key);
    if (expiresAt === undefined) return false;
    if (Date.now() >= expiresAt) {
      this.negativeCache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Resolve one code. Rejects only if Salesforce itself could not be reached -
   * a code that is simply no good comes back as a result with valid: false, so
   * the caller can tell the two apart.
   */
  async resolve(rawCode: unknown, product?: string): Promise<DiscountCodeResult> {
    const code = normalizeDiscountCode(rawCode);

    if (!code) {
      return {
        valid: false,
        code: '',
        reason: 'not_found',
        message: 'That code was not recognised.',
      };
    }

    const key = this.cacheKey(code, (product || '').trim().toLowerCase());
    if (this.isRememberedMiss(key)) {
      return {
        valid: false,
        code,
        reason: 'not_found',
        message: 'That code was not recognised.',
      };
    }

    const record = await this.salesforceService.getDiscountCodeByCode(code);
    const result = evaluateDiscountCode(record, { product });

    if (!record) {
      this.rememberMiss(key);
      // evaluateDiscountCode has no code to echo when the record is missing, but
      // the caller asked about a specific one and should see it back.
      return { ...result, code };
    }

    return result;
  }
}
