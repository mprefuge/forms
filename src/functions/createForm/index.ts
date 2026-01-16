import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SalesforceService } from '../../services/salesforceService';
import { Logger } from '../../services/logger';
import { initializeFormRegistry, getFormConfig } from '../../config/FormConfigLoader';
import { convertToSalesforceFormat, filterAllowedFields } from '../../config/FormConfigUtils';
import { EmailTemplate } from '../../services/emailService';

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

    // Extract email templates supplied by the caller (front-end)
    const emailTemplates: any = formData.__emailTemplates || {};
    if (formData.__emailTemplates) delete formData.__emailTemplates;

      // Determine which copy template is provided (applicationCopy, waiverCopy, etc)
      let copyTemplateKey: string | undefined;
    if (sendEmail) {
      // Allow form-specific templates (e.g., waiverCopy, eventRegistration, applicationCopy)
      // Determine which copy template is provided by checking what exists
        copyTemplateKey = Object.keys(emailTemplates).find(k => 
        k.endsWith('Copy') || k === 'applicationCopy' || k === 'waiverCopy'
      );
        const hasCopyTemplate = copyTemplateKey && emailTemplates[copyTemplateKey] && 
        emailTemplates[copyTemplateKey].subject && 
        emailTemplates[copyTemplateKey].text && 
        emailTemplates[copyTemplateKey].html;
      
        const hasEventTemplate = emailTemplates.eventRegistration ? (emailTemplates.eventRegistration.subject && emailTemplates.eventRegistration.text && emailTemplates.eventRegistration.html) : false;
        if (!hasCopyTemplate && !hasEventTemplate) {
          return { status: 400, body: JSON.stringify({ error: 'Missing email template for submission confirmation' }), headers: { 'Content-Type': 'application/json' } };
      }
      // event template validated later when campaign info exists
    }

      const buildEmailVariables = (formPayload: any, campaignInfo?: any, formConfig?: any, generatedFormCode?: string) => {
        const orgName = (formConfig && formConfig.terms && formConfig.terms.orgName) || 'our organization';
        const rawCode = generatedFormCode || formPayload?.FormCode__c || formPayload?.formCode || formPayload?.FormCode;
        const code = rawCode ? String(rawCode).toUpperCase() : '';
        // Client timezone (IANA) if provided by the browser
        const userTimeZone = formPayload?.__clientTimeZone || formPayload?.clientTimeZone || undefined;
        const baseVars: any = {
          ...formPayload,
          ...(campaignInfo || {}),
          orgName,
          userTimeZone,
          // Common code-related variables
          FormCode__c: code || '',
          codeText: code ? `: ${code}` : '',
          codeHtml: code ? `: <strong>${code}</strong>` : '',
          confirmationCode: code ? ` Your confirmation code is: ${code}` : '',
          confirmationCodeHtml: code ? ` Your confirmation code is: <strong>${code}</strong>` : '',
          // Common name variables
          Name: (campaignInfo?.Name || campaignInfo?.name || ''),
          eventName: (campaignInfo?.Name || campaignInfo?.name || ''),
          attendeeName: (formPayload?.FirstName__c || formPayload?.FirstName || formPayload?.firstName || ''),
          // Map Salesforce field names to template-friendly names
          FirstName: formPayload?.FirstName__c || formPayload?.FirstName || '',
          LastName: formPayload?.LastName__c || formPayload?.LastName || '',
          Email: formPayload?.Email__c || formPayload?.Email || '',
          Phone: formPayload?.Phone__c || formPayload?.Phone || ''
        };

        if (campaignInfo) {
          const { EmailService } = require('../../services/emailService');
          const svc = new EmailService();
          const { googleUrl, icsDataUri } = svc.generateEventCalendarData({
            name: campaignInfo.Name || campaignInfo.name,
            startDate: campaignInfo.StartDate__c || campaignInfo.StartDate || campaignInfo.startDate,
            endDate: campaignInfo.EndDate__c || campaignInfo.EndDate || campaignInfo.endDate,
            startTime: campaignInfo.StartTime__c || campaignInfo.StartTime || campaignInfo.startTime,
            endTime: campaignInfo.EndTime__c || campaignInfo.EndTime || campaignInfo.endTime,
            description: campaignInfo.Description || campaignInfo.description,
            location: campaignInfo.Location__c || campaignInfo.Location || campaignInfo.location,
            orgName,
            userTimeZone
          });
          let eventDetailsText = '';
          const whenDate = campaignInfo.StartDate__c || campaignInfo.StartDate || campaignInfo.startDate;
          const whenTime = campaignInfo.StartTime__c || campaignInfo.StartTime || campaignInfo.startTime;
          const whereLoc = campaignInfo.Location__c || campaignInfo.Location || campaignInfo.location;
          const notes = campaignInfo.Description || campaignInfo.description;
          if (whenDate) eventDetailsText += `When: ${whenDate}${whenTime ? ' ' + whenTime : ''}\n`;
          if (whereLoc) eventDetailsText += `Where: ${whereLoc}\n`;
          if (notes) eventDetailsText += `Notes: ${notes}\n`;
          const htmlDetails: string[] = [];
          if (whenDate) htmlDetails.push(`<div><strong>When:</strong> ${whenDate}${whenTime ? ' ' + whenTime : ''}</div>`);
          if (whereLoc) htmlDetails.push(`<div><strong>Where:</strong> ${whereLoc}</div>`);
          if (notes) htmlDetails.push(`<div><strong>Notes:</strong><br/>${(notes || '').replace(/\n/g, '<br/>')}</div>`);
          baseVars.googleUrl = googleUrl;
          baseVars.icsDataUri = icsDataUri;
          baseVars.icsUrl = (svc.generateEventCalendarData({
            name: campaignInfo.Name || campaignInfo.name,
            startDate: campaignInfo.StartDate__c || campaignInfo.StartDate || campaignInfo.startDate,
            endDate: campaignInfo.EndDate__c || campaignInfo.EndDate || campaignInfo.endDate,
            startTime: campaignInfo.StartTime__c || campaignInfo.StartTime || campaignInfo.startTime,
            endTime: campaignInfo.EndTime__c || campaignInfo.EndTime || campaignInfo.endTime,
            description: campaignInfo.Description || campaignInfo.description,
            location: campaignInfo.Location__c || campaignInfo.Location || campaignInfo.location,
            orgName,
            userTimeZone
          }).icsUrl);
          baseVars.outlookUrl = (svc.generateEventCalendarData({
            name: campaignInfo.Name || campaignInfo.name,
            startDate: campaignInfo.StartDate__c || campaignInfo.StartDate || campaignInfo.startDate,
            endDate: campaignInfo.EndDate__c || campaignInfo.EndDate || campaignInfo.endDate,
            startTime: campaignInfo.StartTime__c || campaignInfo.StartTime || campaignInfo.startTime,
            endTime: campaignInfo.EndTime__c || campaignInfo.EndTime || campaignInfo.endTime,
            description: campaignInfo.Description || campaignInfo.description,
            location: campaignInfo.Location__c || campaignInfo.Location || campaignInfo.location,
            orgName,
            userTimeZone
          }).outlookUrl);
          baseVars.appleIcsUrl = baseVars.icsUrl;
          baseVars.eventDetails = eventDetailsText;
          baseVars.eventDetailsHtml = htmlDetails.join('');
        }
        return baseVars;
      };

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
        
        let applicantEmail = updateFields[emailField] || updateFields[emailSfField] || (formData && (formData[emailField] || formData[emailSfField]));
        let applicantName = [
          updateFields[firstNameField] || updateFields[firstNameSfField] || formData[firstNameField] || formData[firstNameSfField],
          updateFields[lastNameField] || updateFields[lastNameSfField] || formData[lastNameField] || formData[lastNameSfField]
        ].filter(Boolean).join(' ').trim();

        // Send application copy when an applicant email is present (align with update handler behavior).
        if (!sendEmail) {
          logger.debug('Email flag not set; skipping application copy email');
        } else {
          // Always fetch the complete record from Salesforce to populate all email template variables
          let savedRecord: any = null;
          try {
            logger.debug('Fetching full record from Salesforce for email', { formId: resolvedFormId });
            savedRecord = await salesforceService.getFormByCode(formCode, formConfig);
          } catch (err) {
            logger.debug('Failed to fetch full record for email', { error: (err && (err as any).message) || err });
          }

          // Merge saved record with update fields to get complete data
          const emailData = { ...(savedRecord || {}), ...(updateFields || {}) };
          applicantEmail = applicantEmail || emailData[emailField] || emailData[emailSfField];
          applicantName = applicantName || [
            emailData[firstNameField] || emailData[firstNameSfField],
            emailData[lastNameField] || emailData[lastNameSfField]
          ].filter(Boolean).join(' ').trim();

          if (applicantEmail) {
            const appTemplate = copyTemplateKey ? emailTemplates[copyTemplateKey] : (emailTemplates.applicationCopy || emailTemplates.waiverCopy || emailTemplates.eventRegistration);
            if (!appTemplate || !appTemplate.subject || !appTemplate.text || !appTemplate.html) {
              return { status: 400, body: JSON.stringify({ error: 'Missing email template for submission confirmation' }), headers: { 'Content-Type': 'application/json' } };
            }

            logger.info('Dispatching application copy email (update)', { to: applicantEmail, applicantName, formId: resolvedFormId });
            const { EmailService } = await import('../../services/emailService');
            const emailService = new EmailService();
            await emailService.sendApplicationCopy(applicantEmail, applicantName, emailData, formConfig, appTemplate);
            try { (global as any).__LAST_APPLICATION_COPY_SENT__ = { to: applicantEmail, name: applicantName, formData: emailData }; } catch(e) {}
            logger.info('Application copy email dispatched', { to: applicantEmail });
          } else {
            logger.debug('No applicant email present; skipping application copy email');
          }
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
    let campaignInfo: any | null = null;
    const eventId = formData.__eventId;

    if (eventId) {
      logger.info('Event ID provided, attempting campaign lookup', { eventId });
      try {
        const fields = (formConfig && formConfig.salesforce && Array.isArray(formConfig.salesforce.eventQueryFields))
          ? formConfig.salesforce.eventQueryFields
          : ['Id','Name','StartDate','EndDate','Description','Location__c','StartTime__c','EndTime__c'];
        const rawCampaign: any = await salesforceService.getCampaignByIdWithFields(eventId, fields);
        if (rawCampaign) {
          campaignInfo = { ...rawCampaign, id: rawCampaign.Id || rawCampaign.id, name: rawCampaign.Name || rawCampaign.name };
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

    // Merge client-provided selected event metadata, if any, to enrich campaignInfo for emails
    if (formData.__selectedEvent && typeof formData.__selectedEvent === 'object') {
      try {
        const sel = formData.__selectedEvent as any;
        const norm: any = {
          Name: sel.Name || sel.name,
          name: sel.name || sel.Name,
          StartDate: sel.StartDate || sel.startDate,
          EndDate: sel.EndDate || sel.endDate,
          StartTime__c: sel.StartTime__c || sel.startTime,
          EndTime__c: sel.EndTime__c || sel.endTime,
          Description: sel.Description || sel.description,
          Location__c: sel.Location__c || sel.Location || sel.location || sel.Venue__c || sel.City__c || sel.City,
          startDate: sel.startDate || sel.StartDate,
          endDate: sel.endDate || sel.EndDate,
          startTime: sel.startTime || sel.StartTime__c,
          endTime: sel.endTime || sel.EndTime__c,
          description: sel.description || sel.Description,
          location: sel.location || sel.Location__c || sel.Location || sel.Venue__c || sel.City__c || sel.City,
        };
        campaignInfo = { ...(campaignInfo || {}), ...norm };
      } catch {}
      delete formData.__selectedEvent;
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

    // Attempt to find and link existing Contact to the form (skip if configured)
    try {
      // Skip contact creation if configured to do so (e.g., for waiver forms)
      if (formConfig.salesforce.skipContactCreation === true) {
        logger.info('Skipping contact creation per form configuration', { formId: formConfig.id, formName: formConfig.name });
      } else {
        const contactMatchCriteria: any = {};
      
        // Extract fields for contact matching (support both client and Salesforce field names)
        const firstNameField = 'FirstName';
        const lastNameField = 'LastName';
        const emailField = 'Email';
        const phoneField = 'Phone';
        const secondaryEmailField = 'Secondary_Email';
      
        const hasMapping = formConfig.salesforceMapping && Object.keys(formConfig.salesforceMapping).length > 0;
        const firstNameSfField = hasMapping ? (formConfig.salesforceMapping[firstNameField] || 'FirstName__c') : 'FirstName__c';
        const lastNameSfField = hasMapping ? (formConfig.salesforceMapping[lastNameField] || 'LastName__c') : 'LastName__c';
        const emailSfField = hasMapping ? (formConfig.salesforceMapping[emailField] || 'Email__c') : 'Email__c';
        const phoneSfField = hasMapping ? (formConfig.salesforceMapping[phoneField] || 'Phone__c') : 'Phone__c';
        const secondaryEmailSfField = hasMapping ? (formConfig.salesforceMapping[secondaryEmailField] || 'Secondary_Email__c') : 'Secondary_Email__c';

        // Gather contact matching criteria from form data
        contactMatchCriteria.firstName = filteredData[firstNameField] || filteredData[firstNameSfField] || formData[firstNameField] || formData[firstNameSfField];
        contactMatchCriteria.lastName = filteredData[lastNameField] || filteredData[lastNameSfField] || formData[lastNameField] || formData[lastNameSfField];
        contactMatchCriteria.email = filteredData[emailField] || filteredData[emailSfField] || formData[emailField] || formData[emailSfField];
        contactMatchCriteria.phone = filteredData[phoneField] || filteredData[phoneSfField] || formData[phoneField] || formData[phoneSfField];
        contactMatchCriteria.secondaryEmail = filteredData[secondaryEmailField] || filteredData[secondaryEmailSfField] || formData[secondaryEmailField] || formData[secondaryEmailSfField];

        logger.debug('Contact match criteria extracted', { 
        hasFirstName: !!contactMatchCriteria.firstName,
        hasLastName: !!contactMatchCriteria.lastName,
        hasEmail: !!contactMatchCriteria.email,
        hasPhone: !!contactMatchCriteria.phone,
        hasSecondaryEmail: !!contactMatchCriteria.secondaryEmail
      });

      // Attempt contact matching if we have at least one criterion
      const hasAnyCriteria = contactMatchCriteria.email || contactMatchCriteria.phone || 
                           contactMatchCriteria.secondaryEmail || 
                           (contactMatchCriteria.firstName && contactMatchCriteria.lastName);
      
      if (hasAnyCriteria) {
        let contactId: string | null = null;
        
        // First, try to find existing contact
        const contactMatch = await salesforceService.findContact(contactMatchCriteria, 70); // 70% confidence threshold
        
        if (contactMatch) {
          logger.info('Matching Contact found with high confidence', { 
            contactId: contactMatch.contactId, 
            contactName: contactMatch.contactName,
            confidenceScore: contactMatch.confidenceScore,
            matchedFields: contactMatch.matchedFields
          });
          contactId = contactMatch.contactId;
        } else {
          // No match found - create new contact if we have email
          if (contactMatchCriteria.email) {
            logger.info('No matching Contact found - creating new contact', { email: contactMatchCriteria.email });
            try {
              // Extract address fields if present
              const streetField = 'Street';
              const cityField = 'City';
              const stateField = 'State';
              const zipField = 'Zip';
              
              const streetSfField = hasMapping ? (formConfig.salesforceMapping[streetField] || 'Street__c') : 'Street__c';
              const citySfField = hasMapping ? (formConfig.salesforceMapping[cityField] || 'City__c') : 'City__c';
              const stateSfField = hasMapping ? (formConfig.salesforceMapping[stateField] || 'State__c') : 'State__c';
              const zipSfField = hasMapping ? (formConfig.salesforceMapping[zipField] || 'Zip__c') : 'Zip__c';
              
              const street = filteredData[streetField] || filteredData[streetSfField] || formData[streetField] || formData[streetSfField];
              const city = filteredData[cityField] || filteredData[citySfField] || formData[cityField] || formData[citySfField];
              const state = filteredData[stateField] || filteredData[stateSfField] || formData[stateField] || formData[stateSfField];
              const zip = filteredData[zipField] || filteredData[zipSfField] || formData[zipField] || formData[zipSfField];
              
              contactId = await salesforceService.createContact({
                firstName: contactMatchCriteria.firstName,
                lastName: contactMatchCriteria.lastName,
                email: contactMatchCriteria.email,
                phone: contactMatchCriteria.phone,
                secondaryEmail: contactMatchCriteria.secondaryEmail,
                street: street,
                city: city,
                state: state,
                zip: zip
              });
              logger.info('New Contact created successfully', { contactId });
            } catch (createError: any) {
              logger.error('Failed to create new Contact', createError, { errorMessage: createError?.message });
            }
          } else {
            logger.debug('No high-confidence Contact match found and no email to create new contact', { formId: createdFormId });
          }
        }
        
        // Link the Contact to the Form as Person__c if we have a contactId
        if (contactId) {
          try {
            // Check if the form config supports Person field linking
            const personField = 'Person__c';
            const personSfField = hasMapping ? (formConfig.salesforceMapping[personField] || 'Person__c') : 'Person__c';
            
            logger.debug('Attempting to link Contact to Form', { 
              formId: createdFormId, 
              contactId: contactId, 
              personField: personSfField,
              formConfigId: formConfig.id
            });
            
            // Update the form with the Person__c field
            await salesforceService.updateForm(createdFormId, { [personSfField]: contactId }, requestId, formConfig);
            logger.info('Form linked to Contact', { formId: createdFormId, contactId: contactId, personField: personSfField });
          } catch (linkError: any) {
            // Log the error but don't fail the form creation
            logger.error('Failed to link Contact to Form', linkError, { 
              formId: createdFormId, 
              contactId: contactId, 
              personField: 'Person__c',
              errorMessage: linkError?.message 
            });
          }
          
          // Create Campaign Member if this is an event registration
          if (contactId && campaignInfo && campaignInfo.id) {
            try {
              logger.info('Creating Campaign Member for event registration', { 
                campaignId: campaignInfo.id, 
                contactId: contactId,
                campaignName: campaignInfo.name || campaignInfo.Name
              });
              
              const campaignMemberId = await salesforceService.createCampaignMember(campaignInfo.id, contactId, 'Registered');
              logger.info('Campaign Member created successfully', { 
                campaignMemberId, 
                campaignId: campaignInfo.id, 
                contactId: contactId 
              });
            } catch (campaignMemberError: any) {
              // Log but don't fail - the form and contact are already created
              logger.error('Failed to create Campaign Member', campaignMemberError, { 
                campaignId: campaignInfo.id, 
                contactId: contactId,
                errorMessage: campaignMemberError?.message 
              });
            }
          }
        }
      } else {
        logger.debug('Insufficient data for contact matching', { formId: createdFormId });
      }
      } // End of skipContactCreation else block
    } catch (contactMatchError: any) {
      // Log but don't fail the form creation
      logger.error('Contact matching failed', contactMatchError, { formId: createdFormId, errorMessage: contactMatchError?.message });
    }

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
      
      let applicantEmail = filteredData[emailField] || filteredData[emailSfField] || formData[emailField] || formData[emailSfField];
      let applicantName = [
        filteredData[firstNameField] || filteredData[firstNameSfField] || formData[firstNameField] || formData[firstNameSfField],
        filteredData[lastNameField] || filteredData[lastNameSfField] || formData[lastNameField] || formData[lastNameSfField]
      ].filter(Boolean).join(' ').trim();
      let enrichedFormData = { ...filteredData, ...formData };

      // Debug info: whether we have an applicant email and whether campaign info was resolved
      logger.debug('Applicant email check (creation)', { applicantEmail, campaignInfoPresent: !!campaignInfo, campaignInfo, formDataKeys: Object.keys(enrichedFormData || {}) });

      // Send application copy to applicant when an email address is present.
      // Default behavior: send on create if applicant email exists (aligns with update flow).
      if (!sendEmail) {
        logger.debug('Email flag not set; skipping application email on create');
      } else if (applicantEmail) {
        const { EmailService } = await import('../../services/emailService');
        const emailService = new EmailService();

        if (campaignInfo) {
          const selectedTemplate = emailTemplates.eventRegistration || (copyTemplateKey ? emailTemplates[copyTemplateKey] : undefined);
          if (!selectedTemplate || !selectedTemplate.subject || !selectedTemplate.text || !selectedTemplate.html) {
            return { status: 400, body: JSON.stringify({ error: 'Missing email template for submission confirmation' }), headers: { 'Content-Type': 'application/json' } };
          }

          const variables = buildEmailVariables(enrichedFormData, campaignInfo, formConfig, generatedFormCode);
          logger.info('Dispatching event registration email (creation)', { to: applicantEmail, applicantName, formId: createdFormId, campaign: campaignInfo });
          try {
            await emailService.sendEmail(applicantEmail, selectedTemplate, variables);
            try { (global as any).__LAST_EVENT_CONFIRMATION_SENT__ = { to: applicantEmail, name: applicantName, campaign: campaignInfo }; } catch (e) {}
            logger.info('Event confirmation email dispatched', { to: applicantEmail });
          } catch (e: any) {
            logger.error('Failed to send event confirmation email', e, { errorMessage: e?.message });
          }
        } else {
          const selectedTemplate = copyTemplateKey ? emailTemplates[copyTemplateKey] : (emailTemplates.applicationCopy || emailTemplates.waiverCopy || emailTemplates.eventRegistration);
          if (!selectedTemplate || !selectedTemplate.subject || !selectedTemplate.text || !selectedTemplate.html) {
            return { status: 400, body: JSON.stringify({ error: 'Missing email template for submission confirmation' }), headers: { 'Content-Type': 'application/json' } };
          }

          const variables = buildEmailVariables(enrichedFormData, undefined, formConfig, generatedFormCode);
          logger.info('Dispatching submission email (creation)', { to: applicantEmail, applicantName, formId: createdFormId });
          try {
            await emailService.sendEmail(applicantEmail, selectedTemplate, variables);
            try { (global as any).__LAST_APPLICATION_COPY_SENT__ = { to: applicantEmail, name: applicantName, formData: enrichedFormData }; } catch(e) {}
            logger.info('Submission email dispatched', { to: applicantEmail });
          } catch (e: any) {
            logger.error('Failed to send submission email', e, { errorMessage: e?.message });
          }
        }

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
    // Support downloading ContentVersion/Attachment binary via proxy: ?downloadContentVersion=ID or ?downloadAttachment=ID
    const downloadContentVersion = request.query.get('downloadContentVersion');
    const downloadAttachment = request.query.get('downloadAttachment');

    if (downloadContentVersion || downloadAttachment) {
      logger.info('File download request', { downloadContentVersion, downloadAttachment });
      
      // Initialize Salesforce Service and authenticate
      const sfConfig = {
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
        clientId: process.env.SF_CLIENT_ID || '',
        clientSecret: process.env.SF_CLIENT_SECRET || '',
      };
      const salesforceService = new SalesforceService(sfConfig);
      logger.info('Authenticating with Salesforce to proxy file download');
      await salesforceService.authenticate();

      if (downloadContentVersion) {
        logger.info('Downloading ContentVersion', { downloadContentVersion });
        const v = await salesforceService.downloadContentVersionBinary(downloadContentVersion);
        if (!v) {
          logger.error('ContentVersion download returned null', { downloadContentVersion });
          return { status: 404, body: 'Not found', headers: { 'Content-Type': 'text/plain' } };
        }
        logger.info('ContentVersion download successful', { downloadContentVersion, size: v.data.length });
        return { status: 200, body: v.data, headers: { 'Content-Type': v.contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${(v.fileName || downloadContentVersion).replace(/"/g, '')}"` } } as any;
      }

      if (downloadAttachment) {
        logger.info('Downloading Attachment', { downloadAttachment });
        const a = await salesforceService.downloadAttachmentBinary(downloadAttachment);
        if (!a) {
          logger.error('Attachment download returned null', { downloadAttachment });
          return { status: 404, body: 'Not found', headers: { 'Content-Type': 'text/plain' } };
        }
        logger.info('Attachment download successful', { downloadAttachment, size: a.data.length });
        return { status: 200, body: a.data, headers: { 'Content-Type': a.contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${(a.fileName || downloadAttachment).replace(/"/g, '')}"` } } as any;
      }
    }

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
