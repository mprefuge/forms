import { Connection } from 'jsforce';
import axios from 'axios';

export interface SalesforceServiceConfig {
  loginUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface FormData {
  [key: string]: string | undefined;
  RecordType?: string;
}

export class SalesforceService {
  private connection: Connection;
  private config: SalesforceServiceConfig;

  constructor(config: SalesforceServiceConfig) {
    this.config = config;
    // start with an empty connection; we'll set access token after authenticating
    this.connection = new Connection({});
  }

  async authenticate(): Promise<void> {
    // Centralized credentials validation
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Missing Salesforce credentials');
    }

    const tokenUrl = `${this.config.loginUrl.replace(/\/$/, '')}/services/oauth2/token`;

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.config.clientId);
      params.append('client_secret', this.config.clientSecret);

      const resp = await axios.post(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      });

      const { access_token, instance_url } = resp.data;

      if (!access_token || !instance_url) {
        throw new Error('Failed to obtain access token from Salesforce');
      }

      // Reinitialize the jsforce Connection with the received token
      this.connection = new Connection({
        accessToken: access_token,
        instanceUrl: instance_url,
      });
    } catch (err: any) {
      const details = err?.response ? { status: err.response.status, data: err.response.data } : { message: err?.message };
      throw new Error(`Authentication failed: ${JSON.stringify(details)}`);
    }
  }

  async getRecordTypeId(recordTypeName: string): Promise<string> {
    const query = `SELECT Id FROM RecordType WHERE SObjectType = 'Form__c' AND Name = '${recordTypeName}'`;
    const result: any = await this.connection.query(query);

    if (result.records && result.records.length > 0) {
      return result.records[0].Id as string;
    }

    throw new Error(`RecordType not found: ${recordTypeName}`);
  }

  /**
   * Return the name of any existing RecordType for Form__c or null if none.
   */
  async getAnyRecordTypeName(): Promise<string | null> {
    const query = `SELECT Name FROM RecordType WHERE SObjectType = 'Form__c' LIMIT 1`;
    const result: any = await this.connection.query(query);

    if (result.records && result.records.length > 0) {
      return result.records[0].Name as string;
    }

    return null;
  }

  /**
   * Describe Form__c fields and return a simplified list with types
   */
  async describeFormFields(): Promise<Array<{ name: string; label?: string; type?: string; length?: number; nillable?: boolean; createable?: boolean; referenceTo?: string[] }>> {
    const desc: any = await this.connection.sobject('Form__c').describe();
    if (!desc || !desc.fields) return [];

    return desc.fields.map((f: any) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      length: f.length,
      nillable: f.nillable,
      createable: f.createable,
      referenceTo: f.referenceTo || [],
      picklistValues: (f.picklistValues || []).map((v: any) => v.value)
    }));
  }

  /**
   * Generate a unique 5-character lowercase alphanumeric identifier for the form code
   */
  private generateFormCodeGuid(): string {
    const crypto = require('crypto');
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(5);
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += chars[bytes[i] % chars.length];
    }

    return out;
  }

  /**
   * Try generating a unique FormCode__c value by checking for existing records.
   * Retries up to `maxAttempts` times before failing.
   */
  private async generateUniqueFormCode(maxAttempts = 10): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.generateFormCodeGuid();
      const q = `SELECT Id FROM Form__c WHERE FormCode__c = '${code}'`;
      try {
        const res: any = await this.connection.query(q);
        if (!res.records || res.records.length === 0) return code;
        // found a collision; continue to next attempt
      } catch (err) {
        // If the query fails for some reason, rethrow; do not mask it
        throw err;
      }
    }

    throw new Error(`Unable to generate unique FormCode__c after ${maxAttempts} attempts`);
  }

  async createForm(formData: FormData, requestId: string): Promise<{ id: string; formCode: string }> {
    const allowedFields = [
      'AdditionalNotes__c',
      'AffirmStatementOfFaith__c',
      'Availability__c',
      'Birthdate__c',
      'Church__c',
      'ChurchServingDetails__c',
      'City__c',
      'Country__c',
      'CountryOfOrigin__c',
      'CreatedById',
      'Email__c',
      'EmergencyContactFirstName__c',
      'EmergencyContactLastName__c',
      'EmergencyContactPhone__c',
      'EmergencyContactRelationship__c',
      'FirstName__c',
      'Gender__c',
      'GospelDetails__c',
      'HowHeard__c',
      'LanguagesSpoken__c',
      'LastModifiedById',
      'LastName__c',
      'MaritalStatus__c',
      'OwnerId',
      'PastorEmail__c',
      'PastorFirstName__c',
      'PastorLastName__c',
      'PastorSalutation__c',
      'Person__c',
      'Phone__c',
      'PrimaryLanguage__c',
      'RecentMinistrySafe__c',
      'RecordTypeId',
      'Salutation__c',
      'ServingAreaPrimaryInterest__c',
      'ServingAreasInterest__c',
      'Skills__c',
      'State__c',
      'Street__c',
      'TestimonyDetails__c',
      'WillPay__c',
      'Zip__c',
    ];

    const recordTypeRecord: any = {
      attributes: { type: 'Form__c' },
    };

    // Handle RecordType mapping - default to 'General' when not provided
    const recordTypeName = formData.RecordType ?? 'General';
    const recordTypeId = await this.getRecordTypeId(recordTypeName);
    recordTypeRecord.RecordTypeId = recordTypeId;

    // Always generate a unique 5-character GUID for the form code (override any client-supplied FormCode__c)
    recordTypeRecord.FormCode__c = await this.generateUniqueFormCode();

    // Map allowed fields, but do NOT copy client-supplied Name or FormCode__c (we always generate the code)
    for (const field of allowedFields) {
      if (field === 'RecordTypeId' || field === 'Name' || field === 'FormCode__c') continue;
      if (formData[field] !== undefined) {
        recordTypeRecord[field] = formData[field];
      }
    }

    try {
      const result = await this.connection.sobject('Form__c').create(recordTypeRecord);

      if (result.success) {
        const formId = result.id;

        // Handle attachments and notes if provided
        try {
          const attachments = (formData as any).Attachments;
          if (Array.isArray(attachments) && attachments.length > 0) {
            await this.createAttachments(formId, attachments);
          }

          const notes = (formData as any).Notes;
          if (Array.isArray(notes) && notes.length > 0) {
            await this.createNotes(formId, notes);
          }
        } catch (err: any) {
          // Log and rethrow with context
          throw new Error(`Failed post-create operations: ${err?.message || err}`);
        }

        // Return both id and the generated form code used for the record
        const codeUsed = recordTypeRecord.FormCode__c || (formData as any).FormCode__c || '';
        return { id: formId, formCode: codeUsed };
      } else {
        throw new Error(`Failed to create form: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error: any) {
      throw new Error(
        `Salesforce error: ${error.message || 'Unknown error'} (Request ID: ${requestId})`
      );
    }
  }

  /**
   * Create ContentVersion + ContentDocumentLink records for attachments
   * attachments: [{ fileName, contentType, base64 }]
   */
  async createAttachments(formId: string, attachments: Array<{ fileName: string; contentType?: string; base64: string }>): Promise<string[]> {
    const createdLinks: string[] = [];

    for (const att of attachments) {
      const cv = {
        Title: att.fileName,
        PathOnClient: att.fileName,
        VersionData: att.base64,
      };

      const cvResult: any = await this.connection.sobject('ContentVersion').create(cv);
      if (!cvResult.success) {
        throw new Error(`Failed to create ContentVersion: ${cvResult.errors?.join(', ')}`);
      }

      const cvId = cvResult.id;
      // Query to get ContentDocumentId
      const q = `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${cvId}'`;
      const qRes: any = await this.connection.query(q);
      const contentDocumentId = qRes.records && qRes.records[0] && qRes.records[0].ContentDocumentId;

      if (!contentDocumentId) {
        throw new Error(`Failed to resolve ContentDocumentId for ContentVersion ${cvId}`);
      }

      const linkRes: any = await this.connection.sobject('ContentDocumentLink').create({
        LinkedEntityId: formId,
        ContentDocumentId: contentDocumentId,
        ShareType: 'V',
        Visibility: 'AllUsers',
      });

      if (!linkRes.success) {
        throw new Error(`Failed to create ContentDocumentLink: ${linkRes.errors?.join(', ')}`);
      }

      createdLinks.push(linkRes.id);
    }

    return createdLinks;
  }

  /**
   * Create Note records related to the Form
   * notes: [{ Title?, Body }]
   */
  async createNotes(formId: string, notes: Array<{ Title?: string; Body: string }>): Promise<string[]> {
    const ids: string[] = [];

    for (const note of notes) {
      const res: any = await this.connection.sobject('Note').create({
        Title: note.Title || 'Note',
        Body: note.Body,
        ParentId: formId,
      });

      if (!res.success) {
        throw new Error(`Failed to create Note: ${res.errors?.join(', ')}`);
      }

      ids.push(res.id);
    }

    return ids;
  }

  /**
   * Delete a Form__c record by Id
   */
  async deleteFormById(formId: string): Promise<void> {
    try {
      const result: any = await this.connection.sobject('Form__c').destroy(formId);
      if (!result.success) {
        throw new Error(`Failed to delete Form ${formId}: ${result.errors?.join(', ')}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to delete Form ${formId}: ${err?.message || err}`);
    }
  }

  async getCurrentUserId(): Promise<string> {
    const identity: any = await this.connection.identity();
    return identity.user_id;
  }

  /**
   * Retrieve a form by its FormCode__c field (GUID)
   * @param formCode The FormCode__c value to search for
   * @param fields Optional array of field names to retrieve. If not provided, defaults to a standard set.
   */
  async getFormByCode(formCode: string, fields?: string[]): Promise<any> {
    // Default fields if none specified
    const defaultFields = ['Id', 'FormCode__c', 'Name', 'FirstName__c', 'LastName__c', 'Email__c', 'Phone__c', 'CreatedDate'];
    
    // Use provided fields or fall back to defaults
    const fieldsToQuery = fields && fields.length > 0 ? fields : defaultFields;
    
    // Ensure Id is always included if not already present
    if (!fieldsToQuery.includes('Id')) {
      fieldsToQuery.unshift('Id');
    }

    // Build SELECT clause
    const selectClause = fieldsToQuery.join(', ');
    const query = `SELECT ${selectClause} FROM Form__c WHERE FormCode__c = '${formCode}'`;
    
    try {
      const result: any = await this.connection.query(query);

      if (result.records && result.records.length > 0) {
        return result.records[0];
      }

      throw new Error(`Form not found with code: ${formCode}`);
    } catch (error: any) {
      // If it's a Salesforce field error, provide more context
      if (error.message && error.message.includes('INVALID_FIELD')) {
        throw new Error(`Invalid field in query: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update an existing Form__c record
   * Dynamically determines which fields are updateable from Salesforce schema
   */
  async updateForm(formId: string, formData: FormData, requestId: string): Promise<void> {
    // Get the describe information to determine updateable fields
    const desc: any = await this.connection.sobject('Form__c').describe();
    if (!desc || !desc.fields) {
      throw new Error('Unable to describe Form__c object');
    }

    // Build list of updateable fields (exclude system fields and non-updateable fields)
    const updateableFields = desc.fields
      .filter((f: any) => f.updateable && !f.calculated && f.name !== 'Id')
      .map((f: any) => f.name);

    const updateRecord: any = {
      Id: formId,
    };

    // Map provided fields that are updateable
    for (const [key, value] of Object.entries(formData)) {
      if (updateableFields.includes(key) && value !== undefined) {
        updateRecord[key] = value;
      }
    }

    // If no fields to update, skip the update
    if (Object.keys(updateRecord).length === 1) {
      return; // Only Id is present, nothing to update
    }

    try {
      const result: any = await this.connection.sobject('Form__c').update(updateRecord);

      if (!result.success) {
        throw new Error(`Failed to update form: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error: any) {
      throw new Error(
        `Salesforce error: ${error.message || 'Unknown error'} (Request ID: ${requestId})`
      );
    }
  }
}

