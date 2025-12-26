/**
 * genericFormConfig.ts
 * 
 * Generic fallback configuration when no form-specific config is provided.
 * This provides minimal sensible defaults for any form.
 * 
 * Specific forms should provide their own configuration via JavaScript files.
 */

import { FormConfig } from './formConfigTypes';

export const genericFormConfig: FormConfig = {
  id: 'general',
  name: 'General Form',
  description: 'Generic form configuration fallback',
  version: '1.0.0',

  phases: {
    initial: {
      name: 'Form',
      description: 'Complete the form',
      estimatedTime: 10,
      steps: [
        {
          title: 'Information',
          description: 'Provide your information',
          fields: [],
        },
      ],
    },
  },

  defaultPhase: 'initial',

  fieldMetadata: {},
  salesforceMapping: {},

  salesforce: {
    objectName: 'Form__c',
    recordTypeName: 'General',
    allowedFields: [
      'FirstName__c',
      'LastName__c',
      'Email__c',
      'Phone__c',
      'FormCode__c',
    ],
    queryFields: [
      'Id',
      'FormCode__c',
      'FirstName__c',
      'LastName__c',
      'Email__c',
      'CreatedDate',
    ],
    updateFields: [],
    searchField: 'FormCode__c',
    lookupEmailField: 'Email__c',
    lookupCodeField: 'FormCode__c',
    codeGenerationEnabled: true,
    codeLength: 5,
  },

  terms: {
    orgName: 'Organization',
  },

  emailTemplates: {
    applicationCode: {
      subject: 'Your Application Code',
      text: 'Your application code is: {{formCode}}',
      html: '<p>Your application code is: <strong>{{formCode}}</strong></p>',
      includeFormCode: true,
    },
  },

  features: {
    allowFileUploads: false,
    allowComments: false,
    progressTracking: false,
  },
};
