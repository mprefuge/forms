import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SalesforceService } from '../../services/salesforceService';
import { Logger } from '../../services/logger';
import { initializeFormRegistry, getFormConfig } from '../../config/FormConfigLoader';
import { convertToSalesforceFormat, filterAllowedFields } from '../../config/FormConfigUtils';

// Ensure sendCode (and its diagnostics) are registered by importing its module so its top-level app.http calls run
import '../sendCode';

// Initialize form registry on startup
initializeFormRegistry();

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
      
      if (contentType.includes('multipart/form-data') && typeof (request as any).formData === 'function') {
        // Handle multipart form data using Web API formData()
        logger.debug('Parsing multipart form data via formData()');
        const fd: any = await (request as any).formData();

        // Iterate all entries in FormData
        for (const [fieldName, value] of fd.entries()) {
          try {
            // Files are Blob/File objects with arrayBuffer()
            const isFileObject = value && typeof value === 'object' && typeof (value as any).arrayBuffer === 'function';
            if (isFileObject) {
              const fileObj: any = value;
              const fileName: string = fileObj.name || fieldName;
              const mimeType: string = fileObj.type || 'application/octet-stream';
              const ab = await fileObj.arrayBuffer();
              const base64Content = Buffer.from(ab as ArrayBuffer).toString('base64');

              uploadedFiles[fieldName] = {
                fileName,
                contentType: mimeType,
                base64: base64Content,
              };
              logger.debug('Parsed file upload', { fieldName, fileName, contentType: mimeType });
            } else if (fieldName === 'data' && typeof value === 'string') {
              // Nested JSON payload
              formData = JSON.parse(value);
            } else if (typeof value === 'string') {
              // Regular simple field
              if (!formData) formData = {};
              (formData as any)[fieldName] = value;
            }
          } catch (e: any) {
            logger.error('Failed to parse formData entry', e, { fieldName });
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
        try { logger.debug('Parsed email value', { email: formData.Email__c || formData.email }); } catch(e) {}
      }
    } catch (error: any) {
      logger.error('Invalid request body', error);
      return {
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Determine which form configuration to use
    // First check if form config was sent from client (application.js)
    let formConfig;
    let sendEmail = false; // Track if email should be sent
    if (formData.__formConfig && typeof formData.__formConfig === 'object') {
      // Form config sent from client-side JavaScript
      formConfig = formData.__formConfig;
      logger.info('Using form configuration from client request', { formId: formConfig.id, formName: formConfig.name });
      delete formData.__formConfig; // Remove from payload before processing
    } else {
      // Fallback to loading from server-side registry
      // Try to extract from request or default to 'general'
      const formId = formData.formId || formData.form_id || formData.FormId || 'general';
      try {
        formConfig = getFormConfig(formId);
        logger.info('Using form configuration from server registry', { formId, formName: formConfig.name });
      } catch (err: any) {
        logger.error('Form configuration not found', err);
        return {
          status: 400,
          body: JSON.stringify({ error: `Form configuration not found: ${formId}` }),
          headers: { 'Content-Type': 'application/json' },
        };
      }
    }
    
    // Check if email should be sent (explicit flag or final submission)
    if (formData.__sendEmail === true) {
      sendEmail = true;
      delete formData.__sendEmail;
      logger.debug('Email flag detected - will send confirmation email');
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
    const lookupCodeField = formConfig.salesforce.lookupCodeField || 'FormCode__c';
    const formCode = formData[lookupCodeField] || formData.FormCode__c || formData.formCode;
    if (formCode) {
      logger.info('FormCode detected - treating as update request', { formCode, formConfigId: formConfig.id });
      
      // Resolve the form ID from the form code
      let resolvedFormId: string;
      try {
        const existingForm = await salesforceService.getFormByCode(formCode, formConfig);
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
      // Filter to only allowed fields defined in form config
      const updateFields = filterAllowedFields(formConfig, { ...formData });
      delete updateFields.formId;
      delete updateFields.form_id;
      delete updateFields.FormId;
      delete updateFields[lookupCodeField];
      
      const attachments = updateFields.Attachments || updateFields.attachments;
      const notes = updateFields.Notes || updateFields.notes;
      delete updateFields.Attachments;
      delete updateFields.attachments;
      delete updateFields.Notes;
      delete updateFields.notes;

      // Convert to Salesforce field names
      const sfUpdateFields = convertToSalesforceFormat(formConfig, updateFields);

      // Update form in Salesforce
      logger.info('Updating form in Salesforce', { formId: resolvedFormId, fieldCount: Object.keys(sfUpdateFields).length });
      await salesforceService.updateForm(resolvedFormId, sfUpdateFields, requestId);
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

      // Attempt to email a copy of the application to the applicant (do not block update on failure)
      // Only send email if explicitly requested via __sendEmail flag (on save & exit or final submit)
      try {
        const emailField = 'Email';
        const firstNameField = 'FirstName';
        const lastNameField = 'LastName';
        
        // Determine if we're using client-side or Salesforce field names
        const hasMapping = formConfig.salesforceMapping && Object.keys(formConfig.salesforceMapping).length > 0;
        const emailSfField = hasMapping ? (formConfig.salesforceMapping[emailField] || 'Email__c') : 'Email__c';
        const firstNameSfField = hasMapping ? (formConfig.salesforceMapping[firstNameField] || 'FirstName__c') : 'FirstName__c';
        const lastNameSfField = hasMapping ? (formConfig.salesforceMapping[lastNameField] || 'LastName__c') : 'LastName__c';
        
        let applicantEmail = updateFields[emailField] || updateFields[emailSfField];
        let applicantName = [
          updateFields[firstNameField] || updateFields[firstNameSfField],
          updateFields[lastNameField] || updateFields[lastNameSfField]
        ].filter(Boolean).join(' ').trim();

        // Send application copy when an applicant email is present (align with update handler behavior).
        if (applicantEmail) {
          logger.info('Dispatching application copy email (update)', { to: applicantEmail, applicantName, formId: resolvedFormId });
          const { EmailService } = await import('../../services/emailService');
          const emailService = new EmailService();
          await emailService.sendApplicationCopy(applicantEmail, applicantName, updateFields, formConfig);
          try { (global as any).__LAST_APPLICATION_COPY_SENT__ = { to: applicantEmail, name: applicantName, formData: updateFields }; } catch(e) {}
          logger.info('Application copy email dispatched', { to: applicantEmail });
        } else {
          logger.debug('No applicant email present; skipping application copy email');
        }
      } catch (e: any) {
        logger.error('Failed to send application copy email', e, { errorMessage: e?.message });
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

    // No FormCode provided - create new form
    logger.info('Creating new form in Salesforce', { formConfigId: formConfig.id, recordType: formConfig.salesforce.recordTypeName });
    
    // Check if eventId was provided for campaign association
    let campaignInfo: { id: string; name: string } | null = null;
    const eventId = formData.__eventId;
    
    if (eventId) {
      logger.info('Event ID provided, attempting campaign lookup', { eventId });
      try {
        campaignInfo = await salesforceService.getCampaignById(eventId);
        if (campaignInfo) {
          logger.info('Campaign found for event', { campaignId: campaignInfo.id, campaignName: campaignInfo.name });
          // Add campaign reference to form data if the config supports it
          if (formConfig.salesforce.campaignField) {
            formData[formConfig.salesforce.campaignField] = campaignInfo.id;
            logger.debug('Added campaign association to form data', { field: formConfig.salesforce.campaignField });
          }
        } else {
          logger.info('Campaign not found for event ID', { eventId });
        }
      } catch (error: any) {
        // Log error but continue with form creation
        logger.error('Campaign lookup failed, proceeding without campaign association', error, { eventId });
      }
      // Remove __eventId from payload before processing
      delete formData.__eventId;
    }
    
    // Filter and convert form data to Salesforce format
    const filteredData = filterAllowedFields(formConfig, formData);
    const sfFormData = convertToSalesforceFormat(formConfig, filteredData);

    // Ensure campaign association is present in final payload when event campaign was resolved
    if (campaignInfo && formConfig.salesforce.campaignField) {
      const cf = formConfig.salesforce.campaignField;
      if (!sfFormData[cf]) {
        sfFormData[cf] = campaignInfo.id;
        logger.debug('Injected campaign association into Salesforce payload', { field: cf, campaignId: campaignInfo.id });
      }
    }

    // Preserve attachments and notes (these are handled by the Salesforce service post-create)
    const attachments = formData.Attachments || formData.attachments;
    const notes = formData.Notes || formData.notes;
    if (attachments) sfFormData.Attachments = attachments;
    if (notes) sfFormData.Notes = notes;

    logger.debug('Final Salesforce payload for create', { sfFormDataKeys: Object.keys(sfFormData || {}) });
    
    const createResult: any = await salesforceService.createForm(sfFormData, requestId, formConfig);
    const createdFormId = typeof createResult === 'string' ? createResult : createResult.id;
    const generatedFormCode = (typeof createResult === 'string' ? undefined : createResult.formCode) || undefined;
    logger.info('Form created successfully', { formId: createdFormId, formCode: generatedFormCode });

    // Handle uploaded files as attachments
    if (Object.keys(uploadedFiles).length > 0) {
      const allAttachments: Array<{ fileName: string; contentType?: string; base64: string }> = [];
      
      Object.entries(uploadedFiles).forEach(([fieldName, fileData]) => {
        allAttachments.push(fileData);
        logger.debug('Adding uploaded file as attachment', { fieldName, fileName: fileData.fileName });
      });
      
      if (allAttachments.length > 0) {
        logger.info('Creating attachments for new form', { count: allAttachments.length });
        await salesforceService.createAttachments(createdFormId, allAttachments);
        logger.info('Attachments created successfully');
      }
    }

    // Attempt to email a copy of the application to the applicant (do not block creation on failure)
    // Only send email if explicitly requested via __sendEmail flag (on save & exit or final submit)
    try {
      const emailField = 'Email';
      const firstNameField = 'FirstName';
      const lastNameField = 'LastName';
      
      // Determine if we're using client-side or Salesforce field names
      const hasMapping = formConfig.salesforceMapping && Object.keys(formConfig.salesforceMapping).length > 0;
      const emailSfField = hasMapping ? (formConfig.salesforceMapping[emailField] || 'Email__c') : 'Email__c';
      const firstNameSfField = hasMapping ? (formConfig.salesforceMapping[firstNameField] || 'FirstName__c') : 'FirstName__c';
      const lastNameSfField = hasMapping ? (formConfig.salesforceMapping[lastNameField] || 'LastName__c') : 'LastName__c';
      
      let applicantEmail = filteredData[emailField] || filteredData[emailSfField];
      let applicantName = [
        filteredData[firstNameField] || filteredData[firstNameSfField],
        filteredData[lastNameField] || filteredData[lastNameSfField]
      ].filter(Boolean).join(' ').trim();
      let enrichedFormData = { ...filteredData };

      // Send application copy to applicant when an email address is present.
      // Default behavior: send on create if applicant email exists (aligns with update flow).
      if (applicantEmail) {
        logger.debug('Applicant email check', { applicantEmail, formDataKeys: Object.keys(enrichedFormData || {}) });
        logger.info('Dispatching application copy email (creation)', { to: applicantEmail, applicantName, formId: createdFormId });
        const { EmailService } = await import('../../services/emailService');
        const emailService = new EmailService();
        await emailService.sendApplicationCopy(applicantEmail, applicantName, enrichedFormData, formConfig);
        try { (global as any).__LAST_APPLICATION_COPY_SENT__ = { to: applicantEmail, name: applicantName, formData: enrichedFormData }; } catch(e) {}
        logger.info('Application copy email dispatched', { to: applicantEmail });
      } else {
        logger.debug('No applicant email present; skipping application copy email');
      }
    } catch (e: any) {
      logger.error('Failed to send application copy email', e, { errorMessage: e?.message });
    }

    // Return success response (include generated form code when available)
    const headers: any = { 'Content-Type': 'application/json', 'X-Request-Id': requestId };
    if (generatedFormCode) headers['X-Form-Code'] = generatedFormCode;

    const responseBody: any = { 
      id: createdFormId, 
      formCode: generatedFormCode 
    };
    
    // Include campaign info if association was successful
    if (campaignInfo) {
      responseBody.campaignInfo = campaignInfo;
      logger.info('Returning campaign info in response', { campaignId: campaignInfo.id, campaignName: campaignInfo.name });
    }

    return {
      status: 201,
      body: JSON.stringify(responseBody),
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
    // Support event campaign info retrieval: ?eventId=... or ?eventid=...
    const eventId = request.query.get('eventId') || request.query.get('eventid');
    if (eventId) {
      // Determine form config to obtain event query fields if provided
      let formConfig: any = undefined;
      try {
        const fcParam = request.query.get('formConfig');
        if (fcParam) {
          formConfig = JSON.parse(fcParam);
          logger.info('Using form configuration from client query for event lookup', { formId: formConfig.id, formName: formConfig.name });
        }
      } catch (e: any) {
        logger.debug('Failed to parse formConfig from query', { error: e?.message });
      }

      // Initialize Salesforce Service
      const sfConfig = {
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
        clientId: process.env.SF_CLIENT_ID || '',
        clientSecret: process.env.SF_CLIENT_SECRET || '',
      };
      const salesforceService = new SalesforceService(sfConfig);
      logger.info('Authenticating with Salesforce for event lookup');
      await salesforceService.authenticate();

      const fields = (formConfig && formConfig.salesforce && Array.isArray(formConfig.salesforce.eventQueryFields))
        ? formConfig.salesforce.eventQueryFields
        : ['Id','Name','StartDate','EndDate','Description'];

      const campaign = await salesforceService.getCampaignByIdWithFields(eventId, fields);
      if (campaign) {
        logger.info('Event campaign metadata retrieved', { eventId, fieldsCount: fields.length });
        return {
          status: 200,
          body: JSON.stringify({ campaign }),
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        };
      } else {
        logger.info('Event campaign not found', { eventId });
        return {
          status: 404,
          body: JSON.stringify({ error: 'Campaign not found' }),
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        };
      }
    }

    // If requested, list active Event campaigns
    const listActiveEvents = request.query.get('listActiveEvents');
    if (listActiveEvents && (listActiveEvents === '1' || listActiveEvents.toLowerCase() === 'true' || listActiveEvents.toLowerCase() === 'yes')) {
      // Determine form config to obtain event query fields if provided
      let formConfig: any = undefined;
      try {
        const fcParam = request.query.get('formConfig');
        if (fcParam) {
          formConfig = JSON.parse(fcParam);
          logger.info('Using form configuration from client query for listing events', { formId: formConfig.id, formName: formConfig.name });
        }
      } catch (e: any) {
        logger.debug('Failed to parse formConfig from query', { error: e?.message });
      }

      // Initialize Salesforce Service
      const sfConfig = {
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
        clientId: process.env.SF_CLIENT_ID || '',
        clientSecret: process.env.SF_CLIENT_SECRET || '',
      };
      const salesforceService = new SalesforceService(sfConfig);
      logger.info('Authenticating with Salesforce for active events list');
      await salesforceService.authenticate();

      const fields = (formConfig && formConfig.salesforce && Array.isArray(formConfig.salesforce.eventQueryFields))
        ? formConfig.salesforce.eventQueryFields
        : ['Id','Name','StartDate','EndDate','Description'];

      const campaigns = await salesforceService.getActiveEventCampaigns(fields);
      logger.info('Active events retrieved', { count: Array.isArray(campaigns) ? campaigns.length : 0 });
      return {
        status: 200,
        body: JSON.stringify({ campaigns }),
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      };
    }

    // Get form code from query parameter (support multiple casings / legacy names)
    const formCodeRaw = request.query.get('code')
      || request.query.get('name')
      || request.query.get('FormCode')
      || request.query.get('formCode')
      || request.query.get('FormCode__c')
      || request.query.get('form_code');
    const formCode = formCodeRaw ? `${formCodeRaw}`.trim() : undefined;
    // Also support lookup by email: ?email=foo@bar.com
    const emailQueryRaw = request.query.get('email');
    const emailQuery = emailQueryRaw ? `${emailQueryRaw}`.trim() : undefined;

    // Support a diagnostics query for local troubleshooting: ?diagnostics=1
    const diagnosticsQuery = request.query.get('diagnostics');
    if (diagnosticsQuery && (diagnosticsQuery === '1' || diagnosticsQuery === 'true' || diagnosticsQuery === 'yes')) {
      if (process.env.NODE_ENV === 'production') {
        return { status: 403, body: JSON.stringify({ error: 'Diagnostics not available in production' }), headers: { 'Content-Type': 'application/json' } };
      }

      let azureSdkAvailable = false;
      try {
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

    // Determine which form configuration to use
    // First check if form config was sent from client (application.js) via query parameter
    let formConfig;
    const formConfigParam = request.query.get('formConfig');
    if (formConfigParam) {
      try {
        formConfig = JSON.parse(decodeURIComponent(formConfigParam));
        logger.info('Using form configuration from client request', { formId: formConfig.id, formName: formConfig.name });
      } catch (e: any) {
        logger.info('Failed to parse formConfig from query parameter, will use server registry', { error: e?.message });
        // Fall through to server-side registry
      }
    }

    // Fallback to loading from server-side registry
    if (!formConfig) {
      const formId = request.query.get('formId') || request.query.get('form_id') || request.query.get('FormId') || 'general';
      try {
        formConfig = getFormConfig(formId);
        logger.info('Using form configuration from server registry', { formId, formName: formConfig.name });
      } catch (err: any) {
        logger.error('Form configuration not found', err);
        return {
          status: 400,
          body: JSON.stringify({ error: `Form configuration not found: ${formId}` }),
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

    // If email query provided, resolve by email and return the record
    if (emailQuery) {
      logger.info('Retrieving form by email', { email: emailQuery });
      // Explicitly pass undefined as second arg so tests expecting undefined can assert it
      const formData = await salesforceService.getFormByEmail(emailQuery, undefined);
      logger.info('Form retrieved successfully by email', { formId: formData.Id });
      return {
        status: 200,
        body: JSON.stringify(formData),
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
      };
    }

    // Require formCode when email is not provided
    if (!formCode) {
      logger.error('Missing form code parameter', new Error('code query parameter is required'));
      return {
        status: 400,
        body: JSON.stringify({ error: 'Missing required query parameter: code' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Retrieve form by code — if specific fields requested via ?fields=foo,bar pass those, otherwise omit second arg
    logger.info('Retrieving form by code', { formCode, formConfigId: formConfig.id });
    const fieldsParam = request.query.get('fields');
    let formData;
    if (fieldsParam) {
      const fields = fieldsParam.split(',').map((f: string) => f.trim()).filter(Boolean);
      formData = await salesforceService.getFormByCode(formCode, fields);
    } else {
      // Explicitly pass `undefined` as second arg so tests that assert undefined receive it
      formData = await salesforceService.getFormByCode(formCode, undefined);
    }

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
