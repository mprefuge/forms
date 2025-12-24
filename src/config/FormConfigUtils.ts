/**
 * FormConfigUtils.ts
 * 
 * Utility functions for working with form configurations.
 * Provides helpers for field mapping, validation, and template rendering.
 */

import { FormConfig, FieldMetadata } from './formConfigTypes';

/**
 * Get the Salesforce field name for a client-side field
 */
export function getSalesforceFieldName(formConfig: FormConfig, clientFieldName: string): string {
  const sfName = formConfig.salesforceMapping[clientFieldName];
  if (!sfName) {
    throw new Error(`No Salesforce mapping found for field: ${clientFieldName}`);
  }
  return sfName;
}

/**
 * Get the client-side field name for a Salesforce field
 */
export function getClientFieldName(formConfig: FormConfig, sfFieldName: string): string {
  for (const [clientName, sfName] of Object.entries(formConfig.salesforceMapping)) {
    if (sfName === sfFieldName) {
      return clientName;
    }
  }
  throw new Error(`No client field mapping found for Salesforce field: ${sfFieldName}`);
}

/**
 * Check if a field is defined in the form configuration
 */
export function fieldExists(formConfig: FormConfig, clientFieldName: string): boolean {
  return !!(formConfig.fieldMetadata[clientFieldName] && formConfig.salesforceMapping[clientFieldName]);
}

/**
 * Get field metadata
 */
export function getFieldMetadata(formConfig: FormConfig, clientFieldName: string): FieldMetadata | null {
  return formConfig.fieldMetadata[clientFieldName] || null;
}

/**
 * Get all fields for a specific step
 */
export function getStepFields(
  formConfig: FormConfig,
  phaseKey: string,
  stepIndex: number
): { key: string; metadata: FieldMetadata }[] {
  const phase = formConfig.phases[phaseKey];
  if (!phase || !phase.steps[stepIndex]) {
    throw new Error(`Phase '${phaseKey}' step ${stepIndex} not found`);
  }

  const step = phase.steps[stepIndex];
  return step.fields.map(fieldKey => ({
    key: fieldKey,
    metadata: formConfig.fieldMetadata[fieldKey],
  }));
}

/**
 * Get all fields for a specific phase
 */
export function getPhaseFields(formConfig: FormConfig, phaseKey: string): string[] {
  const phase = formConfig.phases[phaseKey];
  if (!phase) {
    throw new Error(`Phase '${phaseKey}' not found`);
  }

  const fields = new Set<string>();
  phase.steps.forEach(step => {
    step.fields.forEach(field => fields.add(field));
  });
  return Array.from(fields);
}

/**
 * Get all Salesforce field names for a phase
 */
export function getPhaseSalesforceFields(formConfig: FormConfig, phaseKey: string): string[] {
  return getPhaseFields(formConfig, phaseKey).map(clientField =>
    getSalesforceFieldName(formConfig, clientField)
  );
}

/**
 * Render an email template with variables
 */
export function renderEmailTemplate(
  template: string,
  variables: { [key: string]: string | undefined }
): string {
  let result = template;

  // Replace {{variable}} with values
  Object.entries(variables).forEach(([key, value]) => {
    if (value !== undefined) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }
  });

  // Remove any unreplaced variables
  result = result.replace(/{{[^}]+}}/g, '');

  return result;
}

/**
 * Get required fields for a phase
 */
export function getRequiredFields(formConfig: FormConfig, phaseKey: string): string[] {
  return getPhaseFields(formConfig, phaseKey).filter(fieldKey => {
    const metadata = formConfig.fieldMetadata[fieldKey];
    return metadata?.required === true;
  });
}

/**
 * Validate form data against field metadata
 */
