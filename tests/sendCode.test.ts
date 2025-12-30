// @ts-nocheck
import { jest } from '@jest/globals';
import sendCode from '../src/functions/sendCode';
import { SalesforceService } from '../src/services/salesforceService';
import { EmailService } from '../src/services/emailService';
import { testFormConfig } from './testFormConfig';

jest.mock('../src/services/salesforceService');
jest.mock('../src/services/emailService');

describe('sendCode function', () => {
  let mockRequest: any;
  let mockContext: any;
  let mockSf: any;
  let mockEmailService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      invocationId: 'sendcode-inv-1',
      log: jest.fn(),
    };

    mockSf = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      getFormByEmail: jest.fn().mockResolvedValue({ Id: 'form-1', FormCode__c: 'abc12', Email__c: 'joe@example.com' }),
    };

    mockEmailService = {
      sendApplicationCode: jest.fn().mockResolvedValue(undefined),
    };

    (SalesforceService as jest.MockedClass<any>).mockImplementation(() => mockSf);
    (EmailService as jest.MockedClass<any>).mockImplementation(() => mockEmailService);
  });

  it('sends email when form found by email', async () => {
    mockRequest = {
      method: 'POST',
      headers: { get: jest.fn().mockReturnValue('rid-1') },
      json: jest.fn().mockResolvedValue({
        email: 'joe@example.com',
        template: {
          subject: 'Your code',
          text: 'Here is your code: {{code}}',
          html: '<p>Here is your code: <strong>{{code}}</strong></p>'
        }
      }),
    };

    const res = await sendCode(mockRequest, mockContext);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Email sent');
    expect(mockSf.authenticate).toHaveBeenCalled();
    expect(mockSf.getFormByEmail).toHaveBeenCalledWith('joe@example.com');
    expect(mockEmailService.sendApplicationCode).toHaveBeenCalledWith('joe@example.com', 'abc12', expect.objectContaining({ subject: 'Your code' }));
  });

  it('returns 500 when email sending fails and includes detail and errorId in non-production', async () => {
    mockEmailService.sendApplicationCode.mockRejectedValue(new Error('SMTP auth failed'));

    mockRequest = {
      method: 'POST',
      headers: { get: jest.fn().mockReturnValue('rid-3') },
      json: jest.fn().mockResolvedValue({
        email: 'joe@example.com',
        template: {
          subject: 'Your code',
          text: 'Here is your code: {{code}}',
          html: '<p>Here is your code: <strong>{{code}}</strong></p>'
        }
      }),
    };

    const res = await sendCode(mockRequest, mockContext);
    expect(res.status).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Failed to send email');
    // test environment is not production so detail should be present
    expect(body.detail).toBe('SMTP auth failed');
    // errorId should be present and a non-empty string
    expect(typeof body.errorId).toBe('string');
    expect(body.errorId.length).toBeGreaterThan(0);
    // header should contain X-Error-Id
    expect(res.headers['X-Error-Id'] || res.headers['x-error-id']).toBeDefined();
  });

  it('returns 404 when no form found', async () => {
    mockSf.getFormByEmail.mockRejectedValue(new Error('Form not found with email'));

    mockRequest = {
      method: 'POST',
      headers: { get: jest.fn().mockReturnValue('rid-2') },
      json: jest.fn().mockResolvedValue({ email: 'missing@example.com' }),
    };

    const res = await sendCode(mockRequest, mockContext);
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('No application found');
  });

  it('returns 400 for missing email', async () => {
    mockRequest = { method: 'POST', headers: { get: jest.fn().mockReturnValue(null) }, json: jest.fn().mockResolvedValue({}) };
    const res = await sendCode(mockRequest, mockContext);
    expect(res.status).toBe(400);
  });
});
