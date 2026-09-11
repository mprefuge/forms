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
  | 'wrong_campaign'
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
 * Compare two Salesforce ids.
 *
 * The same record has a 15-character case-sensitive id and an 18-character
 * case-insensitive one, and which of the two you get depends on the API that
 * handed it over. Comparing the raw strings reports the same record as two
 * different ones, so both are trimmed to 15 first.
 */
function sameSalesforceId(a: string, b: string): boolean {
  return a.slice(0, 15) === b.slice(0, 15);
}

/**
 * Decide whether a Discount_Code__c record may be redeemed right now, against
 * this campaign.
 *
 * Pure and synchronous, so every branch below is testable without a Salesforce
 * connection - which matters, because these branches decide what a buyer pays.
 *
 * `campaignId` is the campaign the ORDER will be filed under, and it must match
 * the campaign the code belongs to. That is the whole point of scoping by
 * campaign rather than by a product string: the code is checked against the
 * same record the money lands on, so a code cannot discount a purchase it was
 * never issued for. Salesforce ids are compared on their first 15 characters,
 * since the 15- and 18-character forms of the same id are the same record.
 */
export function evaluateDiscountCode(
  record: Record<string, any> | null,
  options: { campaignId?: string; now?: Date } = {}
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

  // Campaign__c is required on the object, so a blank one means the record was
  // created before that constraint or through a path that bypassed it. Either
  // way an unscoped code is refused rather than treated as valid everywhere:
  // this is money, and the safe reading of a missing scope is "no scope".
  const recordCampaign = isBlank(record.Campaign__c) ? '' : String(record.Campaign__c).trim();
  const wantedCampaign = (options.campaignId || '').trim();
  if (!recordCampaign || !wantedCampaign || !sameSalesforceId(recordCampaign, wantedCampaign)) {
    return {
      valid: false,
      code,
      reason: 'wrong_campaign',
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
/**
 * How informative each refusal is about the code the buyer just typed, most
 * informative first.
 *
 * Only consulted when a code has SEVERAL records and not one of them can be
 * redeemed today - which is the whole reason duplicates exist, since a partner
 * keeping RUSSELLMOORE year after year will accumulate windows. With a single
 * record there is one answer and this changes nothing.
 *
 * The order is about what a buyer can act on. "Already fully redeemed" and "not
 * active yet" both describe a window that is current or still to come, so they
 * beat "expired", which would otherwise be reported from an old window and read
 * as "never again" to somebody holding a code that starts next week.
 */
const REFUSAL_PRIORITY: ReadonlyArray<DiscountCodeRejection> = [
  'fully_redeemed',
  'not_started',
  'expired',
  'wrong_campaign',
  'inactive',
  'misconfigured',
  'not_found',
];

/**
 * Pick the one record that applies, out of every record carrying this code.
 *
 * A code is no longer unique: the same string may exist several times with
 * different dates and percentages, so that a partner can keep their code and
 * the offer behind it can change. Exactly one of those windows should contain
 * any given day, and this finds it.
 *
 * TWO RECORDS WITH OVERLAPPING WINDOWS ARE A DATA ERROR nothing in Salesforce
 * can prevent - a validation rule cannot see other records. The behaviour is
 * still defined rather than arbitrary: records arrive newest-window-first, so
 * the later-starting one wins. Defined is not the same as correct, which is why
 * the field help says to keep the windows apart.
 */
export function selectDiscountCode(
  records: ReadonlyArray<Record<string, any>> | null | undefined,
  options: { campaignId?: string; now?: Date } = {}
): DiscountCodeResult {
  const list = Array.isArray(records) ? records : [];

  if (list.length === 0) {
    return evaluateDiscountCode(null, options);
  }

  const results = list.map((record) => evaluateDiscountCode(record, options));

  const redeemable = results.find((result) => result.valid);
  if (redeemable) {
    return redeemable;
  }

  for (const reason of REFUSAL_PRIORITY) {
    const match = results.find((result) => result.reason === reason);
    if (match) {
      return match;
    }
  }

  return results[0];
}

export class DiscountCodeService {
  private salesforceService: SalesforceService;
  private negativeCache = new Map<string, number>();

  constructor(salesforceService: SalesforceService) {
    this.salesforceService = salesforceService;
  }

  private cacheKey(code: string, campaignId: string): string {
    return `${campaignId}|${code}`;
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
  async resolve(rawCode: unknown, campaignId?: string): Promise<DiscountCodeResult> {
    const code = normalizeDiscountCode(rawCode);

    if (!code) {
      return {
        valid: false,
        code: '',
        reason: 'not_found',
        message: 'That code was not recognised.',
      };
    }

    const key = this.cacheKey(code, (campaignId || '').trim().slice(0, 15));
    if (this.isRememberedMiss(key)) {
      return {
        valid: false,
        code,
        reason: 'not_found',
        message: 'That code was not recognised.',
      };
    }

    const records = await this.salesforceService.getDiscountCodesByCode(code);
    const result = selectDiscountCode(records, { campaignId });

    if (records.length === 0) {
      this.rememberMiss(key);
      // selectDiscountCode has no code to echo when nothing matched, but the
      // caller asked about a specific one and should see it back.
      return { ...result, code };
    }

    return result;
  }
}
