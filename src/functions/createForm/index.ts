import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SalesforceService } from '../../services/salesforceService';
import { Logger } from '../../services/logger';

async function createFormHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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

  logger.info('createForm function triggered', { method: reqObj?.method });
  logger.debug('Raw request headers', { headers: headersAny });
  try {
    logger.debug('Request method type and value', { type: typeof reqObj?.method, value: reqObj?.method });
    const keys = Object.keys(reqObj || {}).slice(0, 20);
    logger.debug('Request top-level keys', { keys });
  } catch (e: any) {
    logger.debug('Failed to inspect request object', { error: e?.message || e });
  }

  try {
    const method = request.method?.toUpperCase();

    // Route to appropriate handler
    if (method === 'GET') {
      return await getFormHandler(request, context, logger, requestId);
    } else if (method === 'POST') {
      return await postFormHandler(request, context, logger, requestId);
    } else {
      logger.error('Invalid HTTP method', new Error(`Method ${request.method} not allowed`));
      return {
        status: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
  } catch (error: any) {
    logger.error('Error in createForm handler', error, { errorMessage: error?.message });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.message?.includes('RecordType not found')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message?.includes('Salesforce error')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message?.includes('Form not found')) {
      statusCode = 404;
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

async function postFormHandler(request: HttpRequest, context: InvocationContext, logger: Logger, requestId: string): Promise<HttpResponseInit> {
  try {
    // Validate HTTP method
    if (!request.method || request.method.toUpperCase() !== 'POST') {
      logger.error('Invalid HTTP method', new Error(`Method ${request.method} not allowed`));
      return {
        status: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Parse request body (support .json() or .body shapes, and multipart form data)
    let formData: any;
    const uploadedFiles: { [key: string]: { fileName: string; contentType: string; base64: string } } = {};

    try {
      const contentType = ((request.headers as any)?.get?.('content-type') || (request.headers as any)?.['content-type'] || '').toString().toLowerCase();
      
      if (contentType.includes('multipart/form-data')) {
        // Handle multipart form data with file uploads
        logger.debug('Parsing multipart form data');
        const boundary = contentType.match(/boundary=([^;]+)/)?.[1];
        
        if (!boundary) {
          throw new Error('Invalid multipart form data: missing boundary');
        }

        let bodyText = '';
        if (typeof request.body === 'string') {
          bodyText = request.body;
        } else if (request.body instanceof ArrayBuffer || (request.body && typeof request.body === 'object' && 'toString' in request.body)) {
          bodyText = Buffer.from(request.body as any).toString('utf-8');
        } else {
          bodyText = String(request.body || '');
        }

        const parts = bodyText.split(`--${boundary}`);
        
        for (const part of parts) {
          if (!part.trim() || part === '--\r\n' || part === '--') continue;
          
          const [headerSection, ...contentParts] = part.split('\r\n\r\n');
          const contentSection = contentParts.join('\r\n\r\n').replace(/\r\n$/, '');
          
          const nameMatch = headerSection.match(/name="([^"]+)"/);
          const filenameMatch = headerSection.match(/filename="([^"]+)"/);
          const contentTypeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/);
          
          if (nameMatch && nameMatch[1]) {
            const fieldName = nameMatch[1];
            
            if (filenameMatch && filenameMatch[1]) {
              // This is a file upload
              const fileName = filenameMatch[1];
              const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
              const base64Content = Buffer.from(contentSection, 'binary').toString('base64');
              
              uploadedFiles[fieldName] = {
                fileName,
                contentType: mimeType,
                base64: base64Content
              };
              logger.debug('Parsed file upload', { fieldName, fileName, contentType: mimeType });
            } else if (fieldName === 'data') {
              // This is the JSON data field
              try {
                formData = JSON.parse(contentSection.trim());
              } catch (e: any) {
                logger.error('Failed to parse JSON data field', e);
                formData = {};
              }
            } else {
              // Regular form field
              if (!formData) formData = {};
              formData[fieldName] = contentSection.trim();
            }
          }
        }
        
        if (!formData) formData = {};
        logger.debug('Multipart form data parsed', { formDataKeys: Object.keys(formData || {}), uploadedFiles: Object.keys(uploadedFiles) });
      } else {
        // Handle JSON content type
        if (request && typeof request.json === 'function') {
          formData = await request.json();
        } else if (request && typeof request.body !== 'undefined') {
          formData = request.body;
        } else {
          formData = {};
        }
        logger.debug('Request body parsed', { formDataKeys: Object.keys(formData || {}) });
      }
    } catch (error: any) {
      logger.error('Invalid request body', error);
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body' }),
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

    // Check if FormCode__c is provided - if so, this is an update request
    const formCode = formData.FormCode__c || formData.formCode;
    if (formCode) {
      logger.info('FormCode__c detected - treating as update request', { formCode });
      
      // Resolve the form ID from the form code
      let resolvedFormId: string;
      try {
        const existingForm = await salesforceService.getFormByCode(formCode);
        resolvedFormId = existingForm.Id;
        logger.info('Existing form found for update', { formId: resolvedFormId, formCode });
      } catch (error: any) {
        if (error.message?.includes('Form not found')) {
          logger.error('Form not found for update', error);
          return {
            status: 404,
            body: JSON.stringify({ error: `Form not found with code: ${formCode}` }),
            headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
          };
        }
        throw error;
      }

      // Extract form field updates, attachments, and notes
      const updateFields = { ...formData };
      delete updateFields.FormCode__c;
      delete updateFields.formCode;
      delete updateFields.RecordType; // Can't change RecordType on update
      const attachments = updateFields.Attachments || updateFields.attachments;
      const notes = updateFields.Notes || updateFields.notes;
      delete updateFields.Attachments;
      delete updateFields.attachments;
      delete updateFields.Notes;
      delete updateFields.notes;

      // Update form in Salesforce
      logger.info('Updating form in Salesforce', { formId: resolvedFormId, fieldCount: Object.keys(updateFields).length });
      await salesforceService.updateForm(resolvedFormId, updateFields, requestId);
      logger.info('Form updated successfully', { formId: resolvedFormId });

      // Handle both explicit attachments array and uploaded files
      const allAttachments: Array<{ fileName: string; contentType?: string; base64: string }> = [];
      
      if (Array.isArray(attachments)) {
        allAttachments.push(...attachments);
      }
      
      // Add uploaded files as attachments
      Object.entries(uploadedFiles).forEach(([fieldName, fileData]) => {
        allAttachments.push(fileData);
        logger.debug('Adding uploaded file as attachment', { fieldName, fileName: fileData.fileName });
      });
      
      // Handle attachments if provided
      if (allAttachments.length > 0) {
        logger.info('Creating attachments', { count: allAttachments.length });
        await salesforceService.createAttachments(resolvedFormId, allAttachments);
        logger.info('Attachments created successfully');
      }

      // Handle notes if provided
      if (Array.isArray(notes) && notes.length > 0) {
        logger.info('Creating notes', { count: notes.length });
        await salesforceService.createNotes(resolvedFormId, notes);
        logger.info('Notes created successfully');
      }

      // Return success response for update
      return {
        status: 200,
        body: JSON.stringify({ 
          id: resolvedFormId, 
          message: 'Form updated successfully',
          attachmentsCreated: allAttachments.length,
          notesCreated: Array.isArray(notes) ? notes.length : 0
        }),
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      };
    }

    // No FormCode__c provided - create new form
    logger.info('Creating new form in Salesforce', { recordType: formData.RecordType });
    const createResult: any = await salesforceService.createForm(formData, requestId);
    const formId = typeof createResult === 'string' ? createResult : createResult.id;
    const generatedFormCode = (typeof createResult === 'string' ? undefined : createResult.formCode) || undefined;
    logger.info('Form created successfully', { formId, formCode: generatedFormCode });

    // Handle uploaded files as attachments
    if (Object.keys(uploadedFiles).length > 0) {
      const allAttachments: Array<{ fileName: string; contentType?: string; base64: string }> = [];
      
      Object.entries(uploadedFiles).forEach(([fieldName, fileData]) => {
        allAttachments.push(fileData);
        logger.debug('Adding uploaded file as attachment', { fieldName, fileName: fileData.fileName });
      });
      
      if (allAttachments.length > 0) {
        logger.info('Creating attachments for new form', { count: allAttachments.length });
        await salesforceService.createAttachments(formId, allAttachments);
        logger.info('Attachments created successfully');
      }
    }

    // Return success response (include generated form code when available)
    const headers: any = { 'Content-Type': 'application/json', 'X-Request-Id': requestId };
    if (generatedFormCode) headers['X-Form-Code'] = generatedFormCode;

    return {
      status: 201,
      body: JSON.stringify({ id: formId, formCode: generatedFormCode }),
      headers,
    }; 
  } catch (error: any) {
    logger.error('Error in POST handler', error, { errorMessage: error?.message });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.message?.includes('RecordType not found')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message?.includes('Salesforce error')) {
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

async function getFormHandler(request: HttpRequest, context: InvocationContext, logger: Logger, requestId: string): Promise<HttpResponseInit> {
  try {
    // Get form code from query parameter (support 'code' or legacy 'name')
    const formCode = request.query.get('code') || request.query.get('name');

    if (!formCode) {
      logger.error('Missing form code parameter', new Error('code query parameter is required'));
      return {
        status: 400,
        body: JSON.stringify({ error: 'Missing required query parameter: code' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Get optional fields parameter (comma-separated or JSON array)
    const fieldsParam = request.query.get('fields');
    let requestedFields: string[] | undefined;

    if (fieldsParam) {
      try {
        // Try to parse as JSON array first
        if (fieldsParam.startsWith('[')) {
          requestedFields = JSON.parse(fieldsParam) as string[];
        } else {
          // Parse as comma-separated values
          requestedFields = fieldsParam.split(',').map((f: string) => f.trim()).filter((f: string) => f.length > 0);
        }
        logger.debug('Parsed requested fields', { fieldCount: (requestedFields ?? []).length, fields: requestedFields });
      } catch (error: any) {
        logger.error('Invalid fields parameter format', error);
        return {
          status: 400,
          body: JSON.stringify({ error: 'Invalid fields parameter: must be comma-separated values or JSON array' }),
          headers: { 'Content-Type': 'application/json' },
        };
      }
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

    // Retrieve form by code with optional dynamic fields
    logger.info('Retrieving form by code', { formCode, fieldsRequested: requestedFields ? requestedFields.length : 'default' });
    const formData = await salesforceService.getFormByCode(formCode, requestedFields);
    logger.info('Form retrieved successfully', { formId: formData.Id });

    // Return success response
    return {
      status: 200,
      body: JSON.stringify(formData),
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
    };
  } catch (error: any) {
    logger.error('Error retrieving form', error, { errorMessage: error?.message });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.message?.includes('Form not found')) {
      statusCode = 404;
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

app.http('createForm', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'form',
  handler: createFormHandler
});

export default createFormHandler;
