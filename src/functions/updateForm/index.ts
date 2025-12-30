import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SalesforceService } from '../../services/salesforceService';
import { Logger } from '../../services/logger';
import { EmailTemplate } from '../../services/emailService';

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

    // Extract email controls
    let sendEmail = false;
    let emailTemplates: any = {};

    if (updateData && updateData.__sendEmail === true) {
      sendEmail = true;
      delete updateData.__sendEmail;
      logger.debug('Email flag detected - will send confirmation email');
    }

    if (updateData && updateData.__emailTemplates) {
      emailTemplates = updateData.__emailTemplates;
      delete updateData.__emailTemplates;
    }

    // Determine which copy template is provided (applicationCopy, waiverCopy, etc)
    let copyTemplateKey: string | undefined;
    if (sendEmail) {
      // Allow form-specific templates (e.g., waiverCopy, applicationCopy)
      copyTemplateKey = Object.keys(emailTemplates).find(k => 
        k.endsWith('Copy') || k === 'applicationCopy' || k === 'waiverCopy'
      );
      const hasCopyTemplate = copyTemplateKey && emailTemplates[copyTemplateKey] && 
        emailTemplates[copyTemplateKey].subject && 
        emailTemplates[copyTemplateKey].text && 
        emailTemplates[copyTemplateKey].html;
      const hasEventTemplate = emailTemplates.eventRegistration ? (emailTemplates.eventRegistration.subject && emailTemplates.eventRegistration.text && emailTemplates.eventRegistration.html) : false;
      if (!hasCopyTemplate && !hasEventTemplate) {
        return {
          status: 400,
          body: JSON.stringify({ error: 'Missing email template for submission confirmation' }),
          headers: { 'Content-Type': 'application/json' },
        };
      }
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
    let formFields: any = { ...updateData };
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

    // Attempt to email a copy of the application to the applicant (do not block update on failure)
    if (!sendEmail) {
      logger.debug('Email flag not set; skipping application copy email (update)');
    } else {
      try {
        // Always fetch the full record from Salesforce to populate email template variables
        let savedRecord: any = null;
        if (formCode) {
          try {
            logger.debug('Fetching full record from Salesforce for email (by code)', { formCode });
            savedRecord = await salesforceService.getFormByCode(formCode);
          } catch (err) {
            logger.debug('Failed to fetch record by code', { error: (err && (err as any).message) || err });
          }
        } else if (resolvedFormId && typeof (salesforceService as any).getFormById === 'function') {
          try {
            logger.debug('Fetching full record from Salesforce for email (by id)', { formId: resolvedFormId });
            savedRecord = await (salesforceService as any).getFormById(resolvedFormId);
          } catch (err) {
            logger.debug('Failed to fetch record by id', { error: (err && (err as any).message) || err });
          }
        }

        // Merge the saved record with any fields from the request to get complete data for email
        const emailData = { ...(savedRecord || {}), ...(formFields || {}) };
        let applicantEmail = emailData?.Email__c || emailData?.email;
        let applicantName = [emailData?.FirstName__c, emailData?.LastName__c].filter(Boolean).join(' ').trim();

        if (applicantEmail) {
          logger.info('Dispatching application copy email (update)', { to: applicantEmail, applicantName, formId: resolvedFormId });
          const { EmailService } = await import('../../services/emailService');
          const emailService = new EmailService();
          const emailTemplate: EmailTemplate = copyTemplateKey ? emailTemplates[copyTemplateKey] : (emailTemplates.applicationCopy || emailTemplates.waiverCopy || emailTemplates.eventRegistration);

          if (!emailTemplate || !emailTemplate.subject || !emailTemplate.text || !emailTemplate.html) {
            return {
              status: 400,
              body: JSON.stringify({ error: 'Missing email template for submission confirmation' }),
              headers: { 'Content-Type': 'application/json' },
            };
          }

          const orgName = 'our organization';
          const code = emailData?.FormCode__c || emailData?.formCode || formCode;
          const variables = {
            ...emailData,
            // Map Salesforce field names to template-friendly names
            FirstName: emailData?.FirstName__c || emailData?.FirstName || '',
            LastName: emailData?.LastName__c || emailData?.LastName || '',
            Email: emailData?.Email__c || emailData?.Email || '',
            Phone: emailData?.Phone__c || emailData?.Phone || '',
            orgName,
            FormCode__c: code || '',
            codeText: code ? `: ${code}` : '',
            codeHtml: code ? `: <strong>${code}</strong>` : ''
          };

          await emailService.sendEmail(applicantEmail, emailTemplate, variables);
          try { (global as any).__LAST_APPLICATION_COPY_SENT__ = { to: applicantEmail, name: applicantName, formData: emailData }; } catch(e) {}
          logger.info('Application copy email dispatched (update)', { to: applicantEmail });
        } else {
          logger.debug('No applicant email present; skipping application copy email (update)');
        }
      } catch (e: any) {
        logger.error('Failed to send application copy email (update)', e, { errorMessage: e?.message });
      }
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
