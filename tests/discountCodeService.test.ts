import {
  normalizeDiscountCode,
  currentDateInDiscountTimezone,
  evaluateDiscountCode,
  selectDiscountCode,
  DiscountCodeService,
} from '../src/services/discountCodeService';
import { SalesforceService } from '../src/services/salesforceService';

const CAMPAIGN = '701UQ00000m6oRWYAY';

const baseRecord = (overrides: Record<string, any> = {}) => ({
  Id: 'a0X000000000001',
  Name: 'Russell Moore podcast',
  Code__c: 'RUSSELLMOORE',
  Percent_Off__c: 25,
  Active__c: true,
  Start_Date__c: null,
  End_Date__c: null,
  Campaign__c: '701UQ00000m6oRWYAY',
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
    const result = evaluateDiscountCode(baseRecord(), { campaignId: CAMPAIGN, now });
    expect(result).toMatchObject({
      valid: true,
      code: 'RUSSELLMOORE',
      percentOff: 25,
      label: 'Russell Moore podcast',
    });
  });

  it('refuses a code that does not exist', () => {
    const result = evaluateDiscountCode(null, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
    expect(result.percentOff).toBeUndefined();
  });

  it('refuses a deactivated code whatever its dates say', () => {
    const record = baseRecord({ Active__c: false, Start_Date__c: '2026-01-01', End_Date__c: '2027-01-01' });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('inactive');
  });

  it('refuses a code whose start date has not arrived', () => {
    const record = baseRecord({ Start_Date__c: '2026-09-10' });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_started');
  });

  it('accepts a code on its start date', () => {
    const record = baseRecord({ Start_Date__c: '2026-09-09' });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
  });

  it('accepts a code on its end date, because End Date is inclusive', () => {
    const record = baseRecord({ End_Date__c: '2026-09-09' });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
  });

  it('refuses a code the day after its end date', () => {
    const record = baseRecord({ End_Date__c: '2026-09-08' });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('judges the window in Eastern time, so a code does not expire early for an Eastern buyer', () => {
    // 03:00 UTC on 10 Sep is 23:00 on 9 Sep in New York, and a code ending on
    // the 9th is still good. Comparing UTC dates would have refused it.
    const record = baseRecord({ End_Date__c: '2026-09-09' });
    const result = evaluateDiscountCode(record, {
      campaignId: CAMPAIGN,
      now: new Date('2026-09-10T03:00:00Z'),
    });
    expect(result.valid).toBe(true);
  });

  it('accepts a Salesforce datetime string in a date field', () => {
    const record = baseRecord({ End_Date__c: '2026-09-09T00:00:00.000+0000' });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
  });

  it('refuses a code issued against a different campaign', () => {
    const record = baseRecord({ Campaign__c: '701UQ00000OTHER0AAA' });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_campaign');
  });

  it('treats the 15- and 18-character forms of an id as the same campaign', () => {
    // Which form you get depends on the API that handed it over, and a raw
    // string comparison would report one record as two.
    const record = baseRecord({ Campaign__c: '701UQ00000m6oRW' });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
    const flipped = baseRecord({ Campaign__c: CAMPAIGN });
    expect(evaluateDiscountCode(flipped, { campaignId: '701UQ00000m6oRW', now }).valid).toBe(true);
  });

  it('refuses a code with no campaign rather than treating it as valid everywhere', () => {
    // Campaign__c is required on the object, so a blank one means something
    // bypassed that. The safe reading of a missing scope is "no scope".
    const record = baseRecord({ Campaign__c: null });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_campaign');
  });

  it('refuses a code when the caller names no campaign at all', () => {
    const result = evaluateDiscountCode(baseRecord(), { now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_campaign');
  });

  it('refuses a code that has hit its redemption limit', () => {
    const record = baseRecord({ Max_Redemptions__c: 10, Times_Redeemed__c: 10 });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('fully_redeemed');
  });

  it('accepts a code with redemptions still left', () => {
    const record = baseRecord({ Max_Redemptions__c: 10, Times_Redeemed__c: 9 });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
  });

  it('treats a blank redemption limit as no limit', () => {
    const record = baseRecord({ Max_Redemptions__c: null, Times_Redeemed__c: 5000 });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
  });

  it.each([0, -5, 101, 250, null, undefined, 'abc'])(
    'refuses rather than guesses when Percent Off is %p',
    (percent) => {
      const record = baseRecord({ Percent_Off__c: percent });
      const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('misconfigured');
      expect(result.percentOff).toBeUndefined();
    }
  );

  it('accepts the boundary percentages', () => {
    expect(evaluateDiscountCode(baseRecord({ Percent_Off__c: 1 }), { campaignId: CAMPAIGN, now }).percentOff).toBe(1);
    expect(evaluateDiscountCode(baseRecord({ Percent_Off__c: 100 }), { campaignId: CAMPAIGN, now }).percentOff).toBe(100);
  });

  it('never returns anything a buyer should not see', () => {
    const record = baseRecord({
      Notes__c: 'Issued to Russell Moore, do not share',
      Max_Redemptions__c: 500,
      Times_Redeemed__c: 118,
    });
    const result = evaluateDiscountCode(record, { campaignId: CAMPAIGN, now });
    // The window's id is the one internal value that does come back, and only
    // because the order has to be filed against the window it was priced from.
    // Notes and redemption counts stay where they are.
    expect(Object.keys(result).sort()).toEqual(['code', 'id', 'label', 'percentOff', 'valid']);
    expect(JSON.stringify(result)).not.toContain('do not share');
    expect(JSON.stringify(result)).not.toContain('118');
  });

  it('carries the id of the window that answered', () => {
    const result = evaluateDiscountCode(baseRecord(), { campaignId: CAMPAIGN, now });
    expect(result.id).toBe('a0X000000000001');
  });

  it('does not carry an id when the code is refused', () => {
    const result = evaluateDiscountCode(baseRecord({ Active__c: false }), { campaignId: CAMPAIGN, now });
    expect(result.valid).toBe(false);
    expect(result.id).toBeUndefined();
  });

  it('counts a promised check against the cap alongside a settled payment', () => {
    // Ten orders paid, forty-one placed with a check in the post, cap of fifty.
    // Judged on the paid count alone this code is nowhere near its limit; judged
    // honestly it is one past it.
    const record = baseRecord({
      Max_Redemptions__c: 50,
      Times_Redeemed__c: 10,
      Check_Redemptions__c: 41,
      Total_Redemptions__c: 51,
    });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).reason).toBe('fully_redeemed');
  });

  it('falls back to the raw counts when the total formula is not visible', () => {
    // Field-level security is per permission set and a query simply omits what
    // the running user cannot see. The larger raw count is still a floor, and
    // refusing sooner is the right way to be wrong about money.
    const record = baseRecord({
      Max_Redemptions__c: 50,
      Times_Redeemed__c: 60,
    });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).reason).toBe('fully_redeemed');
  });

  it('still redeems while both halves are under the cap', () => {
    const record = baseRecord({
      Max_Redemptions__c: 50,
      Times_Redeemed__c: 10,
      Check_Redemptions__c: 12,
      Total_Redemptions__c: 22,
    });
    expect(evaluateDiscountCode(record, { campaignId: CAMPAIGN, now }).valid).toBe(true);
  });
});

