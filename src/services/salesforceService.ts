import { Connection } from 'jsforce';
import axios from 'axios';
import { FormConfig } from '../config/formConfigTypes';
import { 
  buildSoqlQuery, 
  buildSoqlQueryByField, 
  buildSoqlSelectClause,
  getUpdateableFields 
} from '../config/FormConfigUtils';
import { ContactMatchService, ContactMatchCriteria, ContactMatchResult } from './contactMatchService';

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

  /**
   * Get RecordType ID, supporting both legacy string lookup and FormConfig
   */
  async getRecordTypeId(recordTypeNameOrFormConfig: string | FormConfig): Promise<string> {
    let recordTypeName: string;
    let objectName = 'Form__c';

    if (typeof recordTypeNameOrFormConfig === 'string') {
      recordTypeName = recordTypeNameOrFormConfig;
    } else {
      // FormConfig provided
      recordTypeName = recordTypeNameOrFormConfig.salesforce.recordTypeName;
      objectName = recordTypeNameOrFormConfig.salesforce.objectName;
    }

    const query = `SELECT Id FROM RecordType WHERE SObjectType = '${objectName}' AND Name = '${recordTypeName}'`;
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
  async describeFormFields(formConfig?: FormConfig): Promise<Array<{ name: string; label?: string; type?: string; length?: number; nillable?: boolean; createable?: boolean; referenceTo?: string[] }>> {
    const objectName = formConfig?.salesforce.objectName || 'Form__c';
    const desc: any = await this.connection.sobject(objectName).describe();
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
   * Generate a unique lowercase alphanumeric identifier for the form code
   */
  private generateFormCodeGuid(length: number = 5): string {
    const crypto = require('crypto');
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[bytes[i] % chars.length];
    }

    return out;
  }

  /**
   * Try generating a unique FormCode__c value by checking for existing records.
   * Retries up to `maxAttempts` times before failing.
   */
  private async generateUniqueFormCode(codeField?: string, length: number = 5, maxAttempts = 10): Promise<string> {
    const lookupField = codeField || 'FormCode__c';
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.generateFormCodeGuid(length);
      const q = `SELECT Id FROM Form__c WHERE ${lookupField} = '${code}'`;
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

  // Encode picklist tokens by replacing spaces with underscores to match Salesforce API requirements
  private encodePicklistToken(token: string): string {
    // Convert spaces and hyphens to underscores; trim whitespace
    return token.replace(/[\s-]+/g, '_').trim();
  }

  // Normalize a string for comparison by collapsing spaces, underscores and hyphens to a single space and lower-casing
  private normalizeForCompare(s: string): string {
    return String(s).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  }

  // Resolve the canonical picklist value from an incoming token using allowed values when available
  private resolvePicklistToken(token: string, allowedValues?: string[]): string {
    const t = String(token).trim();

    // Coerce allowedValues (which may be strings or objects from jsforce describe) into strings
    const allowed = (allowedValues || []).reduce((acc: string[], a: any) => {
      if (a === null || a === undefined) return acc;
      const val = (typeof a === 'string' ? a : (a && (a as any).value !== undefined ? (a as any).value : a));
      if (val === null || val === undefined) return acc;
      acc.push(String(val));
      return acc;
    }, []);

    if (allowed.length === 0) {
      // No metadata: keep previous behavior (encode spaces to underscores)
      return this.encodePicklistToken(t);
    }

    // Prefer exact match (case-sensitive) — return the allowed value AS IS (preserve spaces/hyphens if that's canonical)
    for (const a of allowed) {
      if (a === t) return a;
    }

    // Then prefer case-insensitive exact match — return allowed value AS IS
    for (const a of allowed) {
      if (a.toLowerCase() === t.toLowerCase()) return a;
    }

    // If exact/case-insensitive fails, try encoding the provided token (spaces/hyphens -> underscores)
    // This supports cases where Salesforce canonical uses underscores but incoming data uses spaces or hyphens.
    const encodedToken = this.encodePicklistToken(t);
    for (const a of allowed) {
      if (a === encodedToken) return a;
    }
    for (const a of allowed) {
      if (a.toLowerCase() === encodedToken.toLowerCase()) return a;
    }

    // Use normalized matching (collapse spaces/underscores/hyphens)
    const normToken = this.normalizeForCompare(t);
    const normalizedMap = new Map<string, string[]>();
    for (const a of allowed) {
      const key = this.normalizeForCompare(a);
      const list = normalizedMap.get(key) || [];
      list.push(a);
      normalizedMap.set(key, list);
    }

    const matches = normalizedMap.get(normToken);
    if (matches && matches.length > 0) {
      // If multiple matches, prefer one that contains an underscore (common canonicalization), otherwise first
      let chosen: string;
      if (matches.length === 1) chosen = matches[0];
      else {
        const underscore = matches.find(m => m.includes('_'));
        chosen = underscore || matches[0];
      }
      return this.encodePicklistToken(chosen);
    }

    // Fallback: encode spaces to underscores (original behavior)
    return this.encodePicklistToken(t);
  }

  /**
   * Create a form record. Requires FormConfig to specify which fields to write.
   * All field specifications come from the form configuration.
   */
  async createForm(formData: FormData | { [key: string]: any }, requestId: string, formConfig?: FormConfig): Promise<{ id: string; formCode: string }> {
    // Allow callers to omit a full FormConfig; fall back to sensible defaults when missing
    const objectName = formConfig?.salesforce?.objectName || 'Form__c';
    const recordTypeName = formConfig?.salesforce?.recordTypeName || 'General';
    const allowedFields = formConfig?.salesforce?.allowedFields || [];
    const codeLength = formConfig?.salesforce?.codeLength || 5;
    const codeFieldName = formConfig?.salesforce?.lookupCodeField || 'FormCode__c';

    const recordTypeRecord: any = {
      attributes: { type: objectName },
    };

    // Resolve RecordType by name to ID
    const recordTypeRecord_Name = formData.RecordType ?? recordTypeName;
    const recordTypeId = await this.getRecordTypeId(recordTypeRecord_Name);
    recordTypeRecord.RecordTypeId = recordTypeId;

    // Generate unique form code
    recordTypeRecord[codeFieldName] = await this.generateUniqueFormCode(undefined, codeLength);

    // Get field metadata from Salesforce schema
    const describedFields = await this.describeFormFields(formConfig);
    const fieldMetaMap = new Map(describedFields.map(f => [f.name, f]));

    // Copy only allowed fields from input data.
    // If a FormConfig is provided, use its allowedFields list; otherwise, accept any fields present in the incoming data that
    // exist in the Salesforce schema (based on describe) so that legacy callers that don't provide a config still work.
    if (formConfig) {
      for (const field of allowedFields) {
        if (field === 'RecordTypeId' || field === 'Name' || field === codeFieldName) continue;
        if (formData[field] !== undefined) {
          let val: any = formData[field];
          const meta: any = fieldMetaMap.get(field);
          
          // Handle picklist/multipicklist values
          if (meta && (meta.type || '').toLowerCase() === 'multipicklist') {
            if (Array.isArray(val)) {
              val = val.map((s: string) => this.resolvePicklistToken(String(s), meta.picklistValues)).join(';');
            } else if (typeof val === 'string') {
              if (val.includes('|')) {
                val = val.split('|').map((s: string) => this.resolvePicklistToken(s.trim(), meta.picklistValues)).join(';');
              } else {
                val = String(val).split(';').map((s: string) => this.resolvePicklistToken(s.trim(), meta.picklistValues)).filter(Boolean).join(';');
              }
            }
          } else if (meta && (((meta.type || '').toLowerCase() === 'picklist') || (meta.picklistValues || []).length > 0) && typeof val === 'string') {
            val = this.resolvePicklistToken(val, meta.picklistValues);
          }
          recordTypeRecord[field] = val;
        }
      }
    } else {
      // No FormConfig provided: accept any fields present in formData that appear in the described fields
      for (const key of Object.keys(formData)) {
        if (key === 'RecordType' || key === 'RecordTypeId' || key === 'Name' || key === codeFieldName) continue;
        if (!fieldMetaMap.has(key)) continue;

        let val: any = (formData as any)[key];
        const meta: any = fieldMetaMap.get(key);

        // Handle picklist/multipicklist values (same logic as above)
        if (meta && (meta.type || '').toLowerCase() === 'multipicklist') {
          if (Array.isArray(val)) {
            val = val.map((s: string) => this.resolvePicklistToken(String(s), meta.picklistValues)).join(';');
          } else if (typeof val === 'string') {
            if (val.includes('|')) {
              val = val.split('|').map((s: string) => this.resolvePicklistToken(s.trim(), meta.picklistValues)).join(';');
            } else {
              val = String(val).split(';').map((s: string) => this.resolvePicklistToken(s.trim(), meta.picklistValues)).filter(Boolean).join(';');
            }
          }
        } else if (meta && (((meta.type || '').toLowerCase() === 'picklist') || (meta.picklistValues || []).length > 0) && typeof val === 'string') {
          val = this.resolvePicklistToken(val, meta.picklistValues);
        }

        recordTypeRecord[key] = val;
      }
    }

    try {
      const result = await this.connection.sobject(objectName).create(recordTypeRecord);

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
          throw new Error(`Failed post-create operations: ${err?.message || err}`);
        }

        const codeUsed = recordTypeRecord[codeFieldName] || '';
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
   * Retrieve a form by its search field (usually FormCode__c)
   * Uses fields and object from FormConfig
   * @param formCode The value to search for
   * @param fieldsOrFormConfig FormConfig object (required) or field array for legacy behavior
   */
  async getFormByCode(formCode: string, fieldsOrFormConfig?: string[] | FormConfig): Promise<any> {
    let formConfig: FormConfig | undefined;
    let customFields: string[] | undefined;

    // Handle both old API (fields array) and new API (FormConfig object)
    if (Array.isArray(fieldsOrFormConfig)) {
      customFields = fieldsOrFormConfig;
    } else if (fieldsOrFormConfig) {
      formConfig = fieldsOrFormConfig;
    }

    if (!formConfig && !customFields) {
      throw new Error('FormConfig or field array must be provided to getFormByCode');
    }

    try {
      let query: string;
      
      if (formConfig) {
        // Use config-driven query builder - queries only the fields in config
        query = buildSoqlQuery(formConfig, formCode);
      } else {
        // Legacy behavior: use custom fields
        const defaultFields = ['Id', 'FormCode__c', 'Name', 'FirstName__c', 'LastName__c', 'Email__c', 'Phone__c', 'CreatedDate'];
        const fieldsToQuery = customFields && customFields.length > 0 ? [...customFields] : [...defaultFields];
        
        // Ensure Id is always included
        if (!fieldsToQuery.includes('Id')) {
          fieldsToQuery.unshift('Id');
        }
        
        const selectClause = fieldsToQuery.join(', ');
        const safeCode = String(formCode).replace(/'/g, "\\'");
        query = `SELECT ${selectClause} FROM Form__c WHERE FormCode__c = '${safeCode}'`;
      }

      const result: any = await this.connection.query(query);

      if (result.records && result.records.length > 0) {
        return result.records[0];
      }

      throw new Error(`Form not found with code: ${formCode}`);
    } catch (error: any) {
      if (error.message && error.message.includes('INVALID_FIELD')) {
        throw new Error(`Invalid field in query: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Retrieve a form by its Salesforce Id
   * @param id The Form__c Id
   * @param fields Optional array of field names to retrieve
   */
  async getFormById(id: string, fields?: string[]): Promise<any> {
    if (!id || typeof id !== 'string') throw new Error('Invalid id parameter');

    // Default fields if none specified
    const defaultFields = ['Id', 'FormCode__c', 'Name', 'FirstName__c', 'LastName__c', 'Email__c', 'Phone__c', 'CreatedDate'];
    let fieldsToQuery = fields && fields.length > 0 ? [...fields] : [...defaultFields];

    // Validate fields against Salesforce schema
    const desc: any = await this.connection.sobject('Form__c').describe();
    if (desc && desc.fields) {
      const validFields = new Set(desc.fields.map((f: any) => f.name));
      fieldsToQuery = fieldsToQuery.filter(f => validFields.has(f));
      // If filtering removed all requested fields, or the only remaining field is the Id, fall back to defaults
      if (fieldsToQuery.length === 0 || (fieldsToQuery.length === 1 && fieldsToQuery[0] === 'Id')) {
        fieldsToQuery = [...defaultFields];
      }
    }

    if (!fieldsToQuery.includes('Id')) fieldsToQuery.unshift('Id');

    const selectClause = fieldsToQuery.join(', ');
    const safeId = id.replace(/'/g, "\\'");
    const query = `SELECT ${selectClause} FROM Form__c WHERE Id = '${safeId}' LIMIT 1`;

    try {
      const result: any = await this.connection.query(query);
      if (result.records && result.records.length > 0) {
        return result.records[0];
      }
      throw new Error(`Form not found with id: ${id}`);
    } catch (error: any) {
      if (error.message && error.message.includes('INVALID_FIELD')) {
        throw new Error(`Invalid field in query: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Retrieve a form by email address
   * Uses email field specified in FormConfig (default: Email__c)
   * @param email Email to search for
   * @param formConfig FormConfig with email field and query fields specification
   */
  async getFormByEmail(email: string, formConfig?: FormConfig): Promise<any> {
    if (!email || typeof email !== 'string') throw new Error('Invalid email parameter');

    try {
      let query: string;

      if (formConfig) {
        // Use email field from config
        const emailField = formConfig.salesforce.lookupEmailField || 'Email__c';
        query = buildSoqlQueryByField(formConfig, emailField, email);
      } else {
        // Legacy behavior
        const defaultFields = ['Id', 'FormCode__c', 'Name', 'FirstName__c', 'LastName__c', 'Email__c', 'Phone__c', 'CreatedDate'];
        const selectClause = defaultFields.join(', ');
        const safeEmail = String(email).replace(/'/g, "\\'");
        query = `SELECT ${selectClause} FROM Form__c WHERE Email__c = '${safeEmail}' LIMIT 1`;
      }

      const result: any = await this.connection.query(query);
      if (result.records && result.records.length > 0) {
        return result.records[0];
      }
      throw new Error(`Form not found with email: ${email}`);
    } catch (error: any) {
      if (error.message && error.message.includes('INVALID_FIELD')) {
        throw new Error(`Invalid field in query: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Update an existing form record
   * Uses fields specified in FormConfig.salesforce.updateFields (or allowedFields as fallback)
   */
  async updateForm(formId: string, formData: FormData, requestId: string, formConfig?: FormConfig): Promise<void> {
    const updateRecord: any = {
      Id: formId,
    };

    // Determine which fields can be updated
    let updateableFieldsList: string[];
    let fieldMetaMap: Map<string, any> = new Map();

    if (formConfig) {
      // Use config-specified updateable fields
      updateableFieldsList = getUpdateableFields(formConfig);
      
      // Get metadata for picklist handling
      const describedFields = await this.describeFormFields(formConfig);
      fieldMetaMap = new Map(describedFields.map(f => [f.name, f]));
      
      // Add Person__c if it's being updated and is updateable in Salesforce (regardless of form config)
      if (formData['Person__c'] !== undefined && !updateableFieldsList.includes('Person__c')) {
        // Check if Person__c exists and is updateable in Salesforce
        const personField = describedFields.find(f => f.name === 'Person__c');
        if (personField && personField.createable) {
          updateableFieldsList.push('Person__c');
          console.log('Added Person__c to updateable fields list');
        } else {
          console.log('Person__c field not found or not updateable in Salesforce schema');
        }
      }
    } else {
      // Legacy: get updateable fields from Salesforce schema
      const desc: any = await this.connection.sobject('Form__c').describe();
      if (!desc || !desc.fields) {
        throw new Error('Unable to describe Form__c object');
      }

      updateableFieldsList = desc.fields
        .filter((f: any) => f.updateable && !f.calculated && f.name !== 'Id')
        .map((f: any) => f.name);

      fieldMetaMap = new Map((desc.fields || []).map((f: any) => [f.name, f]));
    }
    
    console.log('Updateable fields list:', updateableFieldsList);
    console.log('Fields to update:', Object.keys(formData));

    // Copy only updateable fields
    for (const field of updateableFieldsList) {
      if (formData[field] !== undefined) {
        let val: any = formData[field];
        const meta: any = fieldMetaMap.get(field);
        
        // Handle picklist/multipicklist values
        if (meta && (meta.type || '').toLowerCase() === 'multipicklist') {
          if (Array.isArray(val)) {
            val = val.map((s: string) => this.resolvePicklistToken(String(s), meta.picklistValues)).join(';');
          } else if (typeof val === 'string') {
            if (val.includes('|')) {
              val = val.split('|').map((s: string) => this.resolvePicklistToken(s.trim(), meta.picklistValues)).join(';');
            } else {
              val = String(val).split(';').map((s: string) => this.resolvePicklistToken(s.trim(), meta.picklistValues)).filter(Boolean).join(';');
            }
          }
        } else if (meta && (((meta.type || '').toLowerCase() === 'picklist') || (meta.picklistValues || []).length > 0) && typeof val === 'string') {
          val = this.resolvePicklistToken(val, meta.picklistValues);
        }
        updateRecord[field] = val;
      }
    }

    // If no fields to update, skip the update
    if (Object.keys(updateRecord).length === 1) {
      return; // Only Id is present, nothing to update
    }

    try {
      const objectName = formConfig?.salesforce.objectName || 'Form__c';
      const result: any = await this.connection.sobject(objectName).update(updateRecord);

      if (!result.success) {
        throw new Error(`Failed to update form: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error: any) {
      throw new Error(
        `Salesforce error: ${error.message || 'Unknown error'} (Request ID: ${requestId})`
      );
    }
  }

  /**
   * Look up a Campaign by ID and return its information
   * Returns null if not found or on error (graceful degradation)
   */
  async getCampaignById(campaignId: string): Promise<{ id: string; name: string } | null> {
    try {
      if (!campaignId || typeof campaignId !== 'string') {
        return null;
      }

      const query = `SELECT Id, Name FROM Campaign WHERE Id = '${campaignId}' LIMIT 1`;
      const result: any = await this.connection.query(query);

      if (result.records && result.records.length > 0) {
        return {
          id: result.records[0].Id,
          name: result.records[0].Name,
        };
      }

      return null;
    } catch (error: any) {
      // Log error but don't throw - allow form creation to proceed
      console.error(`Campaign lookup failed for ID ${campaignId}:`, error.message);
      return null;
    }
  }

  /**
   * Look up a Campaign by ID and return specified fields.
   * Returns null if not found or on error (graceful degradation)
   */
  async getCampaignByIdWithFields(campaignId: string, fields: string[] = ['Id','Name','StartDate','EndDate','Description']): Promise<Record<string, any> | null> {
    try {
      if (!campaignId || typeof campaignId !== 'string') {
        return null;
      }

      // Sanitize and build select clause
      const safeFields = (fields || []).filter(f => typeof f === 'string' && f.trim().length > 0);
      const select = safeFields.length > 0 ? safeFields.join(', ') : 'Id, Name';
      const query = `SELECT ${select} FROM Campaign WHERE Id = '${campaignId}' LIMIT 1`;
      const result: any = await this.connection.query(query);

      if (result.records && result.records.length > 0) {
        const record = result.records[0];

        // Attempt to fetch related Files/Attachments (images) and attach them to the campaign record as `images`
        try {
          const images = await this.getCampaignImages(record.Id || record.id);
          if (Array.isArray(images) && images.length > 0) {
            (record as any).images = images;
          }
        } catch (imgErr: any) {
          // Non-fatal: continue without images
          console.warn(`Failed to fetch campaign images for ${campaignId}:`, imgErr?.message || imgErr);
        }

        return record;
      }

      return null;
    } catch (error: any) {
      console.error(`Campaign lookup (fields) failed for ID ${campaignId}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch images (ContentVersion/Attachment) for a Campaign.
   * Returns an array of objects { id, title, fileType, contentType, url } when available.
   */
  async downloadContentVersionBinary(contentVersionId: string): Promise<{ data: Buffer; contentType: string; fileName?: string } | null> {
    try {
      if (!contentVersionId || typeof contentVersionId !== 'string') {
        console.log(`[downloadContentVersionBinary] Invalid contentVersionId: ${contentVersionId}`);
        return null;
      }

      console.log(`[downloadContentVersionBinary] Downloading ContentVersion: ${contentVersionId}`);

      // Query metadata for filename / file type
      const q = `SELECT Id, Title, FileType FROM ContentVersion WHERE Id = '${contentVersionId}' LIMIT 1`;
      const res: any = await this.connection.query(q);
      const meta = (res.records && res.records[0]) ? res.records[0] : null;
      const fileName = meta ? (meta.Title || `${contentVersionId}`) : `${contentVersionId}`;

      console.log(`[downloadContentVersionBinary] Metadata: fileName="${fileName}", FileType="${meta?.FileType || 'unknown'}"`);

      const apiVersion = this.connection.version ? `v${this.connection.version}` : 'v57.0';
      const url = `${this.connection.instanceUrl}/services/data/${apiVersion}/sobjects/ContentVersion/${contentVersionId}/VersionData`;

      console.log(`[downloadContentVersionBinary] Fetching from URL: ${url}`);

      // Use axios to fetch binary with oauth bearer token
      const axios = require('axios');
      const resp = await axios.get(url, { responseType: 'arraybuffer', headers: { Authorization: `Bearer ${this.connection.accessToken}` }, timeout: 20000 });
      const contentType = resp.headers && resp.headers['content-type'] ? resp.headers['content-type'] : (meta && meta.FileType ? `image/${meta.FileType.toLowerCase()}` : 'application/octet-stream');
      
      console.log(`[downloadContentVersionBinary] Success! Downloaded ${resp.data.length} bytes, contentType="${contentType}"`);
      
      return { data: Buffer.from(resp.data), contentType, fileName };
    } catch (error: any) {
      console.error(`[downloadContentVersionBinary] Failed to download ContentVersion ${contentVersionId}:`, error?.message || error);
      return null;
    }
  }

  async downloadAttachmentBinary(attachmentId: string): Promise<{ data: Buffer; contentType: string; fileName?: string } | null> {
    try {
      if (!attachmentId || typeof attachmentId !== 'string') return null;
      const q = `SELECT Id, Name, ContentType FROM Attachment WHERE Id = '${attachmentId}' LIMIT 1`;
      const res: any = await this.connection.query(q);
      const meta = (res.records && res.records[0]) ? res.records[0] : null;
      const apiVersion = this.connection.version ? `v${this.connection.version}` : 'v57.0';
      const url = `${this.connection.instanceUrl}/services/data/${apiVersion}/sobjects/Attachment/${attachmentId}/Body`;
      const axios = require('axios');
      const resp = await axios.get(url, { responseType: 'arraybuffer', headers: { Authorization: `Bearer ${this.connection.accessToken}` }, timeout: 20000 });
      const contentType = resp.headers && resp.headers['content-type'] ? resp.headers['content-type'] : (meta && meta.ContentType ? meta.ContentType : 'application/octet-stream');
      const fileName = meta ? (meta.Name || attachmentId) : attachmentId;
      return { data: Buffer.from(resp.data), contentType, fileName };
    } catch (error: any) {
      console.error('Failed to download Attachment', error?.message || error);
      return null;
    }
  }

  async getCampaignImages(campaignId: string): Promise<Array<Record<string, any>>> {
    try {
      if (!campaignId || typeof campaignId !== 'string') return [];

      console.log(`[getCampaignImages] Starting for campaign: ${campaignId}`);

      // 1) Query ContentDocumentLink to find related ContentDocumentIds
      const qLinks = `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId = '${campaignId}'`;
      const linksRes: any = await this.connection.query(qLinks);
      const docIds = (linksRes.records || []).map((r: any) => r.ContentDocumentId).filter(Boolean);
      console.log(`[getCampaignImages] Found ${docIds.length} ContentDocumentLink(s):`, docIds);

      // 2) If we found ContentDocuments, query latest ContentVersion records
      if (docIds.length > 0) {
        const docList = docIds.map((id: string) => `'${id}'`).join(',');
        // Query all ContentVersions, then filter by filename extension on our end (more robust)
        const qCv = `SELECT Id, Title, FileType, PathOnClient, ContentDocumentId FROM ContentVersion WHERE ContentDocumentId IN (${docList}) AND IsLatest = true ORDER BY CreatedDate DESC`;
        console.log(`[getCampaignImages] Querying ContentVersions...`);
        const cvRes: any = await this.connection.query(qCv);
        console.log(`[getCampaignImages] Found ${(cvRes.records || []).length} ContentVersion record(s)`);
        
        // Filter for image files by extension (handle cases where FileType is empty or unusual)
        const imageExtRegex = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i;
        const baseUrl = (
          process.env.PUBLIC_BASE_URL
          || process.env.API_BASE_URL
          || (process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : 'http://localhost:7071')
        ).replace(/\/$/, '') + '/api/form';
        const images = (cvRes.records || [])
          .filter((v: any) => {
            const title = v.Title || '';
            const pathOnClient = v.PathOnClient || '';
            const fileType = (v.FileType || '').toUpperCase();
            const titleMatch = imageExtRegex.test(title);
            const pathMatch = imageExtRegex.test(pathOnClient);
            const typeMatch = ['PNG','JPG','JPEG','GIF','BMP','WEBP','SVG'].includes(fileType);
            const passes = titleMatch || pathMatch || typeMatch;
            console.log(`[getCampaignImages]   File: Title="${title}", Path="${pathOnClient}", Type="${fileType}" => titleMatch=${titleMatch}, pathMatch=${pathMatch}, typeMatch=${typeMatch}, passes=${passes}`);
            return passes;
          })
          .map((v: any) => ({
            id: v.Id,
            title: v.Title,
            fileType: v.FileType,
            url: `${baseUrl}?downloadContentVersion=${v.Id}`
          }));

        console.log(`[getCampaignImages] Filtered to ${images.length} image(s)`);
        if (images.length > 0) return images;
      }

      // 3) Fallback to Attachment (legacy attachments) if no ContentVersion images found
      console.log(`[getCampaignImages] No ContentVersion images found; checking Attachments...`);
      const qAtt = `SELECT Id, Name, ContentType FROM Attachment WHERE ParentId = '${campaignId}'`;
      const attRes: any = await this.connection.query(qAtt);
      console.log(`[getCampaignImages] Found ${(attRes.records || []).length} Attachment(s)`);
      const imageExtRegexAtt = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i;
      const baseUrlAtt = (
        process.env.PUBLIC_BASE_URL
        || process.env.API_BASE_URL
        || (process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : 'http://localhost:7071')
      ).replace(/\/$/, '') + '/api/form';
      const attImages = (attRes.records || [])
        .filter((a: any) => {
          const name = a.Name || '';
          const contentType = (a.ContentType || '').toLowerCase();
          const nameMatch = imageExtRegexAtt.test(name);
          const typeMatch = contentType.includes('image/');
          const passes = nameMatch || typeMatch;
          console.log(`[getCampaignImages]   Attachment: Name="${name}", ContentType="${contentType}" => nameMatch=${nameMatch}, typeMatch=${typeMatch}, passes=${passes}`);
          return passes;
        })
        .map((a: any) => ({
          id: a.Id,
          title: a.Name,
          fileType: a.ContentType,
          url: `${baseUrlAtt}?downloadAttachment=${a.Id}`
        }));

      console.log(`[getCampaignImages] Filtered to ${attImages.length} attachment image(s)`);
      return attImages;
    } catch (error: any) {
      console.error('[getCampaignImages] Campaign images fetch failed', error?.message || error);
      return [];
    }
  }

  /**
   * List active Campaigns with RecordType.Name = 'Event'.
   * Returns an array of raw records with requested fields.
   * Fetches image data for each campaign (if present) and attaches as `images`.
   */
  async getActiveEventCampaigns(fields: string[] = ['Id','Name','StartDate','EndDate','Description']): Promise<Array<Record<string, any>>> {
    try {
      const safeFields = (fields || []).filter(f => typeof f === 'string' && f.trim().length > 0);
      const select = safeFields.length > 0 ? safeFields.join(', ') : 'Id, Name';
      const query = `SELECT ${select} FROM Campaign WHERE RecordType.Name = 'Event' AND IsActive = true ORDER BY StartDate DESC NULLS LAST, Name ASC`;
      const result: any = await this.connection.query(query);
      const records: Array<Record<string, any>> = (result.records || []);

      // Enrich campaigns with image metadata where available (best-effort)
      const enriched = await Promise.all(records.map(async (rec) => {
        try {
          const images = await this.getCampaignImages(rec.Id || rec.id);
          return { ...(rec as any), images };
        } catch (e) {
          return rec;
        }
      }));

      return enriched;
    } catch (error: any) {
      console.error(`Active Event campaigns query failed:`, error?.message || error);
      return [];
    }
  }

  /**
   * Find a matching Contact record based on form data.
   * Searches for Contact matches using email, phone, secondary email, and names.
   * Returns the best match if confidence score meets minimum threshold.
   * 
   * @param criteria Contact matching criteria (firstName, lastName, email, phone, secondaryEmail)
   * @param minConfidence Minimum confidence threshold (0-100, default 70)
   * @returns ContactMatchResult if high confidence match found, null otherwise
   */
  async findContact(
    criteria: ContactMatchCriteria,
    minConfidence: number = 70
  ): Promise<ContactMatchResult | null> {
    try {
      // Validate that at least one criterion is provided
      if (!criteria.email && !criteria.phone && !criteria.secondaryEmail && 
          (!criteria.firstName || !criteria.lastName)) {
        console.log('Contact search: No criteria provided');
        return null;
      }

      // Build search query
      const matchService = new ContactMatchService();
      const query = matchService.buildContactSearchQuery(criteria);
      
      console.log('Contact search query:', query);

      // Execute query
      const result: any = await this.connection.query(query);
      const contacts = result.records || [];
      
      console.log(`Contact search results: Found ${contacts.length} contacts`);
      if (contacts.length > 0) {
        console.log('First contact:', JSON.stringify(contacts[0]));
      }

      if (contacts.length === 0) {
        return null;
      }

      // Find and return best match
      const match = matchService.findBestMatch(criteria, contacts, minConfidence);
      
      if (match) {
        console.log(`Contact match found: ID=${match.contactId}, confidence=${match.confidenceScore}`);
      } else {
        console.log(`No match met confidence threshold of ${minConfidence}`);
      }
      
      return match;
    } catch (error: any) {
      console.error(`Contact lookup failed:`, error?.message || error, error);
      return null;
    }
  }

  /**
   * Create a new Contact record in Salesforce
   * 
   * @param contactData Contact data including firstName, lastName, email, phone, etc.
   * @returns Contact ID of created record
   */
  async createContact(contactData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    secondaryEmail?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  }): Promise<string> {
    const contactRecord: any = {
      attributes: { type: 'Contact' },
      RecordTypeId: '0124x000000ySucAAE', // Contact record type
    };

    if (contactData.firstName) contactRecord.FirstName = contactData.firstName;
    if (contactData.lastName) contactRecord.LastName = contactData.lastName;
    if (contactData.email) contactRecord.Email = contactData.email;
    if (contactData.phone) contactRecord.Phone = contactData.phone;
    if (contactData.secondaryEmail) contactRecord.Secondary_Email__c = contactData.secondaryEmail;
    if (contactData.street) contactRecord.MailingStreet = contactData.street;
    if (contactData.city) contactRecord.MailingCity = contactData.city;
    if (contactData.state) contactRecord.MailingState = contactData.state;
    if (contactData.zip) contactRecord.MailingPostalCode = contactData.zip;

    // LastName is required for Contact in Salesforce
    if (!contactRecord.LastName) {
      contactRecord.LastName = 'Unknown';
    }

    try {
      const result = await this.connection.sobject('Contact').create(contactRecord);
      
      if (result.success) {
        return result.id;
      } else {
        throw new Error(`Failed to create contact: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error: any) {
      throw new Error(`Salesforce error creating contact: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Create a Campaign Member linking a Contact to a Campaign
   * 
   * @param campaignId Campaign ID
   * @param contactId Contact ID
   * @param status Campaign Member Status (default: 'Registered')
   * @returns Campaign Member ID of created record
   */
  async createCampaignMember(campaignId: string, contactId: string, status: string = 'Registered'): Promise<string> {
    const campaignMemberRecord: any = {
      attributes: { type: 'CampaignMember' },
      CampaignId: campaignId,
      ContactId: contactId,
      Status: status,
    };

    try {
      const result = await this.connection.sobject('CampaignMember').create(campaignMemberRecord);
      
      if (result.success) {
        return result.id;
      } else {
        throw new Error(`Failed to create campaign member: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error: any) {
      throw new Error(`Salesforce error creating campaign member: ${error.message || 'Unknown error'}`);
    }
  }
}