export function validateFormData(
  formConfig: FormConfig,
  formData: { [key: string]: any },
  phaseKey?: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // If phaseKey is specified, only validate fields in that phase
  const fieldsToValidate = phaseKey ? getPhaseFields(formConfig, phaseKey) : Object.keys(formConfig.fieldMetadata);

  fieldsToValidate.forEach(fieldKey => {
    const metadata = formConfig.fieldMetadata[fieldKey];
    const value = formData[fieldKey];

    // Check required fields
    if (metadata.required && (value === undefined || value === null || value === '')) {
      errors.push(`${metadata.label} is required`);
    }

    // Type validation
    if (value !== undefined && value !== null && value !== '') {
      if (metadata.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        errors.push(`${metadata.label} must be a valid email address`);
      }

      if (metadata.type === 'tel' && !/^\+?[\d\s\-()]+$/.test(String(value))) {
        errors.push(`${metadata.label} must be a valid phone number`);
      }

      if (metadata.type === 'date') {
        try {
          new Date(value);
        } catch {
          errors.push(`${metadata.label} must be a valid date`);
        }
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Filter form data to only include fields that are in the Salesforce allowlist
 */
export function filterAllowedFields(
  formConfig: FormConfig,
  formData: { [key: string]: any }
): { [key: string]: any } {
  const allowedSalesforceFields = new Set(formConfig.salesforce.allowedFields);
  const filtered: { [key: string]: any } = {};
  const hasMapping = formConfig.salesforceMapping && Object.keys(formConfig.salesforceMapping).length > 0;

  Object.entries(formData).forEach(([fieldName, value]) => {
    if (hasMapping) {
      // Data is in client format, map to Salesforce format
      const sfFieldName = formConfig.salesforceMapping[fieldName];
      if (sfFieldName && allowedSalesforceFields.has(sfFieldName)) {
        filtered[fieldName] = value;
      }
    } else {
      // Data is already in Salesforce format, filter directly
      if (allowedSalesforceFields.has(fieldName)) {
        filtered[fieldName] = value;
      }
    }
  });

  return filtered;
}

/**
 * Convert client field data to Salesforce field data
 */
export function convertToSalesforceFormat(
  formConfig: FormConfig,
  formData: { [clientFieldName: string]: any }
): { [sfFieldName: string]: any } {
  const sfData: { [key: string]: any } = {};
  const hasMapping = formConfig.salesforceMapping && Object.keys(formConfig.salesforceMapping).length > 0;

  if (!hasMapping) {
    // Data is already in Salesforce format, return as-is
    return { ...formData };
  }

  Object.entries(formData).forEach(([clientFieldName, value]) => {
    const sfFieldName = formConfig.salesforceMapping[clientFieldName];
    if (sfFieldName) {
      sfData[sfFieldName] = value;
    }
  });

  return sfData;
}

/**
 * Convert Salesforce field data to client field data
 */
export function convertFromSalesforceFormat(
  formConfig: FormConfig,
  sfData: { [sfFieldName: string]: any }
): { [clientFieldName: string]: any } {
  const clientData: { [key: string]: any } = {};

  Object.entries(sfData).forEach(([sfFieldName, value]) => {
    // Try to find the client field name in the mapping
    for (const [clientName, mappedSfName] of Object.entries(formConfig.salesforceMapping)) {
      if (mappedSfName === sfFieldName) {
        clientData[clientName] = value;
        return;
      }
    }

    // If no mapping found, keep the original field name
    clientData[sfFieldName] = value;
  });

  return clientData;
}
/**
 * Build a SOQL SELECT clause based on form configuration
 * Queries the fields specified in salesforce.queryFields, or all allowedFields if not specified
 */
export function buildSoqlSelectClause(formConfig: FormConfig): string {
  const fieldsToQuery = formConfig.salesforce.queryFields || formConfig.salesforce.allowedFields;
  
  // Always include Id if not already present
  const uniqueFields = Array.from(new Set(['Id', ...fieldsToQuery]));
  
  return uniqueFields.join(', ');
}

/**
 * Build a complete SOQL query to fetch a form record
 * @param formConfig Form configuration with object and field specs
 * @param searchValue The value to search for (e.g., form code)
 * @returns SOQL query string
 */
export function buildSoqlQuery(formConfig: FormConfig, searchValue: string): string {
  const objectName = formConfig.salesforce.objectName || 'Form__c';
  const searchField = formConfig.salesforce.searchField || formConfig.salesforce.lookupCodeField || 'FormCode__c';
  const selectClause = buildSoqlSelectClause(formConfig);
  
  // Escape single quotes in search value for SOQL
  const escapedValue = String(searchValue).replace(/'/g, "\\'");
  
  return `SELECT ${selectClause} FROM ${objectName} WHERE ${searchField} = '${escapedValue}' LIMIT 1`;
}

/**
 * Build SOQL query to search by any field
 * @param formConfig Form configuration
 * @param searchField Field name to search by
 * @param searchValue Value to search for
 * @returns SOQL query string
 */
export function buildSoqlQueryByField(formConfig: FormConfig, searchField: string, searchValue: string): string {
  const objectName = formConfig.salesforce.objectName || 'Form__c';
  const selectClause = buildSoqlSelectClause(formConfig);
  
  // Escape single quotes in search value for SOQL
  const escapedValue = String(searchValue).replace(/'/g, "\\'");
  
  return `SELECT ${selectClause} FROM ${objectName} WHERE ${searchField} = '${escapedValue}' LIMIT 1`;
}

/**
 * Get the list of fields that can be updated for a form
 * Uses salesforce.updateFields if specified, otherwise uses all allowedFields
 */
export function getUpdateableFields(formConfig: FormConfig): string[] {
  return formConfig.salesforce.updateFields || formConfig.salesforce.allowedFields;
}

/**
 * Filter form data to only include fields that can be updated
 */
export function filterUpdateableFields(
  formConfig: FormConfig,
  formData: { [key: string]: any }
): { [key: string]: any } {
  const updateableFields = getUpdateableFields(formConfig);
  const filtered: { [key: string]: any } = {};
  
  for (const field of updateableFields) {
    if (formData[field] !== undefined && formData[field] !== null) {
      filtered[field] = formData[field];
    }
  }
  
  return filtered;
}