describe('DiscountCodeService', () => {
  const buildService = (lookup: jest.Mock) => {
    const sf = new SalesforceService({
      loginUrl: 'https://login.salesforce.com',
      clientId: 'id',
      clientSecret: 'secret',
    });
    (sf as any).getDiscountCodesByCode = lookup;
    return { service: new DiscountCodeService(sf), lookup };
  };

  it('normalizes before it queries, so the buyer can type it however they like', async () => {
    const lookup = jest.fn().mockResolvedValue([baseRecord()]);
    const { service } = buildService(lookup);

    const result = await service.resolve(' russell moore ', CAMPAIGN);

    expect(lookup).toHaveBeenCalledWith('RUSSELLMOORE');
    expect(result.valid).toBe(true);
    expect(result.percentOff).toBe(25);
  });

  it('does not query Salesforce at all for an empty code', async () => {
    const lookup = jest.fn();
    const { service } = buildService(lookup);

    const result = await service.resolve('   ', CAMPAIGN);

    expect(lookup).not.toHaveBeenCalled();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('caches a miss so repeated guesses do not each spend a Salesforce API call', async () => {
    const lookup = jest.fn().mockResolvedValue([]);
    const { service } = buildService(lookup);

    const first = await service.resolve('NOPE', CAMPAIGN);
    const second = await service.resolve('nope', CAMPAIGN);

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(first.reason).toBe('not_found');
    expect(second.reason).toBe('not_found');
    expect(second.code).toBe('NOPE');
  });

  it('never caches a hit, so unticking Active takes effect immediately', async () => {
    const lookup = jest.fn().mockResolvedValue([baseRecord()]);
    const { service } = buildService(lookup);

    await service.resolve('RUSSELLMOORE', CAMPAIGN);
    lookup.mockResolvedValue([baseRecord({ Active__c: false })]);
    const second = await service.resolve('RUSSELLMOORE', CAMPAIGN);

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe('inactive');
  });

  it('keeps the miss cache per campaign, so a code scoped elsewhere is still checked', async () => {
    const lookup = jest.fn().mockResolvedValue([]);
    const { service } = buildService(lookup);

    await service.resolve('NOPE', CAMPAIGN);
    await service.resolve('NOPE', '701UQ00000OTHER0AAA');

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('propagates a Salesforce failure rather than reporting the code as bad', async () => {
    // The distinction matters: a buyer holding a perfectly good code must be
    // told to try again, not quietly charged full price.
    const lookup = jest.fn().mockRejectedValue(new Error('Salesforce unavailable'));
    const { service } = buildService(lookup);

    await expect(service.resolve('RUSSELLMOORE', CAMPAIGN)).rejects.toThrow(
      'Salesforce unavailable'
    );
  });
});

describe('selectDiscountCode', () => {
  // The case this exists for: one partner, one code, a different offer each
  // month. Both records are real and both stay in Salesforce.
  const september = () =>
    baseRecord({ Percent_Off__c: 25, Start_Date__c: '2026-09-01', End_Date__c: '2026-09-30' });
  const october = () =>
    baseRecord({ Percent_Off__c: 15, Start_Date__c: '2026-10-01', End_Date__c: '2026-10-31' });

  // Newest window first, the way the query returns them.
  const bothWindows = () => [october(), september()];

  it('applies the window the order falls in, not the newest record', () => {
    const result = selectDiscountCode(bothWindows(), {
      campaignId: CAMPAIGN,
      now: new Date('2026-09-11T12:00:00Z'),
    });

    expect(result.valid).toBe(true);
    expect(result.percentOff).toBe(25);
  });

  it('applies the next window once the first has ended', () => {
    const result = selectDiscountCode(bothWindows(), {
      campaignId: CAMPAIGN,
      now: new Date('2026-10-11T12:00:00Z'),
    });

    expect(result.valid).toBe(true);
    expect(result.percentOff).toBe(15);
  });

  it('honours the last day of a window', () => {
    const result = selectDiscountCode(bothWindows(), {
      campaignId: CAMPAIGN,
      now: new Date('2026-09-30T23:00:00Z'),
    });

    expect(result.valid).toBe(true);
    expect(result.percentOff).toBe(25);
  });

  it('is unchanged for a code with only one window', () => {
    const result = selectDiscountCode([september()], {
      campaignId: CAMPAIGN,
      now: new Date('2026-09-11T12:00:00Z'),
    });

    expect(result).toEqual(
      evaluateDiscountCode(september(), {
        campaignId: CAMPAIGN,
        now: new Date('2026-09-11T12:00:00Z'),
      })
    );
  });

  it('reports a future window rather than an expired one', () => {
    // Between the two windows. "Expired" would read as "never again" to
    // somebody holding a code that starts next week.
    const result = selectDiscountCode(
      [october(), baseRecord({ Start_Date__c: '2026-08-01', End_Date__c: '2026-08-31' })],
      { campaignId: CAMPAIGN, now: new Date('2026-09-15T12:00:00Z') }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_started');
  });

  it('reports expired when every window is past', () => {
    const result = selectDiscountCode(bothWindows(), {
      campaignId: CAMPAIGN,
      now: new Date('2026-12-01T12:00:00Z'),
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('prefers a fully-redeemed current window over an expired one', () => {
    const result = selectDiscountCode(
      [
        baseRecord({
          Start_Date__c: '2026-09-01',
          End_Date__c: '2026-09-30',
          Max_Redemptions__c: 5,
          Times_Redeemed__c: 5,
        }),
        baseRecord({ Start_Date__c: '2026-08-01', End_Date__c: '2026-08-31' }),
      ],
      { campaignId: CAMPAIGN, now: new Date('2026-09-11T12:00:00Z') }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('fully_redeemed');
  });

  it('skips an inactive window and uses a live one', () => {
    // Unticking Active on one year's record must not take the code down.
    const result = selectDiscountCode(
      [
        baseRecord({ Active__c: false, Start_Date__c: '2026-09-05', End_Date__c: '2026-09-20' }),
        september(),
      ],
      { campaignId: CAMPAIGN, now: new Date('2026-09-11T12:00:00Z') }
    );

    expect(result.valid).toBe(true);
    expect(result.percentOff).toBe(25);
  });

  it('picks the later-starting window when two overlap, rather than an arbitrary one', () => {
    // Overlapping windows are a data error no validation rule can catch, since
    // Salesforce cannot compare across records. The behaviour still has to be
    // defined: newest window wins, every time.
    const overlapping = [
      baseRecord({ Percent_Off__c: 15, Start_Date__c: '2026-09-10', End_Date__c: '2026-09-30' }),
      baseRecord({ Percent_Off__c: 25, Start_Date__c: '2026-09-01', End_Date__c: '2026-09-30' }),
    ];

    for (let i = 0; i < 3; i++) {
      const result = selectDiscountCode(overlapping, {
        campaignId: CAMPAIGN,
        now: new Date('2026-09-11T12:00:00Z'),
      });
      expect(result.percentOff).toBe(15);
    }
  });

  it('treats no records the same as no code', () => {
    const result = selectDiscountCode([], { campaignId: CAMPAIGN });
    expect(result).toMatchObject({ valid: false, reason: 'not_found' });
  });

  it('refuses a window belonging to another campaign even when its dates fit', () => {
    const result = selectDiscountCode(
      [baseRecord({ Campaign__c: '701UQ00000OTHER0AAA', Start_Date__c: '2026-09-01', End_Date__c: '2026-09-30' })],
      { campaignId: CAMPAIGN, now: new Date('2026-09-11T12:00:00Z') }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('wrong_campaign');
  });
});

describe('SalesforceService.getDiscountCodesByCode', () => {
  const buildSalesforce = (queryMock: jest.Mock) => {
    const sf = new SalesforceService({
      loginUrl: 'https://login.salesforce.com',
      clientId: 'id',
      clientSecret: 'secret',
    });
    (sf as any).connection = { query: queryMock };
    return sf;
  };

  it('queries Discount_Code__c by code and returns every window', async () => {
    const query = jest.fn().mockResolvedValue({ records: [baseRecord()] });
    const sf = buildSalesforce(query);

    const records = await sf.getDiscountCodesByCode('RUSSELLMOORE');

    expect(query).toHaveBeenCalledTimes(1);
    const soql = query.mock.calls[0][0];
    expect(soql).toContain('FROM Discount_Code__c');
    expect(soql).toContain("Code__c = 'RUSSELLMOORE'");
    // Newest window first, and bounded - the code is no longer unique, so a
    // LIMIT 1 here would pick an arbitrary year's offer.
    expect(soql).toContain('ORDER BY Start_Date__c DESC NULLS LAST');
    expect(soql).toContain('LIMIT 25');
    expect(soql).not.toContain('LIMIT 1 ');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ Code__c: 'RUSSELLMOORE' });
  });

  it('returns an empty list when no code matches', async () => {
    const sf = buildSalesforce(jest.fn().mockResolvedValue({ records: [] }));
    expect(await sf.getDiscountCodesByCode('NOPE')).toEqual([]);
  });

  it('refuses to build a query from a code outside the redeemable character set', async () => {
    // Defence in depth: callers are expected to normalise first, and this is
    // what catches a caller that forgets.
    const query = jest.fn();
    const sf = buildSalesforce(query);

    await expect(sf.getDiscountCodesByCode("X' OR Id != null--")).rejects.toThrow(
      'Invalid discount code format'
    );
    await expect(sf.getDiscountCodesByCode('EVIL\\')).rejects.toThrow('Invalid discount code format');
    await expect(sf.getDiscountCodesByCode('lowercase')).rejects.toThrow('Invalid discount code format');
    expect(query).not.toHaveBeenCalled();
  });

  it('never selects internal-only fields', async () => {
    const query = jest.fn().mockResolvedValue({ records: [baseRecord()] });
    const sf = buildSalesforce(query);

    await sf.getDiscountCodesByCode('RUSSELLMOORE');

    expect(query.mock.calls[0][0]).not.toContain('Notes__c');
  });

  it('selects the campaign the code is scoped to', async () => {
    const query = jest.fn().mockResolvedValue({ records: [baseRecord()] });
    const sf = buildSalesforce(query);

    await sf.getDiscountCodesByCode('RUSSELLMOORE');

    expect(query.mock.calls[0][0]).toContain('Campaign__c');
  });
});
