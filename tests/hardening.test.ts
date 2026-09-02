// @ts-nocheck
import { jest } from '@jest/globals';
import { escapeSoqlString, assertSafeFieldList, isSafeSoqlIdentifier } from '../src/functions/shared/soql';
import { sanitizeClientFormConfig, ClientConfigError } from '../src/config/clientFormConfig';
import { filterAllowedRecipients } from '../src/functions/shared/notificationRecipients';
import { maskSensitiveData } from '../src/services/logger';
import { EmailService, escapeIcsText } from '../src/services/emailService';
import { buildSoqlQuery } from '../src/config/FormConfigUtils';
import { ContactMatchService } from '../src/services/contactMatchService';
import { getConfirmationTemplate, getEmailTemplate } from '../src/config/emailTemplates';
import { testFormConfig } from './testFormConfig';

describe('SOQL escaping', () => {
  it('escapes backslashes before quotes so a trailing backslash cannot end the literal', () => {
    expect(escapeSoqlString("abc\\'")).toBe("abc\\\\\\'");
    expect(escapeSoqlString("o'neil")).toBe("o\\'neil");
  });

  it('is applied to contact search criteria', () => {
    const query = new ContactMatchService().buildContactSearchQuery({ email: "x\\' OR Email != null OR Email = '" });
    expect(query).not.toContain("x\\' OR");
    expect(query).toContain("x\\\\\\' OR");
  });

  it('is applied to config-driven form queries', () => {
    const q = buildSoqlQuery(testFormConfig as any, "abc\\'");
    expect(q.endsWith("WHERE FormCode__c = 'abc\\\\\\'' LIMIT 1")).toBe(true);
  });

  it('rejects field names that are not plain identifiers', () => {
    expect(isSafeSoqlIdentifier('FirstName__c')).toBe(true);
    expect(isSafeSoqlIdentifier('Owner.Email')).toBe(false);
    expect(isSafeSoqlIdentifier('Id FROM Contact')).toBe(false);
    expect(() => assertSafeFieldList(['Id', 'Owner.Email'])).toThrow(/Invalid field name/);
    expect(assertSafeFieldList([' Id ', 'Name', 'Id'])).toEqual(['Id', 'Name']);
  });
});

describe('sanitizeClientFormConfig', () => {
  it('pins the object and lookup fields regardless of what the client sends', () => {
    const cfg = sanitizeClientFormConfig({
      ...testFormConfig,
      salesforce: { ...testFormConfig.salesforce, searchField: 'Email__c', lookupCodeField: 'Email__c' },
    });
    expect(cfg.salesforce.objectName).toBe('Form__c');
    expect(cfg.salesforce.searchField).toBe('FormCode__c');
    expect(cfg.salesforce.lookupCodeField).toBe('FormCode__c');
    expect(cfg.salesforce.lookupEmailField).toBe('Email__c');
  });

  it('rejects other objects, unsafe identifiers and bad ids', () => {
    expect(() => sanitizeClientFormConfig({ ...testFormConfig, salesforce: { ...testFormConfig.salesforce, objectName: 'Contact' } })).toThrow(ClientConfigError);
    expect(() => sanitizeClientFormConfig({ ...testFormConfig, salesforce: { ...testFormConfig.salesforce, allowedFields: ['Id; DELETE'] } })).toThrow(ClientConfigError);
    expect(() => sanitizeClientFormConfig({ ...testFormConfig, salesforceMapping: { 'a b': 'Email__c' } })).toThrow(ClientConfigError);
    expect(() => sanitizeClientFormConfig({ ...testFormConfig, id: '../x' })).toThrow(ClientConfigError);
    expect(() => sanitizeClientFormConfig(null)).toThrow(ClientConfigError);
  });

  it('enforces SF_ALLOWED_RECORD_TYPES when set', () => {
    process.env.SF_ALLOWED_RECORD_TYPES = 'Registration, Volunteer Application';
    try {
      expect(() => sanitizeClientFormConfig(testFormConfig)).toThrow(/Record type is not permitted/);
      expect(sanitizeClientFormConfig({ ...testFormConfig, salesforce: { ...testFormConfig.salesforce, recordTypeName: 'Registration' } }).salesforce.recordTypeName).toBe('Registration');
    } finally {
      delete process.env.SF_ALLOWED_RECORD_TYPES;
    }
  });

  it('drops UI-only sections and keeps the fields the API needs', () => {
    const cfg = sanitizeClientFormConfig({ ...testFormConfig, phases: { x: {} }, fieldMetadata: { a: {} }, formFields: ['FirstName', 'ReceiveUpdates'], terms: { orgName: 'Org' } });
    expect(cfg.phases).toEqual({});
    expect(cfg.fieldMetadata).toEqual({});
    expect(cfg.formFields).toEqual(['FirstName', 'ReceiveUpdates']);
    expect(cfg.terms?.orgName).toBe('Org');
    expect(cfg.salesforce.campaignField).toBe('Campaign__c');
    expect(cfg.salesforce.eventQueryFields).toEqual(testFormConfig.salesforce.eventQueryFields);
  });
});

