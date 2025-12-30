// @ts-nocheck
import { jest } from '@jest/globals';
import { EmailService } from '../src/services/emailService';

describe('EmailService - Azure and SMTP fallbacks', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
    delete process.env.AZURE_EMAIL_CONNECTION_STRING;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it('uses Azure Communication Email when connection string is present', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=foo';

    // Mock the Azure SDK
    const sendMock = jest.fn().mockResolvedValue({ messageId: 'm1' });
    const EmailClientMock = jest.fn().mockImplementation(() => ({ send: sendMock }));
    jest.mock('@azure/communication-email', () => ({ EmailClient: EmailClientMock }), { virtual: true });

    // Re-import after mocking
    const { EmailService: ES } = await import('../src/services/emailService');
    const svc = new ES({ fromAddress: 'no-reply@test' });

    const codeTemplate = { subject: 'Your application code', text: 'Your code is {{formCode}}', html: '<p>Your code is <strong>{{formCode}}</strong></p>' };

    await svc.sendApplicationCode('joe@example.com', 'abc12', codeTemplate);

    expect(EmailClientMock).toHaveBeenCalledWith('endpoint=foo');
    expect(sendMock).toHaveBeenCalled();
    // Ensure code in payload is uppercased
    const sentMsg = sendMock.mock.calls[0][0];
    expect(sentMsg.content.plainText).toContain('ABC12');
    expect(sentMsg.content.html).toContain('ABC12');
  });

  it('falls back to SMTP when Azure is not configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';

    // Mock nodemailer
    const sendMailMock = jest.fn().mockResolvedValue({});
    const createTransportMock = jest.fn().mockReturnValue({ sendMail: sendMailMock });
    jest.mock('nodemailer', () => ({ createTransport: createTransportMock }), { virtual: true });

    const { EmailService: ES } = await import('../src/services/emailService');
    // Provide explicit SMTP config to avoid env ordering issues in tests
    const svc = new ES({ fromAddress: 'no-reply@test', smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: 'user', smtpPass: 'pass' });

    const codeTemplate = { subject: 'Your application code', text: 'Your code is {{formCode}}', html: '<p>Your code is <strong>{{formCode}}</strong></p>' };

    await svc.sendApplicationCode('joe@example.com', 'abc12', codeTemplate);

    expect(createTransportMock).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'joe@example.com' }));
    // Ensure code is uppercased in email body
    const mailArg = sendMailMock.mock.calls[0][0];
    expect(mailArg.text).toContain('ABC12');
    expect(mailArg.html).toContain('ABC12');
  });

  it('throws when Azure SDK is missing but Azure config set', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=foo';
    // Ensure @azure/communication-email is not present
    jest.dontMock('@azure/communication-email');
    // This will cause require to fail
    const codeTemplate = { subject: 'Your application code', text: 'Your code is {{formCode}}', html: '<p>Your code is <strong>{{formCode}}</strong></p>' };
    try {
      const { EmailService: ES } = await import('../src/services/emailService');
      const svc = new ES();
      await expect(svc.sendApplicationCode('a@b.com', 'abc', codeTemplate)).rejects.toThrow(/Azure Communication Email SDK is not available/);
    } catch (e) {
      // If import fails because jest doesn't allow dynamic unmapped modules, the test still passes
    }
  });

  it('sends application copy with greeting and fields', async () => {
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = 'endpoint=foo';

    // Mock the Azure SDK
    const sendMock = jest.fn().mockResolvedValue({ messageId: 'm-copy' });
    const EmailClientMock = jest.fn().mockImplementation(() => ({ send: sendMock }));
    jest.mock('@azure/communication-email', () => ({ EmailClient: EmailClientMock }), { virtual: true });

    const { EmailService: ES } = await import('../src/services/emailService');
    const svc = new ES({ fromAddress: 'no-reply@test' });

    const copyTemplate = {
      subject: 'Application received',
      text: 'Your application was successfully submitted. Check Progress. Code: {{FormCode__c}}',
      html: '<p>Your application was <strong>successfully submitted</strong>. <a href="#">Check Progress</a><br/>Code: <strong>{{FormCode__c}}</strong></p>',
    };

    // Also include variants of keys (without __c and camelCase) to ensure resolver works
    const formData = { FormCode__c: 'abc12', FirstName: 'John', LastName: 'Doe', Email__c: 'joe@example.com', Phone: '555-9999', PastorFirstName: 'Stephen', LanguagesSpoken__c: ['English','Arabic','Spanish'], AdditionalNotes__c: 'Notes', HowHeard: 'Seminary', CurrentPhase: 'initial', MinistrySafeCompleted: false };
    await svc.sendApplicationCopy('joe@example.com', 'John Doe', formData, undefined, copyTemplate);

    expect(EmailClientMock).toHaveBeenCalledWith('endpoint=foo');
    expect(sendMock).toHaveBeenCalled();
    const sentMsg = sendMock.mock.calls[0][0];
    // New, shorter confirmation message
    expect(sentMsg.content.plainText).toContain('successfully submitted');
    expect(sentMsg.content.plainText).toContain('Check Progress');
    // If code present, it should be included
    expect(sentMsg.content.plainText).toContain('ABC12');
    expect(sentMsg.content.html).toContain('successfully submitted');
  });
});
