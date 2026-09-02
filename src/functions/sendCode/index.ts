import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import { Logger } from '../../services/logger';
import { SalesforceService } from '../../services/salesforceService';
import { EmailService } from '../../services/emailService';
import {
  resolveRequestObject,
  resolveRequestId,
  parseFlexibleJsonBody,
  getRawBodyTextForDiagnostics,
} from '../shared/requestUtils';
import { buildSalesforceConfig } from '../shared/salesforceUtils';
import { isDevelopment } from '../shared/env';
import { getEmailTemplate } from '../../config/emailTemplates';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The response is identical whether or not a submission exists for the address,
// so the endpoint cannot be used to discover who has applied.
const ACCEPTED_MESSAGE = 'If a submission exists for that email address, the code has been sent to it.';

function jsonResponse(status: number, body: any, extraHeaders: { [key: string]: string } = {}): HttpResponseInit {
  return {
    status,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  };
}

function extractEmail(body: any, request: HttpRequest, reqObj: any): string {
  const emailFromBody = body && body.email ? String(body.email).trim() : '';
  const emailFromQuery =
    typeof request.query?.get === 'function' ? request.query.get('email') || '' : reqObj?.query?.email || '';
  return emailFromBody || String(emailFromQuery || '').trim();
}

function extractFormId(body: any): string {
  const candidate = body?.formId ?? body?.form_id ?? body?.__formConfig?.id;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

async function sendCodeHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const reqObj: any = resolveRequestObject(request, context);
  const requestId = resolveRequestId(request, context, reqObj);
  const logger = new Logger(requestId, context.invocationId);

  logger.info('sendCode function triggered', { method: reqObj?.method });

  try {
    const method = request.method?.toUpperCase();
    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed. Only POST is supported.' });
    }

    let body: any;
    try {
      body = await parseFlexibleJsonBody(request, reqObj);
    } catch (e: any) {
      logger.error('Invalid JSON in request body', e);
      const extra: any = { error: 'Invalid JSON in request body' };
      if (isDevelopment()) {
        extra.raw = getRawBodyTextForDiagnostics(reqObj, request);
      }
      return jsonResponse(400, extra);
    }

    const email = extractEmail(body, request, reqObj);
    if (!email) {
      return jsonResponse(400, { error: 'Missing required parameter: email' });
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return jsonResponse(400, { error: 'Invalid email address' });
    }

    // Templates are owned by the server and selected by form id; any template
    // supplied in the request body is ignored.
    const formId = extractFormId(body);
    const emailTemplate = getEmailTemplate(formId, 'applicationCode');

    const salesforceService = new SalesforceService(buildSalesforceConfig());
    await salesforceService.authenticate();

    let form: any;
    try {
      form = await salesforceService.getFormByEmail(email);
    } catch (err: any) {
      logger.info('No form found for email; returning generic acknowledgement', { email });
      return jsonResponse(200, { message: ACCEPTED_MESSAGE }, { 'X-Request-Id': requestId });
    }

    const code = form?.FormCode__c || form?.FormCode || form?.formCode || null;
    if (!code) {
      logger.error('Form found but no FormCode available', undefined, { formId: form?.Id });
      return jsonResponse(200, { message: ACCEPTED_MESSAGE }, { 'X-Request-Id': requestId });
    }

    try {
      const emailService = new EmailService();
      await emailService.sendApplicationCode(email, code, emailTemplate);
    } catch (err: any) {
      const errorId = randomUUID();
      logger.error('Failed to send email with application code', err, { errorId });

      const bodyPayload: any = { error: 'Failed to send email', errorId };
      if (isDevelopment() && err?.message) bodyPayload.detail = String(err.message);

      return jsonResponse(500, bodyPayload, { 'X-Error-Id': errorId, 'X-Request-Id': requestId });
    }

    return jsonResponse(200, { message: ACCEPTED_MESSAGE }, { 'X-Request-Id': requestId });
  } catch (error: any) {
    logger.error('Unhandled error in sendCode handler', error);
    return jsonResponse(500, { error: 'Internal server error' }, { 'X-Request-Id': requestId });
  }
}

app.http('sendCode', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'form/send-code',
  handler: sendCodeHandler
});

export default sendCodeHandler;
