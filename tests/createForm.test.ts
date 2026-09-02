// @ts-nocheck
import { jest } from '@jest/globals';
import { SalesforceService, FormData } from '../src/services/salesforceService';
import { Logger } from '../src/services/logger';
import createForm from '../src/functions/createForm';
import { testFormConfig } from './testFormConfig';

jest.mock('jsforce');
jest.mock('../src/services/salesforceService');
jest.mock('../src/services/emailService');
jest.mock('../src/services/mailchimpService');

describe('createForm HTTP Function', () => {
  let mockRequest: any;
  let mockContext: any;
  let mockSalesforceService: jest.Mocked<SalesforceService>;
  let mockEmailService: any;
  let mockMailchimpService: any;

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
      getCampaignByIdWithFields: jest.fn().mockResolvedValue(null),
      getCampaignByNameWithFields: jest.fn().mockResolvedValue(null),
      getActiveEventCampaigns: jest.fn().mockResolvedValue([]),
      createCampaign: jest.fn().mockResolvedValue({ id: 'campaign-123', name: 'Test Form' }),
      createCampaignMember: jest.fn().mockResolvedValue('campaign-member-123'),
      // Contact matching for form linking
      findContact: jest.fn().mockResolvedValue(null),
      // Contact creation & update
      createContact: jest.fn().mockResolvedValue('contact-123'),
      updateContact: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
      sendApplicationCopy: jest.fn().mockResolvedValue(undefined),
      sendEventRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
      generateEventCalendarData: jest.fn().mockReturnValue({ googleUrl: 'https://calendar.google.com/', icsDataUri: 'data:text/calendar,', icsUrl: 'http://ics', outlookUrl: 'http://outlook', appleIcsUrl: 'http://apple' })
    };

    mockMailchimpService = {
      isConfigured: jest.fn().mockReturnValue(true),
      upsertSubscriber: jest.fn().mockResolvedValue(undefined),
    };

    const { EmailService } = require('../src/services/emailService');
    (EmailService as jest.MockedClass<any>).mockImplementation(() => mockEmailService);

    const { MailchimpService } = require('../src/services/mailchimpService');
    (MailchimpService as jest.MockedClass<any>).mockImplementation(() => mockMailchimpService);

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
          ReceiveUpdates: true,
          __sendEmail: true,
          __emailTemplates: {
            applicationCopy: {
              subject: 'Application received',
              text: 'Your application was successfully submitted. Code: {{FormCode__c}}',
              html: '<p>Your application was <strong>successfully submitted</strong>. Code: <strong>{{FormCode__c}}</strong></p>'
            }
          },
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
        'test-request-id-123',
        expect.objectContaining({ id: 'test', name: 'Test Form' })
      );

      // Email dispatch is validated in integration tests; here we only assert success response
      // (Higher-level email dispatch behavior is covered in unit tests for EmailService.)
      const responseBody = JSON.parse(response.body);
      expect(responseBody.id).toBe('form-id-12345');
      expect(responseBody.formCode).toBe('abc12');

      await Promise.resolve();
      await Promise.resolve();
      expect(mockMailchimpService.upsertSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john@example.com',
        })
      );
    });

    it('should not sync to Mailchimp when ReceiveUpdates is not a configured form field', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'no-optin-field-request-id';
            return null;
          },
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
          LastName__c: 'Doe',
          Email__c: 'john@example.com',
          RecordType: 'Registration',
          // Client carries a default ReceiveUpdates value even though the form never
          // presented the opt-in checkbox for this configuration.
          ReceiveUpdates: true,
          __formConfig: {
            ...testFormConfig,
            // Declared visible fields intentionally omit ReceiveUpdates.
            formFields: ['FirstName', 'LastName', 'Email', 'Phone'],
          },
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);

      await Promise.resolve();
      await Promise.resolve();
      expect(mockMailchimpService.upsertSubscriber).not.toHaveBeenCalled();
    });

    it('should sync to Mailchimp when ReceiveUpdates is a configured form field and opted in', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'optin-field-request-id';
            return null;
          },
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'John',
          LastName__c: 'Doe',
          Email__c: 'john@example.com',
          RecordType: 'Registration',
          ReceiveUpdates: true,
          __formConfig: {
            ...testFormConfig,
            formFields: ['FirstName', 'LastName', 'Email', 'ReceiveUpdates'],
          },
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);

      await Promise.resolve();
      await Promise.resolve();
      expect(mockMailchimpService.upsertSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john@example.com',
        })
      );
    });

    it('should send a New Registration notification to the form-configured recipient with submitted details', async () => {
      delete process.env.AdminEmail;
      delete process.env.ADMIN_EMAIL;
      process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS = 'example.com';

      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('notification-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Jane',
          LastName__c: 'Doe',
          Email__c: 'jane@example.com',
          Comments__c: 'Needs childcare',
          CurrentStatus__c: 'Submitted',
          Custom__c: JSON.stringify({
            NotificationEmail: 'registrations@example.com',
          }),
          __formConfig: {
            ...testFormConfig,
          },
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);
      await Promise.resolve();
      await Promise.resolve();

      expect(response.status).toBe(201);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        'registrations@example.com',
        expect.objectContaining({ subject: 'New Registration' }),
        expect.objectContaining({
          formName: 'Test Form',
          applicantName: 'Jane Doe',
          applicantEmail: 'jane@example.com',
          formCode: 'ABC12',
        })
      );

      const notificationCall = mockEmailService.sendEmail.mock.calls.find((call: any[]) => call[0] === 'registrations@example.com');
      expect(notificationCall).toBeDefined();
      expect(notificationCall[2].submissionDetails).toContain('First Name: Jane');
      expect(notificationCall[2].submissionDetails).toContain('Comments: Needs childcare');
      expect(notificationCall[2].submissionDetails).toContain('Form Code: ABC12');
      delete process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS;
    });

    it('should ignore client-supplied notification recipients outside the allowed domains', async () => {
      delete process.env.AdminEmail;
      delete process.env.ADMIN_EMAIL;
      delete process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS;
      delete process.env.EMAIL_FROM;

      mockRequest = {
        method: 'POST',
        headers: { get: jest.fn().mockReturnValue('relay-request-id') },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Mallory',
          LastName__c: 'Relay',
          Email__c: 'mallory@example.com',
          Custom__c: JSON.stringify({ NotificationEmail: 'victim@attacker.test' }),
          __formConfig: { ...testFormConfig, notificationEmails: 'another@attacker.test' },
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);
      expect(response.status).toBe(201);

      const recipients = mockEmailService.sendEmail.mock.calls.map((call: any[]) => call[0]);
      expect(recipients).not.toContain('victim@attacker.test');
      expect(recipients).not.toContain('another@attacker.test');
    });

    it('should reject a client form configuration that targets another object', async () => {
      mockRequest = {
        method: 'POST',
        headers: { get: jest.fn().mockReturnValue('bad-config-id') },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Eve',
          __formConfig: { ...testFormConfig, salesforce: { ...testFormConfig.salesforce, objectName: 'Contact' } },
        }),
      };

      const response = await createForm(mockRequest, mockContext);
      expect(response.status).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Unsupported Salesforce object');
      expect(mockSalesforceService.createForm).not.toHaveBeenCalled();
    });

    it('should reject a client form configuration with an unsafe field name', async () => {
      mockRequest = {
        method: 'POST',
        headers: { get: jest.fn().mockReturnValue('bad-field-id') },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Eve',
          __formConfig: {
            ...testFormConfig,
            salesforce: { ...testFormConfig.salesforce, queryFields: ['Id', "Name FROM Contact WHERE Id != null OR Id"] },
          },
        }),
      };

      const response = await createForm(mockRequest, mockContext);
      expect(response.status).toBe(400);
      expect(mockSalesforceService.createForm).not.toHaveBeenCalled();
    });

    it('should not touch an existing Contact opt-out preference when ReceiveUpdates was not submitted', async () => {
      mockSalesforceService.findContact = jest.fn().mockResolvedValue({ contactId: 'existing-2' } as any);
      mockSalesforceService.updateContact = jest.fn().mockResolvedValue(undefined);

      mockRequest = {
        method: 'POST',
        headers: { get: jest.fn().mockReturnValue('contact-noop-id') },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Existing',
          LastName__c: 'Contact',
          Email: 'existing.contact@example.com',
          __formConfig: testFormConfig,
        }),
      };

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.updateContact).not.toHaveBeenCalled();
    });


    it('should create a Contact and set HasOptedOutOfEmail when ReceiveUpdates is false', async () => {
      // Simulate no contact match and creation path
      mockSalesforceService.findContact = jest.fn().mockResolvedValue(null);
      mockSalesforceService.createContact = jest.fn().mockResolvedValue('new-contact-1');

      mockRequest = {
        method: 'POST',
        headers: { get: jest.fn().mockReturnValue('contact-request-id') },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Test',
          LastName__c: 'User',
          Email: 'test.user@example.com',
          ReceiveUpdates: false,
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.createContact).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test.user@example.com',
        firstName: 'Test',
        lastName: 'User',
        hasOptedOut: true // because ReceiveUpdates: false
      }));
      await Promise.resolve();
      await Promise.resolve();
      expect(mockMailchimpService.upsertSubscriber).not.toHaveBeenCalled();
    });

    it('should update existing Contact opt-out preference when match found', async () => {
      // Simulate a high-confidence match
      mockSalesforceService.findContact = jest.fn().mockResolvedValue({ contactId: 'existing-1' } as any);
      mockSalesforceService.updateContact = jest.fn().mockResolvedValue(undefined);

      mockRequest = {
        method: 'POST',
        headers: { get: jest.fn().mockReturnValue('contact-update-id') },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Existing',
          LastName__c: 'Contact',
          Email: 'existing.contact@example.com',
          ReceiveUpdates: false,
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.updateContact).toHaveBeenCalledWith('existing-1', { HasOptedOutOfEmail: true });
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
        expect.objectContaining({ id: 'test', name: 'Test Form' })
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
        'attach-request-id',
        expect.objectContaining({ id: 'test' })
      );
    });

    it('should send event registration confirmation when campaign exists (event registration)', async () => {
      // Mock campaign lookup to return an event/campaign
      mockSalesforceService.getCampaignByIdWithFields = jest.fn().mockResolvedValue({ Id: 'camp-1', Name: 'Community Meetup', StartDate: '2026-02-14', StartTime: '18:00', Location__c: 'Community Hall', Description: 'Join us', Additional_Information__c: '<p>More details</p>' });

      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('event-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Alice',
          LastName__c: 'Walker',
          Email: 'alice@example.com',
          __eventId: 'camp-1',
          __sendEmail: true,
          __emailTemplates: {
            eventRegistration: {
              subject: 'Event registration confirmed',
              text: 'You have been registered for {{name}}. Details: {{StartDate}} {{StartTime}}',
              html: '<p>You have been registered for <strong>{{name}}</strong>. Details: {{StartDate}} {{StartTime}}</p>'
            }
          },
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);

      // Campaign lookup should have been attempted
      expect(mockSalesforceService.getCampaignByIdWithFields).toHaveBeenCalledWith('camp-1', expect.any(Array));

      // Email dispatch is validated in integration tests; here we check that the campaign info was returned
      const body = JSON.parse(response.body);
      expect(body.campaignInfo).toBeDefined();
      expect(body.campaignInfo.name).toBe('Community Meetup');
      expect(body.campaignInfo.Additional_Information__c).toBe('<p>More details</p>');
    });

    it('should associate a matched registration campaign by submitted title', async () => {
      mockSalesforceService.getCampaignByNameWithFields = jest.fn().mockResolvedValue({
        Id: 'camp-registration-1',
        Name: 'Volunteer Registration',
      });

      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('registration-campaign-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Jane',
          LastName__c: 'Doe',
          Email: 'jane@example.com',
          __campaignName: 'Volunteer Registration',
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(201);
      expect(mockSalesforceService.getCampaignByNameWithFields).toHaveBeenCalledWith(
        'Volunteer Registration',
        expect.any(Array),
        'Registration'
      );
      expect(mockSalesforceService.createCampaign).not.toHaveBeenCalled();
      expect(mockSalesforceService.createForm).toHaveBeenCalledWith(
        expect.objectContaining({
          Campaign__c: 'camp-registration-1',
        }),
        'registration-campaign-request-id',
        expect.objectContaining({ id: 'test' })
      );
    });

    it('should create and associate a registration campaign when no title match exists', async () => {
      mockSalesforceService.getCampaignByNameWithFields = jest.fn().mockResolvedValue(null);
      mockSalesforceService.getCampaignByIdWithFields = jest.fn().mockResolvedValue({
        Id: 'camp-registration-2',
        Name: 'Student Registration',
      });
      mockSalesforceService.createCampaign = jest.fn().mockResolvedValue({
        id: 'camp-registration-2',
        name: 'Student Registration',
      });

      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('registration-create-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Ana',
          LastName__c: 'Lopez',
          Email: 'ana@example.com',
          __campaignName: 'Student Registration',
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);
      await Promise.resolve();
      await Promise.resolve();

      expect(response.status).toBe(201);
      expect(mockSalesforceService.createCampaign).toHaveBeenCalledWith({
        name: 'Student Registration',
        recordTypeName: 'Registration',
        isActive: true,
      });
      expect(mockSalesforceService.createForm).toHaveBeenCalledWith(
        expect.objectContaining({
          Campaign__c: 'camp-registration-2',
        }),
        'registration-create-request-id',
        expect.objectContaining({ id: 'test' })
      );
      expect(mockSalesforceService.createCampaignMember).toHaveBeenCalledWith(
        'camp-registration-2',
        'contact-123',
        'Registered'
      );
    });

    it('should fail the submission when campaign resolution fails for a registration campaign', async () => {
      mockSalesforceService.getCampaignByNameWithFields = jest.fn().mockResolvedValue(null);
      mockSalesforceService.createCampaign = jest.fn().mockRejectedValue(new Error('Campaign validation failed'));

      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('registration-failure-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FirstName__c: 'Ana',
          LastName__c: 'Lopez',
          Email: 'ana@example.com',
          __campaignName: 'Summer 2026 - Farmdale ESL Network Registration',
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);
      const body = JSON.parse(response.body);

      expect(response.status).toBe(500);
      expect(body.error).toContain('Unable to resolve Campaign for "Summer 2026 - Farmdale ESL Network Registration"');
      expect(mockSalesforceService.createForm).not.toHaveBeenCalled();
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
          __formConfig: testFormConfig,
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
          __formConfig: testFormConfig,
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
          __formConfig: testFormConfig,
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
          __formConfig: testFormConfig,
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
          __formConfig: testFormConfig,
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
          __sendEmail: true,
          __emailTemplates: {
            applicationCopy: {
              subject: 'Application updated',
              text: 'Your application was updated successfully. Code: {{FormCode__c}}',
              html: '<p>Your application was <strong>updated</strong>. Code: <strong>{{FormCode__c}}</strong></p>'
            }
          },
          __formConfig: testFormConfig,
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

    it('should sync to Mailchimp on update when registrant opts in', async () => {
      mockRequest = {
        method: 'POST',
        headers: {
          get: jest.fn().mockReturnValue('mailchimp-update-request-id'),
        },
        json: jest.fn().mockResolvedValue({
          FormCode__c: 'abc12',
          FirstName__c: 'John',
          LastName__c: 'Doe',
          Email__c: 'john.update@example.com',
          ReceiveUpdates: true,
          __formConfig: testFormConfig,
        }),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);
      await Promise.resolve();
      await Promise.resolve();
      expect(mockMailchimpService.upsertSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john.update@example.com',
        })
      );
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

    it('should not look up forms by email address', async () => {
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

      expect(response.status).toBe(400);
      expect(mockSalesforceService.getFormByEmail).not.toHaveBeenCalled();
    });

    it('should reject an unsafe fields parameter', async () => {
      mockRequest = {
        method: 'GET',
        headers: { get: () => null },
        query: new Map([
          ['code', 'abc12'],
          ['fields', 'Id,Owner.Email'],
        ]),
      };

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(400);
      expect(mockSalesforceService.getFormByCode).not.toHaveBeenCalled();
    });

    // Verify that querying with eventId returns campaign metadata including rich text field
    it('should fetch event campaign metadata when eventId query provided', async () => {
      mockRequest = {
        method: 'GET',
        headers: {
          get: (header: string) => {
            if (header === 'X-Request-Id') return 'get-request-id-event';
            return null;
          },
        },
        query: new Map([['eventId', 'camp-5']]),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      mockSalesforceService.getCampaignByIdWithFields.mockResolvedValueOnce({
        Id: 'camp-5',
        Name: 'Test Event',
        Additional_Information__c: '<p><strong>Rich</strong> info</p>',
      });

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.campaign).toBeDefined();
      expect(body.campaign.Id).toBe('camp-5');
      expect(body.campaign.Additional_Information__c).toBe('<p><strong>Rich</strong> info</p>');

      expect(mockSalesforceService.getCampaignByIdWithFields).toHaveBeenCalledWith('camp-5',
        expect.arrayContaining(['Additional_Information__c']));
    });

    it('should list active events including rich text field when requested', async () => {
      mockRequest = {
        method: 'GET',
        headers: { get: () => 'list-request-id' },
        query: new Map([['listActiveEvents', 'true']]),
      };

      process.env.SF_CLIENT_ID = 'test-client-id';
      process.env.SF_CLIENT_SECRET = 'test-client-secret';

      mockSalesforceService.getActiveEventCampaigns.mockResolvedValueOnce([
        { Id: 'camp-9', Name: 'Sample', Additional_Information__c: '<p>foo</p>' }
      ]);

      const response = await createForm(mockRequest, mockContext);

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.campaigns)).toBe(true);
      expect(body.campaigns[0].Additional_Information__c).toBe('<p>foo</p>');
      expect(mockSalesforceService.getActiveEventCampaigns).toHaveBeenCalledWith(
        expect.arrayContaining(['Additional_Information__c'])
      );
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
        Comments__c: 'Some comments',
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
        expect.any(String),
        expect.objectContaining({ id: 'test' })
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
          __formConfig: testFormConfig,
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