describe('notification recipient allowlist', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('allows only allowlisted domains and the admin/from domains', () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.AdminEmail;
    process.env.EMAIL_FROM = 'noreply@org.example';
    process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS = 'partner.example';

    const { allowed, rejected } = filterAllowedRecipients([
      'staff@org.example',
      'team@partner.example',
      'victim@attacker.test',
      'not-an-email',
    ]);
    expect(allowed).toEqual(['staff@org.example', 'team@partner.example']);
    expect(rejected).toEqual(['victim@attacker.test', 'not-an-email']);
  });

  it('allows exact addresses on shared providers without opening the whole domain', () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.AdminEmail;
    delete process.env.EMAIL_FROM;
    delete process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS;
    process.env.NOTIFICATION_EMAIL_ALLOWED_ADDRESSES = 'Volunteer@gmail.com; other@gmail.com';

    const { allowed, rejected } = filterAllowedRecipients(['volunteer@gmail.com', 'stranger@gmail.com']);
    expect(allowed).toEqual(['volunteer@gmail.com']);
    expect(rejected).toEqual(['stranger@gmail.com']);
  });

  it('rejects everything when nothing is configured', () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.AdminEmail;
    delete process.env.EMAIL_FROM;
    delete process.env.SMTP_FROM;
    delete process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS;
    delete process.env.NOTIFICATION_EMAIL_ALLOWED_ADDRESSES;
    expect(filterAllowedRecipients(['a@b.example']).allowed).toEqual([]);
  });
});

describe('log masking', () => {
  it('masks secrets, emails, phones and headers recursively', () => {
    const out = maskSensitiveData({
      clientSecret: 'abc',
      email: 'micah@example.com',
      to: ['first@example.com'],
      nested: { Phone__c: '502-555-1234', AZURE_COMMUNICATION_CONNECTION_STRING: 'x' },
      headers: { cookie: 'a=b' },
      formId: 'ok',
    });
    expect(out.clientSecret).toBe('***MASKED***');
    expect(out.email).toBe('mi***@example.com');
    expect(out.to).toEqual(['fi***@example.com']);
    expect(out.nested.Phone__c).toBe('***1234');
    expect(out.nested.AZURE_COMMUNICATION_CONNECTION_STRING).toBe('***MASKED***');
    expect(out.headers).toBe('[redacted]');
    expect(out.formId).toBe('ok');
  });
});

describe('email rendering', () => {
  it('HTML-escapes variables in the html body but leaves *Html variables and text alone', async () => {
    const svc = new EmailService({ fromAddress: 'noreply@test' });
    const raw = jest.fn().mockResolvedValue(undefined);
    (svc as any).sendRawEmail = raw;

    await svc.sendEmail(
      'to@test',
      { subject: 'Hi {{FirstName}}', text: 'Hi {{FirstName}}', html: '<p>Hi {{FirstName}}</p>{{detailsHtml}}' },
      { FirstName: '<img src=x onerror=alert(1)>', detailsHtml: '<b>ok</b>' }
    );

    const [, subject, text, html] = raw.mock.calls[0];
    expect(subject).toBe('Hi <img src=x onerror=alert(1)>');
    expect(text).toBe('Hi <img src=x onerror=alert(1)>');
    expect(html).toBe('<p>Hi &lt;img src=x onerror=alert(1)&gt;</p><b>ok</b>');
  });

  it('escapes iCalendar text so values cannot inject properties', () => {
    expect(escapeIcsText('Room A; B, C\r\nX-EVIL:1')).toBe('Room A\\; B\\, C\\nX-EVIL:1');
  });

  it('serves templates per form with sensible fallbacks', () => {
    expect(getEmailTemplate('volunteer', 'applicationCode').subject).toBe('Your Application Code');
    expect(getEmailTemplate('unknown-form', 'applicationCode').subject).toBe('Your Confirmation Code');
    expect(getConfirmationTemplate('waiver', false).subject).toContain('Waiver and Release');
    expect(getConfirmationTemplate('event', true).subject).toBe('Registration Confirmed: {{Name}}');
    expect(getConfirmationTemplate('registration', false).subject).toBe('Registration received');
  });
});
