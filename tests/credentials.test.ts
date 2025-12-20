import createForm from '../src/functions/createForm';
import updateFormHandler from '../src/functions/updateForm';
import { SalesforceService } from '../src/services/salesforceService';
import { InvocationContext } from '@azure/functions';

jest.mock('../src/services/salesforceService');

describe('Handlers: missing credentials handling', () => {
  let mockContext: any;
  let mockSalesforceService: jest.Mocked<SalesforceService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'test-invocation-id',
    } as InvocationContext;

    mockSalesforceService = {
      authenticate: jest.fn(),
    } as any;

    (SalesforceService as jest.Mock).mockImplementation(() => mockSalesforceService);
  });

  test('createForm returns 500 when authenticate throws missing credentials', async () => {
    mockSalesforceService.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));

    const mockRequest = {
      method: 'POST',
      headers: { get: jest.fn() },
      json: jest.fn().mockResolvedValue({ FirstName__c: 'John' }),
    } as any;

    const res = await createForm(mockRequest, mockContext);
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body as string);
    expect(body.error).toContain('Missing Salesforce credentials');
  });

  test('updateForm returns 500 when authenticate throws missing credentials', async () => {
    mockSalesforceService.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));

    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({ formId: 'form-123' }),
      headers: { get: jest.fn() },
    } as any;

    const res = await updateFormHandler(mockRequest, mockContext);
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body as string);
    expect(body.error).toContain('Missing Salesforce credentials');
  });
});