/**
 * FormConfigTypes.ts
 * 
 * Comprehensive type definitions for form configurations.
 * This allows each form to have its own complete configuration including:
 * - UI structure (phases, steps, fields)
 * - Field metadata and validation
 * - Salesforce mappings
 * - Email templates
 * - Terms and labels (multi-language support ready)
 */

export interface FieldMetadata {
  label: string;
  type: 'text' | 'email' | 'tel' | 'date' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'file';
  required?: boolean;
  options?: string[]; // For select/multiselect
  accept?: string; // For file uploads (e.g., ".pdf,.jpg")
  nillable?: boolean;
  createable?: boolean;
}

export interface SalesforceFieldMapping {
  [clientFieldName: string]: string; // e.g., "FirstName" -> "FirstName__c"
}

export interface SalesforceConfig {
  objectName: string; // e.g., "Form__c"
  recordTypeName: string; // e.g., "Volunteer" - will be resolved to ID at runtime
  allowedFields: string[]; // Whitelist of fields that can be written
  
  // Salesforce field specifications
  queryFields?: string[]; // Fields to retrieve when reading forms (default: all allowedFields)
  updateFields?: string[]; // Fields that can be updated (subset of allowedFields, default: all allowedFields)
  searchField?: string; // Field to use for searching forms (default: FormCode__c)
  
  // Email and code fields
  lookupEmailField?: string; // Field to use for email lookups (default: Email__c)
  lookupCodeField?: string; // Field to use for form code lookups (default: FormCode__c)
  
  // Campaign association
  campaignField?: string; // Field to use for campaign association (e.g., Campaign__c)

  // Event (Campaign) metadata retrieval
  eventQueryFields?: string[]; // Fields to retrieve from Campaign when eventId is provided (e.g., ['Id','Name','StartDate','EndDate','Description'])
  
  // Code generation
  codeGenerationEnabled?: boolean; // Whether to auto-generate form codes
  codeLength?: number; // Length of generated code (default: 5)
  
  // Contact management
  skipContactCreation?: boolean; // Skip contact matching and creation for this form type (e.g., for waivers where form submission is sufficient)
}

export interface FormStep {
  title: string;
  description: string;
  fields: string[]; // Field keys that appear in this step
  estimatedTime?: number; // Minutes
}

export interface FormPhase {
  name: string;
  description?: string;
  estimatedTime?: number; // Total minutes
  steps: FormStep[];
  adminOnly?: boolean; // Whether only admins see this phase
}

export interface EmailTemplate {
  subject: string;
  text: string; // Plain text version
  html: string; // HTML version
  includeFormCode?: boolean;
  includeApplicantName?: boolean;
  variables?: string[]; // Template variables like {{applicantName}}, {{formCode}}
}

export interface OrganizationTerms {
  orgName: string;
  labels?: { [fieldKey: string]: string };
  stepTitles?: { [stepTitle: string]: string };
  phaseNames?: { [phaseKey: string]: string };
  statementOfFaithUrl?: string;
}

export interface FormConfig {
  id: string; // Unique form identifier (e.g., "volunteer", "donor")
  name: string; // Display name
  description?: string;
  version: string; // Config version for tracking changes
  
  // UI Structure
  phases: { [phaseKey: string]: FormPhase }; // Keyed by phase ID
  defaultPhase: string; // Which phase to start with
  
  // Field Definitions
  fieldMetadata: { [fieldKey: string]: FieldMetadata };
  salesforceMapping: SalesforceFieldMapping;
  
  // Salesforce Configuration
  salesforce: SalesforceConfig;
  
  // Organization Customization
  terms?: OrganizationTerms;
  
  // Email Templates
  emailTemplates?: {
    applicationCode?: EmailTemplate;
    applicationSubmitted?: EmailTemplate;
    [customTemplate: string]: EmailTemplate | undefined;
  };
  
  // Advanced Features
  features?: {
    allowFileUploads?: boolean;
    allowComments?: boolean;
    multiLanguageSupport?: string[]; // Language codes
    progressTracking?: boolean;
  };
  
  // Styling
  styling?: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
  };
}
