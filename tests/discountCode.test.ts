// @ts-nocheck
import { discountCodeHandler, __resetRateLimit } from '../src/functions/discountCode';
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

const parse = (response: any) => JSON.parse(response.body);

const activeRecord = (overrides: Record<string, any> = {}) => ({
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

describe('discount-code endpoint', () => {
  let mockSf: any;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetRateLimit();

    mockSf = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      getDiscountCodeByCode: jest.fn().mockResolvedValue(activeRecord()),
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
      buildRequest({ code: 'RUSSELLMOORE', product: 'hospitality-guide' }, { 'x-forwarded-for': '203.0.113.5:41234' }),
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
      buildRequest({ code: ' russell moore ', product: 'hospitality-guide' }, { 'x-forwarded-for': '203.0.113.6' }),
      context
    );

    expect(mockSf.getDiscountCodeByCode).toHaveBeenCalledWith('RUSSELLMOORE');
    expect(parse(response).valid).toBe(true);
  });

  it('reports an unknown code as invalid, not as an error', async () => {
    mockSf.getDiscountCodeByCode.mockResolvedValue(null);

    const response = await discountCodeHandler(
      buildRequest({ code: 'NOPE', product: 'hospitality-guide' }, { 'x-forwarded-for': '203.0.113.7' }),
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
    const response = await discountCodeHandler(buildRequest({ code: '!!!' }), context);

    expect(response.status).toBe(400);
    expect(mockSf.getDiscountCodeByCode).not.toHaveBeenCalled();
  });

  it('never lets the response be cached', async () => {
    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE' }, { 'x-forwarded-for': '203.0.113.8' }),
      context
    );

    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('answers 502, not a bad-code verdict, when Salesforce cannot be reached', async () => {
    // A buyer holding a good code has to be told to try again. Reporting the
    // code as invalid would charge them full price for a code that works.
    mockSf.getDiscountCodeByCode.mockRejectedValue(new Error('ECONNRESET'));

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE' }, { 'x-forwarded-for': '203.0.113.9' }),
      context
    );

    expect(response.status).toBe(502);
    expect(parse(response).valid).toBeUndefined();
  });

  it('answers 500 when the app is missing Salesforce credentials', async () => {
    mockSf.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE' }, { 'x-forwarded-for': '203.0.113.10' }),
      context
    );

    expect(response.status).toBe(500);
  });

  it('rate limits one client without affecting another', async () => {
    const hammer = buildRequest({ code: 'GUESS', product: 'hospitality-guide' }, { 'x-forwarded-for': '198.51.100.1:5000' });

    let lastStatus = 200;
    for (let i = 0; i < 31; i++) {
      const response = await discountCodeHandler(hammer, context);
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);

    const other = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', product: 'hospitality-guide' }, { 'x-forwarded-for': '198.51.100.2' }),
      context
    );
    expect(other.status).toBe(200);
  });

  it('tells a rate-limited caller how long to wait', async () => {
    const hammer = buildRequest({ code: 'GUESS' }, { 'x-forwarded-for': '198.51.100.3' });
    let response;
    for (let i = 0; i < 31; i++) {
      response = await discountCodeHandler(hammer, context);
    }

    expect(response.status).toBe(429);
    expect(response.headers['Retry-After']).toBe('60');
  });

  it('treats a proxy chain by its first entry, not the whole header', async () => {
    const viaProxy = buildRequest({ code: 'GUESS' }, { 'x-forwarded-for': '198.51.100.4:1111, 10.0.0.1, 10.0.0.2' });
    let response;
    for (let i = 0; i < 31; i++) {
      response = await discountCodeHandler(viaProxy, context);
    }
    expect(response.status).toBe(429);

    // The same client seen through a different proxy hop is still that client.
    const sameClientOtherHop = await discountCodeHandler(
      buildRequest({ code: 'GUESS' }, { 'x-forwarded-for': '198.51.100.4:2222, 10.9.9.9' }),
      context
    );
    expect(sameClientOtherHop.status).toBe(429);
  });

  it('does not leak the record id or internal notes for a valid code', async () => {
    mockSf.getDiscountCodeByCode.mockResolvedValue(
      activeRecord({ Notes__c: 'Issued to Russell Moore, do not share' })
    );

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE' }, { 'x-forwarded-for': '203.0.113.11' }),
      context
    );

    expect(response.body).not.toContain('a0X000000000001');
    expect(response.body).not.toContain('do not share');
  });

  it('refuses a code scoped to another product', async () => {
    mockSf.getDiscountCodeByCode.mockResolvedValue(activeRecord({ Product__c: 'other-thing' }));

    const response = await discountCodeHandler(
      buildRequest({ code: 'RUSSELLMOORE', product: 'hospitality-guide' }, { 'x-forwarded-for': '203.0.113.12' }),
      context
    );

    expect(parse(response)).toMatchObject({ valid: false, reason: 'wrong_product' });
  });
});
