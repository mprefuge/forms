/**
 * testFormConfig.ts
 * 
 * Test form configuration used in unit tests.
 * Mirrors the structure used by JavaScript forms.
 */

export const testFormConfig = {
  id: 'test',
  name: 'Test Form',
  salesforce: {
    objectName: 'Form__c',
    recordTypeName: 'Test',
    allowedFields: [
      'FirstName__c',
      'LastName__c',
      'Email__c',
      'Phone__c',
      'RecordType',
      'FormCode__c',
      'Country__c',
      'Skills__c',
      'Church__c',
      'AdditionalNotes__c',
      'AffirmStatementOfFaith__c',
      'Availability__c',
      'Birthdate__c',
    ],
    queryFields: [
      'Id',
      'FormCode__c',
      'FirstName__c',
      'LastName__c',
      'Email__c',
      'Phone__c',
      'CreatedDate',
    ],
    updateFields: [
      'Phone__c',
      'Country__c',
      'Skills__c',
    ],
    searchField: 'FormCode__c',
    lookupEmailField: 'Email__c',
    lookupCodeField: 'FormCode__c',
    codeGenerationEnabled: true,
    codeLength: 5,
  },
  salesforceMapping: {
    FirstName: 'FirstName__c',
    LastName: 'LastName__c',
    Email: 'Email__c',
    Phone: 'Phone__c',
    Country: 'Country__c',
    Skills: 'Skills__c',
    Church: 'Church__c',
  },
};
