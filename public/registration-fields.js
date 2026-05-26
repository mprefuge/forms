window.REGISTRATION_FIELDS = [
  { Name: 'FirstName', Type: 'String', LabelKey: 'firstName', SalesforceID: 'FirstName__c', Required: true },
  { Name: 'LastName', Type: 'String', LabelKey: 'lastName', SalesforceID: 'LastName__c', Required: true },
  { Name: 'Email', Type: 'Email', LabelKey: 'email', SalesforceID: 'Email__c', Required: true },
  { Name: 'Phone', Type: 'Phone', LabelKey: 'phone', SalesforceID: 'Phone__c', Required: true },
  { Name: 'Birthdate', Type: 'Date', LabelKey: 'birthdate', SalesforceID: 'Birthdate__c' },
  { Name: 'NativeCountry', Type: 'String', LabelKey: 'nativeCountry', UseCustomData: true },
  { Name: 'Street', Type: 'String', LabelKey: 'street', SalesforceID: 'Street__c' },
  { Name: 'City', Type: 'String', LabelKey: 'city', SalesforceID: 'City__c' },
  { Name: 'State', Type: 'String', LabelKey: 'state', SalesforceID: 'State__c' },
  { Name: 'Zip', Type: 'String', LabelKey: 'zip', SalesforceID: 'Zip__c' },
  { Name: 'Country', Type: 'String', LabelKey: 'country', SalesforceID: 'Country__c' },
  { Name: 'Location', Type: 'String', LabelKey: 'location', UseCustomData: true },
  { Name: 'Church', Type: 'String', LabelKey: 'church', UseCustomData: true },
  { Name: 'Role', Type: 'String', LabelKey: 'role', UseCustomData: true },
  { Name: 'Type', Type: 'Hidden', UseCustomData: true, Hidden: true },
  { Name: 'HowHeard', Type: 'String', LabelKey: 'howHeard', PlaceholderKey: 'howHeardPlaceholder', UseCustomData: true },
  {
    Name: 'Interest',
    Type: 'Dropdown',
    LabelKey: 'interest',
    UseCustomData: true,
    Values: [
      { Value: '', LabelKey: 'selectOption' },
      { Value: 'Registering your children for school', LabelKey: 'optionRegisterChildren' },
      { Value: 'Bible study in Spanish', LabelKey: 'optionBibleStudy' },
      { Value: 'Citizenship classes', LabelKey: 'optionCitizenship' }
    ]
  },
  {
    Name: 'KTAPProgram',
    Type: 'Dropdown',
    LabelKey: 'ktap',
    UseCustomData: true,
    Values: [
      { Value: '', LabelKey: 'selectOption' },
      { Value: 'Yes', LabelKey: 'yes' },
      { Value: 'No', LabelKey: 'no' }
    ]
  },
  {
    Name: 'SNAPProgram',
    Type: 'Dropdown',
    LabelKey: 'snap',
    UseCustomData: true,
    Values: [
      { Value: '', LabelKey: 'selectOption' },
      { Value: 'Yes', LabelKey: 'yes' },
      { Value: 'No', LabelKey: 'no' }
    ]
  },
  { Name: 'Comments', Type: 'TextArea', LabelKey: 'comments', PlaceholderKey: 'commentsPlaceholder', SalesforceID: 'Comments__c' },
  { Name: 'ReceiveUpdates', Type: 'Boolean', LabelKey: 'receiveUpdates' },
  { Name: 'CustomData', Type: 'JSON', SalesforceID: 'Custom__c', Hidden: true }
];
