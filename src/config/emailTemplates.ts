/**
 * Server-owned email templates.
 *
 * Templates used to be supplied by the browser with each request. Because the
 * API is anonymous, that let anyone send arbitrary HTML from the verified
 * sender address to any recipient. Templates now live here, keyed by the form
 * id the client already sends in its form config ("volunteer", "event",
 * "waiver", "registration"). Client-supplied templates are ignored.
 *
 * Variables use {{name}} syntax and are substituted by EmailService. Values
 * are HTML-escaped when inserted into the html body unless the variable name
 * ends in "Html".
 */

import { EmailTemplate } from '../services/emailService';

export type TemplateKey = 'applicationCopy' | 'waiverCopy' | 'eventRegistration' | 'applicationCode';

type TemplateSet = Partial<Record<TemplateKey, EmailTemplate>>;

const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  applicationCopy: {
    subject: 'Your {{orgName}} submission',
    text: 'Hello {{FirstName}},\n\nThank you. Your submission has been received. Your confirmation code is{{codeText}}.\n\nThank you,\n{{orgName}}',
    html: '<p>Hello {{FirstName}},</p><p>Thank you. Your submission has been received. Your confirmation code is{{codeHtml}}.</p><p>Thank you,<br/>{{orgName}}</p>',
  },
  waiverCopy: {
    subject: 'Waiver Submission - {{orgName}}',
    text: 'Hello,\n\nYour waiver has been successfully submitted. Your confirmation code is{{codeText}}.\n\nThank you,\n{{orgName}}',
    html: '<p>Hello,</p><p>Your waiver has been successfully submitted. Your confirmation code is{{codeHtml}}.</p><p>Thank you,<br/>{{orgName}}</p>',
  },
  eventRegistration: {
    subject: 'Registration Confirmed: {{Name}}',
    text: 'Hello {{FirstName__c}},\n\nThank you — your registration for {{Name}} has been confirmed. Your confirmation code is: {{FormCode__c}}\n\nEvent details:\n{{eventDetails}}\nAdd to calendar:\n- Google: {{googleUrl}}\n- Outlook: {{outlookUrl}}\n- Apple: {{appleIcsUrl}}\n- ICS: {{icsUrl}}\n\nThank you,\nRefuge International',
    html: '<p>Hello {{FirstName__c}},</p><p>Thank you — your registration for <strong>{{Name}}</strong> has been confirmed. Your confirmation code is: <strong>{{FormCode__c}}</strong></p><div>{{eventDetailsHtml}}</div><p>Add to calendar: <a href="{{googleUrl}}" target="_blank">Google</a> | <a href="{{outlookUrl}}" target="_blank">Outlook</a> | <a href="{{appleIcsUrl}}">Apple</a> | <a href="{{icsUrl}}">ICS</a></p><p>Thank you,<br/>Refuge International</p>',
  },
  applicationCode: {
    subject: 'Your Confirmation Code',
    text: 'Hello,\n\nWe received a request to retrieve your confirmation code. Your code is: {{FormCode__c}}\n\nYou can use this code to view or update your submission at our website. If you did not request this email, please ignore it.\n\nThank you',
    html: '<p>Hello,</p><p>We received a request to retrieve your confirmation code. <strong>Your code is: <code>{{FormCode__c}}</code></strong></p><p>You can use this code to view or update your submission at our website. If you did not request this email, please ignore it.</p><p>Thank you</p>',
  },
};

