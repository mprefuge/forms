import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { Logger } from '../../services/logger';
import { SalesforceService } from '../../services/salesforceService';
import { EmailService, EmailTemplate } from '../../services/emailService';
import {
  resolveRequestObject,
  resolveRequestId,
  parseFlexibleJsonBody,
  getRawBodyTextForDiagnostics,
} from '../shared/requestUtils';
import { buildSalesforceConfig } from '../shared/salesforceUtils';

function logRequestBodyShape(request: HttpRequest, reqObj: any, logger: Logger): void {
  try {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Request body shapes', {
        hasRequestJsonFn: !!(request && typeof request.json === 'function'),
        requestBodyType: typeof request?.body,
        reqObjBodyType: typeof reqObj?.body,
        reqObjRawBodyType: reqObj && reqObj.rawBody ? reqObj.rawBody.constructor?.name || typeof reqObj.rawBody : null,
      });
    }
  } catch (e) {
  }
}

function extractEmail(body: any, request: HttpRequest, reqObj: any): string {
  const emailFromBody = body && body.email ? String(body.email).trim() : '';
  const emailFromQuery =
    typeof request.query?.get === 'function' ? request.query.get('email') || '' : reqObj?.query?.email || '';
  return emailFromBody || String(emailFromQuery || '').trim();
}

function validateEmailTemplateFromBody(body: any): EmailTemplate | null {
  const emailTemplate = (body && body.template) as EmailTemplate | undefined;
  if (!emailTemplate || !emailTemplate.subject || !emailTemplate.text || !emailTemplate.html) {
    return null;
  }
  return emailTemplate;
}

function generateErrorId(): string {
  return typeof require('crypto')?.randomUUID === 'function'
    ? require('crypto').randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function sendCodeHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const reqObj: any = resolveRequestObject(request, context);
  const requestId = resolveRequestId(request, context, reqObj);
  const logger = new Logger(requestId, context.invocationId);

  logger.info('sendCode function triggered', { method: reqObj?.method });
  logRequestBodyShape(request, reqObj, logger);

  try {
    const method = request.method?.toUpperCase();
    if (method !== 'POST') {
      return {
        status: 405,
        body: JSON.stringify({ error: 'Method not allowed. Only POST is supported.' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    let body: any;
    try {
      body = await parseFlexibleJsonBody(request, reqObj);
    } catch (e: any) {
      logger.error('Invalid JSON in request body', e);
      const extra: any = { error: 'Invalid JSON in request body' };
      if (process.env.NODE_ENV !== 'production') {
        extra.raw = getRawBodyTextForDiagnostics(reqObj, request);
      }
      return { status: 400, body: JSON.stringify(extra), headers: { 'Content-Type': 'application/json' } };
    }

    const email = extractEmail(body, request, reqObj);

    if (!email) {
      logger.error('Missing email parameter', new Error('email is required'));
      return { status: 400, body: JSON.stringify({ error: 'Missing required parameter: email' }), headers: { 'Content-Type': 'application/json' } };
    }

    // Initialize services
    const sfConfig = buildSalesforceConfig();
    const salesforceService = new SalesforceService(sfConfig);
    await salesforceService.authenticate();

    // Lookup by email to retrieve application code
    logger.info('Looking up application by email', { email });
    let form: any;
    try {
      form = await salesforceService.getFormByEmail(email);
    } catch (err: any) {
      logger.info('Form not found by email', { email });
      return { status: 404, body: JSON.stringify({ error: `No application found for email: ${email}` }), headers: { 'Content-Type': 'application/json' } };
    }

    const code = form.FormCode__c || form.FormCode || form.formCode || null;
    if (!code) {
      logger.error('Form found but no FormCode available', { formId: form.Id });
      return { status: 500, body: JSON.stringify({ error: 'Application found but no application code present' }), headers: { 'Content-Type': 'application/json' } };
    }

    // Send email using template supplied by caller (front-end)
    try {
      const emailService = new EmailService();

      const emailTemplate = validateEmailTemplateFromBody(body);
      if (!emailTemplate) {
        return {
          status: 400,
          body: JSON.stringify({ error: 'Missing email template. Provide subject, text, and html fields.' }),
          headers: { 'Content-Type': 'application/json' },
        };
      }

      await emailService.sendApplicationCode(email, code, emailTemplate);
    } catch (err: any) {
      const errorId = generateErrorId();
      logger.error('Failed to send email with application code', {
        errorId,
        errorMessage: err?.message || String(err),
        stack: err?.stack || null,
      });

      const detail = (err && err.message) ? String(err.message) : undefined;
      const bodyPayload: any = { error: 'Failed to send email', errorId };
      if (process.env.NODE_ENV !== 'production' && detail) bodyPayload.detail = detail;

      return { status: 500, body: JSON.stringify(bodyPayload), headers: { 'Content-Type': 'application/json', 'X-Error-Id': errorId } };
    }

    return {
      status: 200,
      body: JSON.stringify({ message: 'Email sent' }),
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    };

  } catch (error: any) {
    logger.error('Unhandled error in sendCode handler', error);
    return { status: 500, body: JSON.stringify({ error: 'Internal server error' }), headers: { 'Content-Type': 'application/json' } };
  }
}

app.http('sendCode', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'form/send-code',
  handler: sendCodeHandler
});

// Diagnostics endpoint implementation (kept here for reuse by a small wrapper function)
export async function sendCodeDiagnostics(request: any, context: InvocationContext): Promise<HttpResponseInit> {
  const logger = new Logger('', context.invocationId);
  if (process.env.NODE_ENV === 'production') {
    logger.info('Diagnostics endpoint hit in production - refusing to reveal details');
    return { status: 403, body: JSON.stringify({ error: 'Diagnostics not available in production' }), headers: { 'Content-Type': 'application/json' } };
  }

  let azureSdkAvailable = false;
  try {
    // Try to require the @azure/communication-email module
    const m = require('@azure/communication-email');
    azureSdkAvailable = !!(m && (m.EmailClient || m.default?.EmailClient));
  } catch (e) {
    azureSdkAvailable = false;
  }

  let nodemailerAvailable = false;
  try {
    const m = require('nodemailer');
    nodemailerAvailable = !!(m && m.createTransport);
  } catch (e) {
    nodemailerAvailable = false;
  }

  const diagnostics = {
    azureConfigured: !!(process.env.AZURE_COMMUNICATION_CONNECTION_STRING || process.env.AZURE_EMAIL_CONNECTION_STRING),
    azureSdkAvailable,
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS),
    nodemailerAvailable,
    emailFrom: process.env.EMAIL_FROM || null,
    nodeEnv: process.env.NODE_ENV || 'development'
  };

  return { status: 200, body: JSON.stringify(diagnostics), headers: { 'Content-Type': 'application/json' } };
}

export default sendCodeHandler;
