import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { Logger } from '../../services/logger';
import { SalesforceService } from '../../services/salesforceService';
import { EmailService } from '../../services/emailService';

async function sendCodeHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let reqObj: any = request;
  let ctxObj: any = context;

  if (!reqObj || typeof reqObj.method === 'undefined') {
    const ctxAny: any = context;
    if (ctxAny && typeof ctxAny.method !== 'undefined') {
      reqObj = ctxAny;
      ctxObj = request;
    } else {
      reqObj = (ctxAny && (ctxAny.req || ctxAny.bindingData || ctxAny.raw?.req)) || reqObj;
    }
  }

  const headersAny: any = reqObj?.headers || request.headers || {};
  const requestId = (typeof headersAny.get === 'function' ? headersAny.get('X-Request-Id') : headersAny['x-request-id'] || headersAny['X-Request-Id']) || context.invocationId || '';
  const logger = new Logger(requestId, context.invocationId);

  logger.info('sendCode function triggered', { method: reqObj?.method });

  // Debug shape of incoming request to handle different hosts
  try {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Request body shapes', {
        hasRequestJsonFn: !!(request && typeof request.json === 'function'),
        requestBodyType: typeof (request?.body),
        reqObjBodyType: typeof (reqObj?.body),
        reqObjRawBodyType: reqObj && reqObj.rawBody ? (reqObj.rawBody.constructor?.name || typeof reqObj.rawBody) : null,
      });
    }
  } catch (e) {
    // ignore logging errors
  }

  try {
    const method = request.method?.toUpperCase();
    if (method !== 'POST') {
      return {
        status: 405,
        body: JSON.stringify({ error: 'Method not allowed. Only POST is supported.' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Parse body (be tolerant of different runtime shapes)
    let body: any;
    // Helper: read a Node readable stream to string
    const streamToString = (stream: any) => new Promise<string>(async (resolve, reject) => {
      if (!stream) return resolve('');
      // Node.js ReadableStream with .on
      if (typeof stream.on === 'function') {
        let data = '';
        stream.on('data', (chunk: any) => { try { data += chunk.toString(); } catch(e) { data += String(chunk); } });
        stream.on('end', () => resolve(data));
        stream.on('error', (err: any) => reject(err));
        return;
      }

      // WHATWG ReadableStream with getReader()
      if (typeof stream.getReader === 'function') {
        try {
          const reader = stream.getReader();
          let result = '';
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { value, done } = await reader.read();
            if (done) break;
            try { result += (typeof value === 'string') ? value : Buffer.from(value).toString(); } catch (e) { result += String(value); }
          }
          resolve(result);
          return;
        } catch (e) {
          reject(e);
          return;
        }
      }

      // Fallback - try to coerce to string
      try { resolve(String(stream)); } catch (e) { resolve(''); }
    });

    try {
      if (request && typeof request.json === 'function') {
        // Preferred: runtime provides a json() helper
        body = await request.json();
      } else if (request && typeof request.body !== 'undefined') {
        body = request.body;
      } else if (reqObj && typeof reqObj.body !== 'undefined') {
        body = reqObj.body;
      } else if (reqObj && typeof reqObj.rawBody !== 'undefined') {
        // rawBody may be a string, buffer, or readable stream
        if (typeof reqObj.rawBody === 'string') {
          try {
            body = JSON.parse(reqObj.rawBody);
          } catch (err) {
            body = {};
          }
        } else if (reqObj.rawBody && typeof reqObj.rawBody.getReader === 'function') {
          // WHATWG ReadableStream
          const txt = await streamToString(reqObj.rawBody);
          try {
            body = JSON.parse(txt);
          } catch (err) {
            body = {};
          }
        } else if (reqObj.rawBody && typeof reqObj.rawBody.on === 'function') {
          // Node Readable stream
          const txt = await streamToString(reqObj.rawBody);
          try {
            body = JSON.parse(txt);
          } catch (err) {
            body = {};
          }
        } else {
          body = {};
        }
      } else if (request && (request as any).raw && (request as any).raw.req) {
        // Under some runtimes, the raw Node IncomingMessage is under request.raw.req
        try {
          const txt = await streamToString((request as any).raw.req);
          try { body = JSON.parse(txt); } catch (e) { body = {}; }
        } catch (e) {
          body = {};
        }
      } else {
        body = {};
      }

      // If the body is a string (unparsed JSON), attempt to parse it
      if (typeof body === 'string' && body.trim().length > 0) {
        try {
          body = JSON.parse(body);
        } catch (err) {
          // leave as-is and let validation handle missing fields
        }
      }
    } catch (e: any) {
      logger.error('Invalid JSON in request body', e);
      // provide a helpful message but include any raw text in non-production
      const extra: any = { error: 'Invalid JSON in request body' };
      if (process.env.NODE_ENV !== 'production') {
        extra.raw = String(reqObj?.body || reqObj?.rawBody || request?.body || '');
      }
      return { status: 400, body: JSON.stringify(extra), headers: { 'Content-Type': 'application/json' } };
    }

    // Accept email in body or as a query parameter (helpful when body parsing is problematic)
    const emailFromBody = (body && body.email) ? String(body.email).trim() : '';
    const emailFromQuery = (typeof request.query?.get === 'function') ? (request.query.get('email') || '') : (reqObj?.query?.email || '');
    const email = emailFromBody || String(emailFromQuery || '').trim();

    if (!email) {
      logger.error('Missing email parameter', new Error('email is required'));
      return { status: 400, body: JSON.stringify({ error: 'Missing required parameter: email' }), headers: { 'Content-Type': 'application/json' } };
    }

    // Initialize services
    const sfConfig = {
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
      clientId: process.env.SF_CLIENT_ID || '',
      clientSecret: process.env.SF_CLIENT_SECRET || '',
    };
    const salesforceService = new SalesforceService(sfConfig);
    await salesforceService.authenticate();

    // Lookup by email
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

    // Send email
    try {
      const emailService = new EmailService();
      await emailService.sendApplicationCode(email, code);
    } catch (err: any) {
      // Generate a short error correlation id to help trace logs
      const errorId = (typeof require('crypto')?.randomUUID === 'function') ? require('crypto').randomUUID() : `${Date.now()}-${Math.floor(Math.random()*1000)}`;
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
