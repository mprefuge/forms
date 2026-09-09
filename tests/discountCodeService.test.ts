import {
  normalizeDiscountCode,
  currentDateInDiscountTimezone,
  evaluateDiscountCode,
  DiscountCodeService,
} from '../src/services/discountCodeService';
import { SalesforceService } from '../src/services/salesforceService';

const baseRecord = (overrides: Record<string, any> = {}) => ({
  Id: 'a0X000000000001',
  Name: 'Russell Moore podcast',
  Code__c: 'RUSSELLMOORE',
  Percent_Off__c: 25,
  Active__c: true,
  Start_Date__c: null,
  End_Date__c: null,
  Product__c: 'hospitality-guide',
  Max_Redemptions__c: null,
  Times_Redeemed__c: 0,
  ...overrides,
});

describe('normalizeDiscountCode', () => {
  it('upper-cases and trims what the buyer typed', () => {
    expect(normalizeDiscountCode('  russellmoore ')).toBe('RUSSELLMOORE');
  });

  it('strips spaces and punctuation rather than rejecting them', () => {
    expect(normalizeDiscountCode('Russell Moore!')).toBe('RUSSELLMOORE');
  });

  it('keeps hyphens and underscores, which are part of the code', () => {
    expect(normalizeDiscountCode('spring-2026_vip')).toBe('SPRING-2026_VIP');
  });

  it('cannot produce a quote or a backslash, so the result is safe in SOQL', () => {
    // escapeSoql in SalesforceService only escapes quotes, so a trailing
    // backslash would escape the closing quote of the literal. Normalising the
    // code first is what closes that off.
    expect(normalizeDiscountCode("X' OR Name != '")).toBe('XORNAME');
    expect(normalizeDiscountCode('EVIL\\')).toBe('EVIL');
  });

  it('truncates to the length Code__c can hold', () => {
    expect(normalizeDiscountCode('A'.repeat(80))).toHaveLength(40);
  });

  it('returns empty for nothing at all', () => {
    expect(normalizeDiscountCode(null)).toBe('');
    expect(normalizeDiscountCode(undefined)).toBe('');
    expect(normalizeDiscountCode('   ')).toBe('');
  });
});

describe('currentDateInDiscountTimezone', () => {
  it('reports the Eastern date, not the UTC one, late in the evening', () => {
    // 15 Oct 2026 01:30 UTC is still 14 Oct in New York. A code ending on the
    // 14th has to still work for that buyer.
    expect(currentDateInDiscountTimezone(new Date('2026-10-15T01:30:00Z'))).toBe('2026-10-14');
  });

  it('handles the daylight-saving change that falls inside the launch window', () => {
    // EDT ends 1 Nov 2026. 04:30 UTC on 1 Nov is 00:30 EDT, still the 1st.
    expect(currentDateInDiscountTimezone(new Date('2026-11-01T04:30:00Z'))).toBe('2026-11-01');
    // 05:30 UTC on 2 Nov is 00:30 EST, the 2nd - an offset the old hardcoded
    // -04:00 boundaries would have got wrong.
    expect(currentDateInDiscountTimezone(new Date('2026-11-02T05:30:00Z'))).toBe('2026-11-02');
  });
});

