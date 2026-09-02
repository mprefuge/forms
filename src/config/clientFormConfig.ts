/**
 * Sanitization for form configurations supplied by the browser.
 *
 * The front-end sends its form configuration with each request. Since the API
 * is anonymous, nothing in that object can be trusted as-is: object and field
 * names end up inside SOQL, and lookup fields decide which records a caller
 * can read. This module produces a server-controlled copy in which:
 *
 *   - the Salesforce object is pinned to Form__c
 *   - lookup fields are pinned (code lookups only ever use FormCode__c)
 *   - every field name is validated as a plain identifier
 *   - the record type can optionally be restricted via SF_ALLOWED_RECORD_TYPES
 *   - UI-only sections (phases, fieldMetadata, styling) are dropped
 *
 * Anything invalid throws ClientConfigError, which handlers map to HTTP 400.
 */

import { FormConfig } from './formConfigTypes';
import { assertSafeFieldList, assertSafeSoqlIdentifier, isSafeSoqlIdentifier } from '../functions/shared/soql';

export const FORM_OBJECT_NAME = 'Form__c';
export const FORM_CODE_FIELD = 'FormCode__c';
export const FORM_EMAIL_FIELD = 'Email__c';

const FORM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CLIENT_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const MAX_NAME_LENGTH = 200;

export class ClientConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientConfigError';
  }
}

function asTrimmedString(value: any, max: number): string {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function getAllowedRecordTypes(): string[] {
  return (process.env.SF_ALLOWED_RECORD_TYPES || '')
    .split(/[;,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeMapping(raw: any): { [client: string]: string } {
  const out: { [client: string]: string } = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [clientName, sfName] of Object.entries(raw)) {
    if (!CLIENT_FIELD_PATTERN.test(clientName)) {
      throw new ClientConfigError(`Invalid client field name in salesforceMapping: ${clientName.slice(0, 80)}`);
    }
    if (!isSafeSoqlIdentifier(sfName)) {
      throw new ClientConfigError(`Invalid Salesforce field name in salesforceMapping: ${String(sfName).slice(0, 80)}`);
    }
    out[clientName] = sfName as string;
  }
  return out;
}

function sanitizeFieldList(raw: any, label: string): string[] {
  try {
    return assertSafeFieldList(raw, label);
  } catch (err: any) {
    throw new ClientConfigError(err?.message || `Invalid ${label} list`);
  }
}

/**
 * Build a trusted FormConfig from a client-supplied object.
 */
export function sanitizeClientFormConfig(raw: any): FormConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ClientConfigError('Form configuration must be an object');
  }

  const id = asTrimmedString(raw.id, 64);
  if (!FORM_ID_PATTERN.test(id)) {
    throw new ClientConfigError('Form configuration has an invalid id');
  }

  const name = asTrimmedString(raw.name, MAX_NAME_LENGTH) || id;

  const sf = raw.salesforce && typeof raw.salesforce === 'object' ? raw.salesforce : {};

  const requestedObject = asTrimmedString(sf.objectName, 80) || FORM_OBJECT_NAME;
  if (requestedObject !== FORM_OBJECT_NAME) {
    throw new ClientConfigError(`Unsupported Salesforce object: ${requestedObject}`);
  }

  const recordTypeName = asTrimmedString(sf.recordTypeName, 80);
  if (!recordTypeName) {
    throw new ClientConfigError('Form configuration is missing salesforce.recordTypeName');
  }
  const allowedRecordTypes = getAllowedRecordTypes();
  if (allowedRecordTypes.length > 0 && !allowedRecordTypes.includes(recordTypeName)) {
    throw new ClientConfigError(`Record type is not permitted: ${recordTypeName}`);
  }

  const allowedFields = sanitizeFieldList(sf.allowedFields, 'allowedFields');
  const queryFields = Array.isArray(sf.queryFields) ? sanitizeFieldList(sf.queryFields, 'queryFields') : undefined;
  const updateFields = Array.isArray(sf.updateFields) ? sanitizeFieldList(sf.updateFields, 'updateFields') : undefined;
  const eventQueryFields = Array.isArray(sf.eventQueryFields) ? sanitizeFieldList(sf.eventQueryFields, 'eventQueryFields') : undefined;

  let campaignField: string | undefined;
  if (sf.campaignField !== undefined && sf.campaignField !== null && sf.campaignField !== '') {
    try {
      campaignField = assertSafeSoqlIdentifier(sf.campaignField, 'campaignField');
    } catch (err: any) {
      throw new ClientConfigError(err.message);
    }
  }

  const campaignRecordTypeName = asTrimmedString(sf.campaignRecordTypeName, 80) || undefined;

  let codeLength: number | undefined;
  if (sf.codeLength !== undefined && sf.codeLength !== null) {
    const n = Number(sf.codeLength);
    if (!Number.isInteger(n) || n < 4 || n > 32) {
      throw new ClientConfigError('salesforce.codeLength must be an integer between 4 and 32');
    }
    codeLength = n;
  }

  const salesforceMapping = sanitizeMapping(raw.salesforceMapping);

  const formFields = Array.isArray(raw.formFields)
    ? raw.formFields.filter((f: any) => typeof f === 'string').map((f: string) => f.trim().slice(0, 100)).filter(Boolean)
    : undefined;

  const orgName = asTrimmedString(raw.terms?.orgName, 120);

  const notificationEmails =
    raw.notificationEmails !== undefined ? raw.notificationEmails :
    raw.notificationEmail !== undefined ? raw.notificationEmail :
    undefined;

  const config: FormConfig = {
    id,
    name,
    version: asTrimmedString(raw.version, 32) || '1.0.0',
    phases: {},
    defaultPhase: '',
    fieldMetadata: {},
    salesforceMapping,
    salesforce: {
      objectName: FORM_OBJECT_NAME,
      recordTypeName,
      allowedFields,
      queryFields,
      updateFields,
      searchField: FORM_CODE_FIELD,
      lookupCodeField: FORM_CODE_FIELD,
      lookupEmailField: FORM_EMAIL_FIELD,
      campaignField,
      campaignRecordTypeName,
      eventQueryFields,
      codeGenerationEnabled: true,
      codeLength,
      skipContactCreation: sf.skipContactCreation === true,
    },
  };

  if (formFields) config.formFields = formFields;
  if (orgName) config.terms = { orgName };
  if (notificationEmails !== undefined) config.notificationEmails = notificationEmails;

  return config;
}
