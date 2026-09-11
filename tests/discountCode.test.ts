// @ts-nocheck
import {
  discountCodeHandler,
  __resetRateLimit,
  __resetCampaignCache,
} from '../src/functions/discountCode';
import { SalesforceService } from '../src/services/salesforceService';

jest.mock('../src/services/salesforceService');

const buildRequest = (query: Record<string, string>, headers: Record<string, string> = {}) => ({
  method: 'GET',
  query: {
    get: (key: string) => (key in query ? query[key] : null),
  },
  headers: {
    get: (key: string) => headers[key.toLowerCase()] ?? null,
  },
});

const context = { invocationId: 'discount-inv-1', log: jest.fn() };

const CAMPAIGN = '701UQ00000m6oRWYAY';

const parse = (response: any) => JSON.parse(response.body);

const activeRecord = (overrides: Record<string, any> = {}) => ({
  Id: 'a0X000000000001',
  Name: 'Russell Moore podcast',
  Code__c: 'RUSSELLMOORE',
  Percent_Off__c: 25,
  Active__c: true,
  Start_Date__c: null,
  End_Date__c: null,
  Campaign__c: CAMPAIGN,
  Max_Redemptions__c: null,
  Times_Redeemed__c: 0,
  ...overrides,
});

describe('discount-code endpoint', () => {
  let mockSf: any;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimit();
    __resetCampaignCache();

    mockSf = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      getDiscountCodesByCode: jest.fn().mockResolvedValue([activeRecord()]),
      getCampaignByNameWithFields: jest.fn().mockResolvedValue({ Id: CAMPAIGN }),
    };
    (SalesforceService as jest.MockedClass<any>).mockImplementation(() => mockSf);

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the discount for a valid code', async () => {
    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.5:41234' }),
      context
    );

    expect(response.status).toBe(200);
    expect(parse(response)).toEqual({
      valid: true,
      code: 'RUSSELLMOORE',
      percentOff: 25,
      label: 'Russell Moore podcast',
    });
  });

  it('accepts the code however the buyer typed it', async () => {
    const response = await discountCodeHandler(
      buildRequest({ code: ' russell moore ', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.6' }),
      context
    );

    expect(mockSf.getDiscountCodesByCode).toHaveBeenCalledWith('RUSSELLMOORE');
    expect(parse(response).valid).toBe(true);
  });

  it('reports an unknown code as invalid, not as an error', async () => {
    mockSf.getDiscountCodesByCode.mockResolvedValue([]);

    const response = await discountCodeHandler(
      buildRequest({ code: 'NOPE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.7' }),
      context
    );

    expect(response.status).toBe(200);
    expect(parse(response)).toMatchObject({ valid: false, reason: 'not_found' });
  });

  it('rejects a request with no code', async () => {
    const response = await discountCodeHandler(buildRequest({}), context);

    expect(response.status).toBe(400);
    expect(mockSf.authenticate).not.toHaveBeenCalled();
  });

  it('rejects a code that normalizes away to nothing', async () => {
    const response = await discountCodeHandler(buildRequest({ code: '!!!', campaign: 'Hospitality Guide' }), context);

    expect(response.status).toBe(400);
    expect(mockSf.getDiscountCodesByCode).not.toHaveBeenCalled();
  });

  it('never lets the response be cached', async () => {
    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.8' }),
      context
    );

    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('answers 502, not a bad-code verdict, when Salesforce cannot be reached', async () => {
    // A buyer holding a good code has to be told to try again. Reporting the
    // code as invalid would charge them full price for a code that works.
    mockSf.getDiscountCodesByCode.mockRejectedValue(new Error('ECONNRESET'));

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.9' }),
      context
    );

    expect(response.status).toBe(502);
    expect(parse(response).valid).toBeUndefined();
  });

  it('answers 500 when the app is missing Salesforce credentials', async () => {
    mockSf.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.10' }),
      context
    );

    expect(response.status).toBe(500);
  });

  it('rate limits one client without affecting another', async () => {
    const hammer = buildRequest({ code: 'GUESS', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '198.51.100.1:5000' });

    let lastStatus = 200;
    for (let i = 0; i < 31; i++) {
      const response = await discountCodeHandler(hammer, context);
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);

    const other = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '198.51.100.2' }),
      context
    );
    expect(other.status).toBe(200);
  });

  it('tells a rate-limited caller how long to wait', async () => {
    const hammer = buildRequest({ code: 'GUESS', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '198.51.100.3' });
    let response;
    for (let i = 0; i < 31; i++) {
      response = await discountCodeHandler(hammer, context);
    }

    expect(response.status).toBe(429);
    expect(response.headers['Retry-After']).toBe('60');
  });

  it('treats a proxy chain by its first entry, not the whole header', async () => {
    const viaProxy = buildRequest({ code: 'GUESS', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '198.51.100.4:1111, 10.0.0.1, 10.0.0.2' });
    let response;
    for (let i = 0; i < 31; i++) {
      response = await discountCodeHandler(viaProxy, context);
    }
    expect(response.status).toBe(429);

    // The same client seen through a different proxy hop is still that client.
    const sameClientOtherHop = await discountCodeHandler(
      buildRequest({ code: 'GUESS', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '198.51.100.4:2222, 10.9.9.9' }),
      context
    );
    expect(sameClientOtherHop.status).toBe(429);
  });

  it('does not leak the record id or internal notes for a valid code', async () => {
    mockSf.getDiscountCodesByCode.mockResolvedValue([
      activeRecord({ Notes__c: 'Issued to Russell Moore, do not share' }),
    ]);

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.11' }),
      context
    );

    expect(response.body).not.toContain('a0X000000000001');
    expect(response.body).not.toContain('do not share');
  });

  it('refuses a code scoped to another campaign', async () => {
    mockSf.getDiscountCodesByCode.mockResolvedValue([
      activeRecord({ Campaign__c: '701UQ00000OTHER0AAA' }),
    ]);

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.12' }),
      context
    );

    expect(parse(response)).toMatchObject({ valid: false, reason: 'wrong_campaign' });
  });

  it('rejects a request that names no campaign', async () => {
    const response = await discountCodeHandler(buildRequest({ code: 'RUSSELLMOORE' }), context);

    expect(response.status).toBe(400);
    expect(mockSf.getDiscountCodesByCode).not.toHaveBeenCalled();
  });

  it('uses a Salesforce id directly without looking the campaign up', async () => {
    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: CAMPAIGN }, { 'x-forwarded-for': '203.0.113.13' }),
      context
    );

    expect(mockSf.getCampaignByNameWithFields).not.toHaveBeenCalled();
    expect(parse(response).valid).toBe(true);
  });

  it('refuses rather than errors when the campaign does not exist', async () => {
    mockSf.getCampaignByNameWithFields.mockResolvedValue(null);

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', campaign: 'No Such Campaign' }, { 'x-forwarded-for': '203.0.113.14' }),
      context
    );

    expect(response.status).toBe(200);
    expect(parse(response)).toMatchObject({ valid: false, reason: 'wrong_campaign' });
    // No point asking Salesforce about a code for a campaign that is not there.
    expect(mockSf.getDiscountCodesByCode).not.toHaveBeenCalled();
  });

  it('resolves a campaign name once and reuses it', async () => {
    // The campaign lookup is a second SOQL query against an org-wide API quota.
    // Paying it on every code a buyer tries is exactly what the cache avoids.
    for (let i = 0; i < 3; i++) {
      await discountCodeHandler(
        buildRequest({ code: 'RUSSELLMOORE', campaign: 'Hospitality Guide' }, { 'x-forwarded-for': '203.0.113.15' }),
        context
      );
    }

    expect(mockSf.getCampaignByNameWithFields).toHaveBeenCalledTimes(1);
    expect(mockSf.getDiscountCodesByCode).toHaveBeenCalledTimes(3);
  });
});
