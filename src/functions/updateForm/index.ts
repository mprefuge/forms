import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SalesforceService } from '../../services/salesforceService';
import { Logger } from '../../services/logger';

async function updateFormHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  // Resolve incoming request object (the runtime sometimes swaps params)
  let reqObj: any = request;
  let ctxObj: any = context;

  // Case A: (request, context) => request.method exists
  // Case B: (context, request) => context is actually the request object
  if (!reqObj || typeof reqObj.method === 'undefined') {
    const ctxAny: any = context;

    // If the second param (context) looks like HttpRequest, swap
    if (ctxAny && typeof ctxAny.method !== 'undefined') {
      reqObj = ctxAny;
      ctxObj = request;
    } else {
      // fallback to context.req/raw shapes
      reqObj = (ctxAny && (ctxAny.req || ctxAny.bindingData || ctxAny.raw?.req)) || reqObj;
    }
  }

  // Support both Azure Functions header objects and testing header.get() API
  const headersAny: any = reqObj?.headers || request.headers || {};
  const requestId = (typeof headersAny.get === 'function' ? headersAny.get('X-Request-Id') : headersAny['x-request-id'] || headersAny['X-Request-Id']) || context.invocationId || '';
  const logger = new Logger(requestId, context.invocationId);

  logger.info('updateForm function triggered', { method: reqObj?.method });

  try {
    const method = request.method?.toUpperCase();

    // Only allow POST method
    if (method !== 'POST') {
      logger.error('Invalid HTTP method', new Error(`Method ${request.method} not allowed`));
      return {
        status: 405,
        body: JSON.stringify({ error: 'Method not allowed. Only POST is supported.' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Parse request body
    let updateData: any;
    try {
      if (request && typeof request.json === 'function') {
        updateData = await request.json();
      } else if (request && typeof request.body !== 'undefined') {
        updateData = request.body;
      } else {
        updateData = {};
      }
      logger.debug('Request body parsed', { updateDataKeys: Object.keys(updateData || {}) });
    } catch (error: any) {
      logger.error('Invalid JSON in request body', error);
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Get form identifier from route parameter or request body
    const routeId = request.params?.id;
    const formCode = updateData.formCode || updateData.FormCode__c;
    const formId = updateData.formId || updateData.Id || routeId;

    if (!formCode && !formId) {
      logger.error('Missing form identifier', new Error('formCode or formId is required'));
      return {
        status: 400,
        body: JSON.stringify({ error: 'Missing required parameter: formCode or formId' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Initialize Salesforce Service (credential validation is centralized in the service)
    const sfConfig = {
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
      clientId: process.env.SF_CLIENT_ID || '',
      clientSecret: process.env.SF_CLIENT_SECRET || '',
    };

    const salesforceService = new SalesforceService(sfConfig);

    // Authenticate with Salesforce
    logger.info('Authenticating with Salesforce');
    await salesforceService.authenticate();
    logger.info('Successfully authenticated with Salesforce');

    // Resolve formId if formCode is provided
    let resolvedFormId = formId;
    if (!resolvedFormId && formCode) {
      logger.info('Resolving form ID from form code', { formCode });
      const formData = await salesforceService.getFormByCode(formCode);
      resolvedFormId = formData.Id;
      logger.info('Form ID resolved', { formId: resolvedFormId });
    }

    // Extract form field updates, attachments, and notes
    const formFields = { ...updateData };
    delete formFields.formCode;
    delete formFields.formId;
    delete formFields.Id;
    delete formFields.FormCode__c;
    const attachments = formFields.Attachments || formFields.attachments;
    const notes = formFields.Notes || formFields.notes;
    delete formFields.Attachments;
    delete formFields.attachments;
    delete formFields.Notes;
    delete formFields.notes;

    // Update form in Salesforce
    logger.info('Updating form in Salesforce', { formId: resolvedFormId, fieldCount: Object.keys(formFields).length });
    await salesforceService.updateForm(resolvedFormId, formFields, requestId);
    logger.info('Form updated successfully', { formId: resolvedFormId });

    // Handle attachments if provided
    if (Array.isArray(attachments) && attachments.length > 0) {
      logger.info('Creating attachments', { count: attachments.length });
      await salesforceService.createAttachments(resolvedFormId, attachments);
      logger.info('Attachments created successfully');
    }

    // Handle notes if provided
    if (Array.isArray(notes) && notes.length > 0) {
      logger.info('Creating notes', { count: notes.length });
      await salesforceService.createNotes(resolvedFormId, notes);
      logger.info('Notes created successfully');
    }

    // Return success response
    return {
      status: 200,
      body: JSON.stringify({ 
        id: resolvedFormId, 
        message: 'Form updated successfully',
        attachmentsCreated: Array.isArray(attachments) ? attachments.length : 0,
        notesCreated: Array.isArray(notes) ? notes.length : 0
      }),
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    };
  } catch (error: any) {
    logger.error('Error in updateForm handler', error, { errorMessage: error?.message });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.message?.includes('Form not found')) {
      statusCode = 404;
      errorMessage = error.message;
    } else if (error.message?.includes('Salesforce error')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message?.includes('Invalid field')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message?.includes('Missing Salesforce credentials')) {
      statusCode = 500;
      errorMessage = 'Missing Salesforce credentials';
    }

    return {
      status: statusCode,
      body: JSON.stringify({ error: errorMessage }),
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    };
  }
}

app.http('updateForm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'form/{id}',
  handler: updateFormHandler
});

export default updateFormHandler;
