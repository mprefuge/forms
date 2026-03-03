import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SalesforceService } from '../../services/salesforceService';
import { Logger } from '../../services/logger';
import { EmailTemplate } from '../../services/emailService';
import { resolveRequestObject, resolveRequestId } from '../shared/requestUtils';
import { buildSalesforceConfig } from '../shared/salesforceUtils';
import { mapCommonHandlerError } from '../shared/errorUtils';

async function parseUpdateData(request: HttpRequest, logger: Logger): Promise<{ ok: true; data: any } | { ok: false; response: HttpResponseInit }> {
  try {
    let updateData: any;
    if (request && typeof request.json === 'function') {
      updateData = await request.json();
    } else if (request && typeof request.body !== 'undefined') {
      updateData = request.body;
    } else {
      updateData = {};
    }
    logger.debug('Request body parsed', { updateDataKeys: Object.keys(updateData || {}) });
    return { ok: true, data: updateData };
  } catch (error: any) {
    logger.error('Invalid JSON in request body', error);
    return {
      ok: false,
      response: {
        status: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        headers: { 'Content-Type': 'application/json' },
      },
    };
  }
}

function extractEmailControls(updateData: any, logger: Logger): { sendEmail: boolean; emailTemplates: any } {
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

  return { sendEmail, emailTemplates };
}

function validateEmailTemplates(sendEmail: boolean, emailTemplates: any): { ok: true; copyTemplateKey?: string } | { ok: false; response: HttpResponseInit } {
  let copyTemplateKey: string | undefined;

  if (sendEmail) {
    copyTemplateKey = Object.keys(emailTemplates).find(
      k => k.endsWith('Copy') || k === 'applicationCopy' || k === 'waiverCopy'
    );
    const hasCopyTemplate =
      copyTemplateKey &&
      emailTemplates[copyTemplateKey] &&
      emailTemplates[copyTemplateKey].subject &&
      emailTemplates[copyTemplateKey].text &&
      emailTemplates[copyTemplateKey].html;
    const hasEventTemplate = emailTemplates.eventRegistration
      ? emailTemplates.eventRegistration.subject &&
        emailTemplates.eventRegistration.text &&
        emailTemplates.eventRegistration.html
      : false;
    if (!hasCopyTemplate && !hasEventTemplate) {
      return {
        ok: false,
        response: {
          status: 400,
          body: JSON.stringify({ error: 'Missing email template for submission confirmation' }),
          headers: { 'Content-Type': 'application/json' },
        },
      };
    }
  }

  return { ok: true, copyTemplateKey };
}

function getFormIdentifiers(request: HttpRequest, updateData: any): { formCode: any; formId: any } {
  const routeId = request.params?.id;
  const formCode = updateData.formCode || updateData.FormCode__c;
  const formId = updateData.formId || updateData.Id || routeId;
  return { formCode, formId };
}

function splitUpdatePayload(updateData: any): { formFields: any; attachments: any; notes: any } {
  const formFields: any = { ...updateData };
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

  return { formFields, attachments, notes };
}

async function updateFormHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const reqObj: any = resolveRequestObject(request, context);
  const requestId = resolveRequestId(request, context, reqObj);
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

    const updateDataResult = await parseUpdateData(request, logger);
    if (!updateDataResult.ok) {
      return updateDataResult.response;
    }
    const updateData = updateDataResult.data;

    const { sendEmail, emailTemplates } = extractEmailControls(updateData, logger);

    const templateValidation = validateEmailTemplates(sendEmail, emailTemplates);
    if (!templateValidation.ok) {
      return templateValidation.response;
    }
    const copyTemplateKey = templateValidation.copyTemplateKey;

    const { formCode, formId } = getFormIdentifiers(request, updateData);

    if (!formCode && !formId) {
      logger.error('Missing form identifier', new Error('formCode or formId is required'));
      return {
        status: 400,
        body: JSON.stringify({ error: 'Missing required parameter: formCode or formId' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    const salesforceService = new SalesforceService(buildSalesforceConfig());

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

    const { formFields, attachments, notes } = splitUpdatePayload(updateData);

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
    const { statusCode, errorMessage } = mapCommonHandlerError(error, {
      includeFormNotFound: true,
      includeSalesforceError: true,
      includeInvalidField: true,
      includeMissingCredentials: true,
    });

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