describe('evaluateDiscountCode', () => {
  const now = new Date('2026-09-09T15:00:00Z');

  it('accepts an active code with no dates', () => {
    const result = evaluateDiscountCode(baseRecord(), { product: 'hospitality-guide', now });
    expect(result).toMatchObject({
      valid: true,
      code: 'RUSSELLMOORE',
      percentOff: 25,
      label: 'Russell Moore podcast',
    });
  });

  it('refuses a code that does not exist', () => {
    const result = evaluateDiscountCode(null, { product: 'hospitality-guide', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
    expect(result.percentOff).toBeUndefined();
  });

  it('refuses a deactivated code whatever its dates say', () => {
    const record = baseRecord({ Active__c: false, Start_Date__c: '2026-01-01', End_Date__c: '2027-01-01' });
    const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('inactive');
  });

  it('refuses a code whose start date has not arrived', () => {
    const record = baseRecord({ Start_Date__c: '2026-09-10' });
    const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_started');
  });

  it('accepts a code on its start date', () => {
    const record = baseRecord({ Start_Date__c: '2026-09-09' });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it('accepts a code on its end date, because End Date is inclusive', () => {
    const record = baseRecord({ End_Date__c: '2026-09-09' });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it('refuses a code the day after its end date', () => {
    const record = baseRecord({ End_Date__c: '2026-09-08' });
    const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('judges the window in Eastern time, so a code does not expire early for an Eastern buyer', () => {
    // 03:00 UTC on 10 Sep is 23:00 on 9 Sep in New York, and a code ending on
    // the 9th is still good. Comparing UTC dates would have refused it.
    const record = baseRecord({ End_Date__c: '2026-09-09' });
    const result = evaluateDiscountCode(record, {
      product: 'hospitality-guide',
      now: new Date('2026-09-10T03:00:00Z'),
    });
    expect(result.valid).toBe(true);
  });

  it('accepts a Salesforce datetime string in a date field', () => {
    const record = baseRecord({ End_Date__c: '2026-09-09T00:00:00.000+0000' });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it('refuses a code issued for a different product', () => {
    const record = baseRecord({ Product__c: 'something-else' });
    const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_product');
  });

  it('accepts a code with no product against any product', () => {
    const record = baseRecord({ Product__c: null });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it('matches the product case-insensitively', () => {
    const record = baseRecord({ Product__c: 'Hospitality-Guide' });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it('refuses a code that has hit its redemption limit', () => {
    const record = baseRecord({ Max_Redemptions__c: 10, Times_Redeemed__c: 10 });
    const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('fully_redeemed');
  });

  it('accepts a code with redemptions still left', () => {
    const record = baseRecord({ Max_Redemptions__c: 10, Times_Redeemed__c: 9 });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it('treats a blank redemption limit as no limit', () => {
    const record = baseRecord({ Max_Redemptions__c: null, Times_Redeemed__c: 5000 });
    expect(evaluateDiscountCode(record, { product: 'hospitality-guide', now }).valid).toBe(true);
  });

  it.each([0, -5, 101, 250, null, undefined, 'abc'])(
    'refuses rather than guesses when Percent Off is %p',
    (percent) => {
      const record = baseRecord({ Percent_Off__c: percent });
      const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('misconfigured');
      expect(result.percentOff).toBeUndefined();
    }
  );

  it('accepts the boundary percentages', () => {
    expect(evaluateDiscountCode(baseRecord({ Percent_Off__c: 1 }), { product: 'hospitality-guide', now }).percentOff).toBe(1);
    expect(evaluateDiscountCode(baseRecord({ Percent_Off__c: 100 }), { product: 'hospitality-guide', now }).percentOff).toBe(100);
  });

  it('never returns anything a buyer should not see', () => {
    const record = baseRecord({ Notes__c: 'Issued to Russell Moore, do not share' });
    const result = evaluateDiscountCode(record, { product: 'hospitality-guide', now });
    expect(Object.keys(result).sort()).toEqual(['code', 'label', 'percentOff', 'valid']);
    expect(JSON.stringify(result)).not.toContain('do not share');
    expect(JSON.stringify(result)).not.toContain('a0X000000000001');
  });
});

describe('DiscountCodeService', () => {
  const buildService = (lookup: jest.Mock) => {
    const sf = new SalesforceService({
      loginUrl: 'https://login.salesforce.com',
      clientId: 'id',
      clientSecret: 'secret',
    });
    (sf as any).getDiscountCodeByCode = lookup;
    return { service: new DiscountCodeService(sf), lookup };
  };

  it('normalizes before it queries, so the buyer can type it however they like', async () => {
    const lookup = jest.fn().mockResolvedValue(baseRecord());
    const { service } = buildService(lookup);

    const result = await service.resolve(' russell moore ', 'hospitality-guide');

    expect(lookup).toHaveBeenCalledWith('RUSSELLMOORE');
    expect(result.valid).toBe(true);
    expect(result.percentOff).toBe(25);
  });

  it('does not query Salesforce at all for an empty code', async () => {
    const lookup = jest.fn();
    const { service } = buildService(lookup);

    const result = await service.resolve('   ', 'hospitality-guide');

    expect(lookup).not.toHaveBeenCalled();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('caches a miss so repeated guesses do not each spend a Salesforce API call', async () => {
    const lookup = jest.fn().mockResolvedValue(null);
    const { service } = buildService(lookup);

    const first = await service.resolve('NOPE', 'hospitality-guide');
    const second = await service.resolve('nope', 'hospitality-guide');

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(first.reason).toBe('not_found');
    expect(second.reason).toBe('not_found');
    expect(second.code).toBe('NOPE');
  });

  it('never caches a hit, so unticking Active takes effect immediately', async () => {
    const lookup = jest.fn().mockResolvedValue(baseRecord());
    const { service } = buildService(lookup);

    await service.resolve('RUSSELLMOORE', 'hospitality-guide');
    lookup.mockResolvedValue(baseRecord({ Active__c: false }));
    const second = await service.resolve('RUSSELLMOORE', 'hospitality-guide');

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe('inactive');
  });

  it('keeps the miss cache per product, so a code scoped elsewhere is still checked', async () => {
    const lookup = jest.fn().mockResolvedValue(null);
    const { service } = buildService(lookup);

    await service.resolve('NOPE', 'hospitality-guide');
    await service.resolve('NOPE', 'other-product');

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('propagates a Salesforce failure rather than reporting the code as bad', async () => {
    // The distinction matters: a buyer holding a perfectly good code must be
    // told to try again, not quietly charged full price.
    const lookup = jest.fn().mockRejectedValue(new Error('Salesforce unavailable'));
    const { service } = buildService(lookup);

    await expect(service.resolve('RUSSELLMOORE', 'hospitality-guide')).rejects.toThrow(
      'Salesforce unavailable'
    );
  });
});

describe('SalesforceService.getDiscountCodeByCode', () => {
  const buildSalesforce = (queryMock: jest.Mock) => {
    const sf = new SalesforceService({
      loginUrl: 'https://login.salesforce.com',
      clientId: 'id',
      clientSecret: 'secret',
    });
    (sf as any).connection = { query: queryMock };
    return sf;
  };

  it('queries Discount_Code__c by code and returns the record', async () => {
    const query = jest.fn().mockResolvedValue({ records: [baseRecord()] });
    const sf = buildSalesforce(query);

    const record = await sf.getDiscountCodeByCode('RUSSELLMOORE');

    expect(query).toHaveBeenCalledTimes(1);
    const soql = query.mock.calls[0][0];
    expect(soql).toContain('FROM Discount_Code__c');
    expect(soql).toContain("Code__c = 'RUSSELLMOORE'");
    expect(soql).toContain('LIMIT 1');
    expect(record).toMatchObject({ Code__c: 'RUSSELLMOORE' });
  });

  it('returns null when no code matches', async () => {
    const sf = buildSalesforce(jest.fn().mockResolvedValue({ records: [] }));
    expect(await sf.getDiscountCodeByCode('NOPE')).toBeNull();
  });

  it('refuses to build a query from a code outside the redeemable character set', async () => {
    // Defence in depth: callers are expected to normalise first, and this is
    // what catches a caller that forgets.
    const query = jest.fn();
    const sf = buildSalesforce(query);

    await expect(sf.getDiscountCodeByCode("X' OR Id != null--")).rejects.toThrow(
      'Invalid discount code format'
    );
    await expect(sf.getDiscountCodeByCode('EVIL\\')).rejects.toThrow('Invalid discount code format');
    await expect(sf.getDiscountCodeByCode('lowercase')).rejects.toThrow('Invalid discount code format');
    expect(query).not.toHaveBeenCalled();
  });

  it('never selects internal-only fields', async () => {
    const query = jest.fn().mockResolvedValue({ records: [baseRecord()] });
    const sf = buildSalesforce(query);

    await sf.getDiscountCodeByCode('RUSSELLMOORE');

    expect(query.mock.calls[0][0]).not.toContain('Notes__c');
  });
});
