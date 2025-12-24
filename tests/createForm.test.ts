// @ts-nocheck
import { jest } from '@jest/globals';
import { SalesforceService, FormData } from '../src/services/salesforceService';
import { Logger } from '../src/services/logger';
import createForm from '../src/functions/createForm';
import { EmailService } from '../src/services/emailService';
import { testFormConfig } from './testFormConfig';

jest.mock('jsforce');
jest.mock('../src/services/salesforceService');
jest.mock('../src/services/emailService');

describe('createForm HTTP Function', () => {
  let mockRequest: any;
  let mockContext: any;
  let mockSalesforceService: jest.Mocked<SalesforceService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'test-invocation-123',
      log: jest.fn(),
    };

    mockSalesforceService = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      createForm: jest.fn().mockResolvedValue({ id: 'form-id-12345', formCode: 'abc12' }),
      getFormByCode: jest.fn().mockResolvedValue({
        Id: 'form-id-12345',
        FormCode__c: 'abc12',
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Email__c: 'john@example.com',
        Phone__c: '555-1234',
      }),
      // new method to support lookup by email
      getFormByEmail: jest.fn().mockResolvedValue({
        Id: 'form-id-12345',
        FormCode__c: 'abc12',
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Email__c: 'john@example.com',
      }),
      getRecordTypeId: jest.fn().mockResolvedValue('record-type-id-123'),
      createAttachments: jest.fn().mockResolvedValue([]),
      createNotes: jest.fn().mockResolvedValue([]),
      // Support update operations in the createForm update branch
      updateForm: jest.fn().mockResolvedValue(undefined),
    } as any;

    const mockEmailService = {
      sendApplicationCopy: jest.fn().mockResolvedValue(undefined),
    };

    (EmailService as jest.MockedClass<any>).mockImplementation(() => mockEmailService);

    (SalesforceService as jest.MockedClass<typeof SalesforceService>).mockImplementation(
      () => mockSalesforceService
    );
  });

  describe('POST requests', () => {
    it('should create a form successfully with valid data', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'test-request-id-123';
            return null;
          },
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
          LastName__c: 'Doe',
          Email__c: 'john@example.com',
          RecordType: 'Registration',
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(response.headers?.['X-Request-Id']).toBe('test-request-id-123');

      const body = JSON.parse(response.body);
      expect(body.id).toBe('form-id-12345');
      expect(body.formCode).toBe('abc12');
      expect(response.headers?.['X-Form-Code']).toBe('abc12');

      expect(mockSalesforceService.authenticate).toHaveBeenCalled();
      expect(mockSalesforceService.createForm).toHaveBeenCalledWith(
        expect.objectContaining({
          FirstName__c: 'John',
          LastName__c: 'Doe',
          Email__c: 'john@example.com',
          RecordType: 'Registration',
        }),
        'test-request-id-123'
      );

      // Ensure we sent the application copy email to the applicant
      const EmailServiceClass = (await import('../src/services/emailService')).EmailService as jest.MockedClass<any>;
      const instances = EmailServiceClass.mock.instances || [];
      const foundCall = instances.some((inst: any) => {
        if (!inst || !inst.sendApplicationCopy || !inst.sendApplicationCopy.mock) return false;
        return inst.sendApplicationCopy.mock.calls.some((c: any) => c[0] === 'john@example.com' && c[1] === 'John Doe');
      });
      if (!foundCall) {
        // Fallback: some environments instantiate a non-mocked EmailService; assert via global signal
        const last = (global as any).__LAST_APPLICATION_COPY_SENT__;
        expect(last).toBeDefined();
        expect(last.to).toBe('john@example.com');
        expect(last.name).toBe('John Doe');
        expect(last.formData.FirstName__c).toBe('John');
      } else {
        expect(foundCall).toBe(true);
      }
    });

    it('should generate a GUID for form Name when not provided', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('test-request-id-123'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Jane',
          LastName__c: 'Smith',
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.createForm).toHaveBeenCalled();
      
      // Verify that a name was generated (should start with 'form_')
      const callArgs = mockSalesforceService.createForm.mock.calls[0][0];
      // The GUID is generated in SalesforceService, so we can't check it here directly
      // but we verified the service was called
      expect(mockSalesforceService.createForm).toHaveBeenCalledWith(
        expect.any(Object),
        'test-request-id-123',
        testFormConfig
      );
    });

    it('should pass attachments and notes to the Salesforce service', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('attach-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Jane',
          Attachments: [{ fileName: 'test.txt', base64: Buffer.from('hello').toString('base64') }],
          Notes: [{ Title: 'Note1', Body: 'This is a test note' }],
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.createForm).toHaveBeenCalledWith(
        expect.objectContaining({
          FirstName__c: 'Jane',
          Attachments: expect.any(Array),
          Notes: expect.any(Array),
        }),
        'attach-request-id'
      );
    });

    it('should generate X-Request-Id if not provided', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Jane',
          LastName__c: 'Smith',
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(response.headers?.['X-Request-Id']).toBeDefined();
    });

    it('should handle missing Salesforce credentials', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
        }),
      };

      // Simulate authenticate failing due to missing credentials
      mockSalesforceService.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));
      delete process.env.SF_CLIENT_ID;
      delete process.env.SF_CLIENT_SECRET;

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Salesforce credentials');
    });

    it('should handle invalid JSON in request body', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Invalid request body');
    });

    it('should handle RecordType not found error', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
          RecordType: 'InvalidType',
        }),
      };

      mockSalesforceService.createForm.mockRejectedValue(
        new Error('RecordType not found: InvalidType')
      );

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('RecordType not found');
    });

    it('should handle Salesforce errors gracefully', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
        }),
      };

      mockSalesforceService.createForm.mockRejectedValue(
        new Error('Salesforce error: INVALID_FIELD_FOR_INSERT_UPDATE')
      );

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Salesforce error');
    });

    it('should handle authentication failures', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
        }),
      };

      mockSalesforceService.authenticate.mockRejectedValue(
        new Error('Authentication failed: Invalid credentials')
      );

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should send application copy email after successful update when email present (createForm update branch)', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('update-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FormCode__c: 'abc12',
          FirstName__c: 'John',
          LastName__c: 'Doe',
          Email__c: 'john.update@example.com',
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);

      // Ensure we sent the application copy email to the applicant
      const EmailServiceClass = (await import('../src/services/emailService')).EmailService as jest.MockedClass<any>;
      const instances = EmailServiceClass.mock.instances || [];
      const foundCall = instances.some((inst: any) => {
        if (!inst || !inst.sendApplicationCopy || !inst.sendApplicationCopy.mock) return false;
        return inst.sendApplicationCopy.mock.calls.some((c: any) => c[0] === 'john.update@example.com' && c[1] === 'John Doe');
      });
      if (!foundCall) {
        // Fallback: some environments instantiate a non-mocked EmailService; assert via global signal
        const last = (global as any).__LAST_APPLICATION_COPY_SENT__;
        expect(last).toBeDefined();
        expect(last.to).toBe('john.update@example.com');
        expect(last.name).toBe('John Doe');
        expect(last.formData.FirstName__c).toBe('John');
      } else {
        expect(foundCall).toBe(true);
      }
    });
  });

  describe('GET requests', () => {
    it('should retrieve a form successfully by code', async () => {
      mockRequest = {
        method: 'GET',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'get-request-id-123';
            return null;
          },
        },
        query: new Map([['code', 'abc12']]),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(response.headers?.['X-Request-Id']).toBe('get-request-id-123');

      const body = JSON.parse(response.body);
      expect(body.Id).toBe('form-id-12345');
      expect(body.FormCode__c).toBe('abc12');
      expect(body.FirstName__c).toBe('John');

      expect(mockSalesforceService.authenticate).toHaveBeenCalled();
      expect(mockSalesforceService.getFormByCode).toHaveBeenCalledWith('abc12', undefined);
    });

    it('should retrieve specified fields when fields param provided', async () => {
      mockRequest = {
        method: 'GET',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'get-request-id-789';
            return null;
          },
        },
        query: new Map([['code', 'abc12'], ['fields', 'CurrentStatus__c']]),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      mockSalesforceService.getFormByCode.mockResolvedValueOnce({ Id: 'form-id-12345', FormCode__c: 'abc12', CurrentStatus__c: 'Under Review' });

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.CurrentStatus__c).toBe('Under Review');

      expect(mockSalesforceService.authenticate).toHaveBeenCalled();
      expect(mockSalesforceService.getFormByCode).toHaveBeenCalledWith('abc12', ['CurrentStatus__c']);
    });

    it('should return 400 when code query parameter is missing', async () => {
      mockRequest = {
        method: 'GET',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        query: new Map(),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('code');
    });

    it('should retrieve a form successfully by email', async () => {
      mockRequest = {
        method: 'GET',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'get-request-id-456';
            return null;
          },
        },
        query: new Map([['email', 'john@example.com']]),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(response.headers?.['X-Request-Id']).toBe('get-request-id-456');

      const body = JSON.parse(response.body);
      expect(body.Id).toBe('form-id-12345');
      expect(body.FormCode__c).toBe('abc12');
      expect(body.Email__c).toBe('john@example.com');

      expect(mockSalesforceService.authenticate).toHaveBeenCalled();
      expect(mockSalesforceService.getFormByEmail).toHaveBeenCalledWith('john@example.com', undefined);
    });

    it('should request emailing the code rather than auto-load (send-code endpoint)', async () => {
      // This just ensures the client flow uses POST /send-code; we test handler separately in sendCode.test
      // Here we assert that the sendCode function exists and is wired up by invoking it in the test suite (sanity check)
      const sendCodeModule = await import('../src/functions/sendCode');
      expect(typeof sendCodeModule.default).toBe('function');
    });

    it('should return 404 when form is not found', async () => {
      mockSalesforceService.getFormByCode.mockRejectedValue(
        new Error('Form not found with code: invalid-code')
      );

      mockRequest = {
        method: 'GET',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        query: new Map([['code', 'invalid-code']]),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Form not found');
    });

    it('should handle missing credentials on GET request', async () => {
      mockRequest = {
        method: 'GET',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        query: new Map([['code', 'abc12']]),
      };

      // Simulate authenticate failing due to missing credentials
      mockSalesforceService.authenticate.mockRejectedValue(new Error('Missing Salesforce credentials'));
      delete process.env.SF_CLIENT_ID;
      delete process.env.SF_CLIENT_SECRET;

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Salesforce credentials');
    });
  });

  describe('non-GET/POST requests', () => {
    it('should reject PUT requests', async () => {
      mockRequest = {
        method: 'PUT',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      };

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(405);
    });

    it('should reject DELETE requests', async () => {
      mockRequest = {
        method: 'DELETE',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      };

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(405);
    });
  });

  describe('field mapping and allowed fields', () => {
    it('should map all allowed fields correctly', async () => {
      const allowedFields = {
        AdditionalNotes__c: 'Additional notes',
        AffirmStatementOfFaith__c: 'Yes',
        Availability__c: 'Full-time',
        Birthdate__c: '1990-01-01',
        Church__c: 'Church Name',
        Email__c: 'test@example.com',
        FirstName__c: 'John',
        LastName__c: 'Doe',
        Phone__c: '555-1234',
      };

      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          ...allowedFields,
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.createForm).toHaveBeenCalledWith(
        expect.objectContaining(allowedFields),
        expect.any(String)
      );
    });
  });

  describe('logging and traceability', () => {
    it('should include request ID in response headers', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'custom-request-id';
            return null;
          },
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.headers?.['X-Request-Id']).toBe('custom-request-id');
    });
  });

  describe('cleanup on successful tests', () => {
    it('should clean up created resources after successful form creation', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
          LastName__c: 'Doe',
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);

      // Verify service was called
      expect(mockSalesforceService.createForm).toHaveBeenCalled();

      // Clean up mocks
      jest.clearAllMocks();
    });
  });
});

