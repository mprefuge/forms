import updateFormHandler from '../src/functions/updateForm/index';
import { InvocationContext } from '@azure/functions';
import { SalesforceService } from '../src/services/salesforceService';
import { EmailService } from '../src/services/emailService';
import { testFormConfig } from './testFormConfig';

// Mock the SalesforceService and EmailService
jest.mock('../src/services/salesforceService');
jest.mock('../src/services/emailService');

describe('updateForm Function', () => {
  let mockContext: InvocationContext;
  let mockSalesforceService: jest.Mocked<SalesforceService>;

  beforeEach(() => {
    mockContext = {
      invocationId: 'test-invocation-id',
      functionName: 'updateForm',
      extraInputs: {
        get: jest.fn(),
      },
      extraOutputs: {
        set: jest.fn(),
      },
    } as any;

    // Clear all mocks before each test
    jest.clearAllMocks();

    // Setup Salesforce service mock
    mockSalesforceService = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      getFormByCode: jest.fn().mockResolvedValue({ Id: 'form-123', FormCode__c: 'abc12' }),
      updateForm: jest.fn().mockResolvedValue(undefined),
      createAttachments: jest.fn().mockResolvedValue(['att-1', 'att-2']),
      createNotes: jest.fn().mockResolvedValue(['note-1', 'note-2']),
    } as any;

    (SalesforceService as jest.Mock).mockImplementation(() => mockSalesforceService);

    // Provide a mocked EmailService instance for tests that expect email dispatch
    const mockEmailService = {
      sendApplicationCopy: jest.fn().mockResolvedValue(undefined),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    (EmailService as unknown as jest.MockedClass<any>).mockImplementation(() => mockEmailService);

    // Ensure Salesforce credentials are set for tests (individual tests may override/clear)
    process.env.SF_CLIENT_ID = 'test-client-id';
    process.env.SF_CLIENT_SECRET = 'test-client-secret';
    process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
  });

  test('should update form with formId', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formId: 'form-123',
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Email__c: 'john.doe@example.com',
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    expect(mockSalesforceService.authenticate).toHaveBeenCalled();
    expect(mockSalesforceService.updateForm).toHaveBeenCalledWith(
      'form-123',
      expect.objectContaining({
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Email__c: 'john.doe@example.com',
      }),
      expect.any(String)
    );
  });

  test('should update form with formCode', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formCode: 'abc12',
        FirstName__c: 'Jane',
        LastName__c: 'Smith',
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    expect(mockSalesforceService.getFormByCode).toHaveBeenCalledWith('abc12');
    expect(mockSalesforceService.updateForm).toHaveBeenCalledWith(
      'form-123',
      expect.objectContaining({
        FirstName__c: 'Jane',
        LastName__c: 'Smith',
      }),
      expect.any(String)
    );
  });

  test('should update form with attachments', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formId: 'form-123',
        FirstName__c: 'John',
        Attachments: [
          {
            fileName: 'resume.pdf',
            contentType: 'application/pdf',
            base64: 'base64encodedcontent',
          },
          {
            fileName: 'photo.jpg',
            contentType: 'image/jpeg',
            base64: 'anotherbas64',
          },
        ],
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    expect(mockSalesforceService.createAttachments).toHaveBeenCalledWith('form-123', [
      {
        fileName: 'resume.pdf',
        contentType: 'application/pdf',
        base64: 'base64encodedcontent',
      },
      {
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        base64: 'anotherbas64',
      },
    ]);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.attachmentsCreated).toBe(2);
  });

  test('should update form with notes', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formId: 'form-123',
        FirstName__c: 'John',
        Notes: [
          {
            Title: 'Important Note',
            Body: 'This is a very important note',
          },
          {
            Body: 'Another note without title',
          },
        ],
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    expect(mockSalesforceService.createNotes).toHaveBeenCalledWith('form-123', [
      {
        Title: 'Important Note',
        Body: 'This is a very important note',
      },
      {
        Body: 'Another note without title',
      },
    ]);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.notesCreated).toBe(2);
  });

  test('should update form with attachments and notes', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formId: 'form-123',
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Attachments: [
          {
            fileName: 'document.pdf',
            base64: 'base64content',
          },
        ],
        Notes: [
          {
            Body: 'A note about this form',
          },
        ],
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);
    expect(mockSalesforceService.updateForm).toHaveBeenCalled();
    expect(mockSalesforceService.createAttachments).toHaveBeenCalled();
    expect(mockSalesforceService.createNotes).toHaveBeenCalled();
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.attachmentsCreated).toBe(1);
    expect(responseBody.notesCreated).toBe(1);
  });

  test('should send application copy email after successful update when email present', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formId: 'form-123',
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Email__c: 'john.update@example.com',
        __sendEmail: true,
        __emailTemplates: {
          applicationCopy: {
            subject: 'Your application',
            text: 'Thanks for your submission',
            html: '<p>Thanks for your submission</p>'
          }
        }
      }),
      headers: {
        get: jest.fn().mockReturnValue('update-req-id'),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(200);

    // Check the mocked EmailService instance was called
    const EmailServiceClass = (await import('../src/services/emailService')).EmailService as jest.MockedClass<any>;
    const instances = EmailServiceClass.mock.instances || [];
    const foundCall = instances.some((inst: any) => {
      if (!inst || !inst.sendApplicationCopy || !inst.sendApplicationCopy.mock) return false;
      return inst.sendApplicationCopy.mock.calls.some((c: any) => c[0] === 'john.update@example.com');
    });

    if (!foundCall) {
      const last = (global as any).__LAST_APPLICATION_COPY_SENT__;
      expect(last).toBeDefined();
      expect(last.to).toBe('john.update@example.com');
      expect(last.formData.FirstName__c).toBe('John');
    } else {
      expect(foundCall).toBe(true);
    }
  });

  test('should return 400 when formId and formCode are missing', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        FirstName__c: 'John',
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(400);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.error).toContain('formCode or formId');
  });

  test('should return 400 when request body is invalid JSON', async () => {
    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(400);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.error).toContain('Invalid JSON');
  });

  test('should return 405 when method is not POST', async () => {
    const mockRequest = {
      method: 'GET',
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(405);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.error).toContain('Method not allowed');
  });

  test('should return 404 when form is not found', async () => {
    mockSalesforceService.getFormByCode.mockRejectedValue(new Error('Form not found with code: xyz'));

    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formCode: 'xyz',
        FirstName__c: 'John',
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(404);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.error).toContain('Form not found');
  });

  test('should return 500 when Salesforce credentials are missing', async () => {
    // Save original env vars
    const originalClientId = process.env.SF_CLIENT_ID;
    const originalClientSecret = process.env.SF_CLIENT_SECRET;

    // Simulate authenticate failing due to missing credentials
    mockSalesforceService.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));
    // Clear env vars
    delete process.env.SF_CLIENT_ID;
    delete process.env.SF_CLIENT_SECRET;

    const mockRequest = {
      method: 'POST',
      json: jest.fn().mockResolvedValue({
        formId: 'form-123',
        FirstName__c: 'John',
      }),
      headers: {
        get: jest.fn(),
      },
      query: {
        get: jest.fn(),
      },
    } as any;

    const response = await updateFormHandler(mockRequest, mockContext);

    expect(response.status).toBe(500);
    const responseBody = JSON.parse(response.body as string);
    expect(responseBody.error).toContain('Missing Salesforce credentials');

    // Restore env vars
    if (originalClientId) process.env.SF_CLIENT_ID = originalClientId;
    if (originalClientSecret) process.env.SF_CLIENT_SECRET = originalClientSecret;
  });
});