const FORM_TEMPLATES: Record<string, TemplateSet> = {
  volunteer: {
    applicationCopy: {
      subject: 'Your {{orgName}} Application Submission',
      text: 'Hello {{FirstName}},\n\nThank you — your application has been successfully submitted. You can monitor its progress by navigating to the application page and selecting "Check Progress", then entering your application code{{codeText}}.\n\nIf you cannot locate your application code, use the "Forgot your code?" link on the application page.\n\nThank you,\n{{orgName}}',
      html: '<p>Hello {{FirstName}},</p><p>Thank you — your application has been <strong>successfully submitted</strong>. You can monitor its progress by navigating to the application page and selecting <strong>Check Progress</strong>, then entering your application code{{codeHtml}}.</p><p>If you cannot locate your application code, use the <em>Forgot your code?</em> link on the application page.</p><p>Thank you,<br/>{{orgName}}</p>',
    },
    applicationCode: {
      subject: 'Your Application Code',
      text: 'Hello,\n\nWe received a request to retrieve your application code. Your application code is: {{FormCode__c}}\n\nYou can use this code to resume your application at our website. If you did not request this email, please ignore it.\n\nThank you',
      html: '<p>Hello,</p><p>We received a request to retrieve your application code. <strong>Your application code is: <code>{{FormCode__c}}</code></strong></p><p>You can use this code to resume your application at our website. If you did not request this email, please ignore it.</p><p>Thank you</p>',
    },
  },
  event: {
    eventRegistration: DEFAULT_TEMPLATES.eventRegistration,
    applicationCode: {
      subject: 'Your Registration Code',
      text: 'Hello,\n\nWe received a request to retrieve your registration code. Your registration code is: {{FormCode__c}}\n\nYou can use this code to view or update your registration at our website. If you did not request this email, please ignore it.\n\nThank you',
      html: '<p>Hello,</p><p>We received a request to retrieve your registration code. <strong>Your registration code is: <code>{{FormCode__c}}</code></strong></p><p>You can use this code to view or update your registration at our website. If you did not request this email, please ignore it.</p><p>Thank you</p>',
    },
  },
  waiver: {
    waiverCopy: {
      subject: 'Waiver and Release Form of Liability Submission - The Nations Next Door',
      text: 'Hello {{ParentFirstName__c}},\n\nYour waiver and release form of liability for {{FirstName__c}} has been successfully submitted for The Nations Next Door program. Your confirmation code is {{codeText}}.\n\nThank you,\nRefuge International',
      html: '<p>Hello {{ParentFirstName__c}},</p><p>Your waiver and release form of liability for <strong>{{FirstName__c}}</strong> has been successfully submitted for The Nations Next Door program. Your confirmation code is <strong>{{codeHtml}}</strong>.</p><p>Thank you,<br/>Refuge International</p>',
    },
    applicationCode: {
      subject: 'Your Waiver Code - The Nations Next Door',
      text: 'Hello,\n\nWe received a request to retrieve your waiver code for The Nations Next Door program. Your waiver code is: {{FormCode__c}}\n\nYou can use this code to view or update your waiver at our website. If you did not request this email, please ignore it.\n\nThank you,\nRefuge International',
      html: '<p>Hello,</p><p>We received a request to retrieve your waiver code for The Nations Next Door program. <strong>Your waiver code is: <code>{{FormCode__c}}</code></strong></p><p>You can use this code to view or update your waiver at our website. If you did not request this email, please ignore it.</p><p>Thank you,<br/>Refuge International</p>',
    },
  },
  registration: {
    applicationCopy: {
      subject: 'Registration received',
      text: 'Hello {{FirstName__c}},\n\nYour registration has been received. Your confirmation code is {{FormCode__c}}.\n\nThank you,\nRefuge International',
      html: '<p>Hello {{FirstName__c}},</p><p>Your registration has been received. Your confirmation code is <strong>{{FormCode__c}}</strong>.</p><p>Thank you,<br/>Refuge International</p>',
    },
  },
};

export function normalizeFormId(formId: any): string {
  return typeof formId === 'string' ? formId.trim().toLowerCase() : '';
}

export function hasFormTemplates(formId: any): boolean {
  return Object.prototype.hasOwnProperty.call(FORM_TEMPLATES, normalizeFormId(formId));
}

/**
 * Look up a template for a form. Falls back to the default set when the form
 * has no override for that key.
 */
export function getEmailTemplate(formId: any, key: TemplateKey): EmailTemplate {
  const set = FORM_TEMPLATES[normalizeFormId(formId)] || {};
  return set[key] || DEFAULT_TEMPLATES[key];
}

/**
 * Choose the applicant confirmation template for a submission: the event
 * template when a campaign is attached, otherwise the form's copy template.
 */
export function getConfirmationTemplate(formId: any, hasCampaign: boolean): EmailTemplate {
  if (hasCampaign) return getEmailTemplate(formId, 'eventRegistration');
  const set = FORM_TEMPLATES[normalizeFormId(formId)] || {};
  return set.applicationCopy || set.waiverCopy || DEFAULT_TEMPLATES.applicationCopy;
}
