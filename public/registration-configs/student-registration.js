window.REGISTRATION_FORM_CONFIGS = window.REGISTRATION_FORM_CONFIGS || {};
window.REGISTRATION_FORM_CONFIGS['Student Registration'] = {
  TitleKey: 'studentRegistrationTitle',
  SubtitleKey: 'studentRegistrationSubtitle',
  Translations: {
    en: {
      studentRegistrationTitle: 'Student Registration',
      studentRegistrationSubtitle: 'Complete the student registration details below.',
    },
    es: {
      studentRegistrationTitle: 'Registro de estudiante',
      studentRegistrationSubtitle: 'Complete a continuación los datos de registro del estudiante.',
    },
  },
  NotificationEmail: '',
  Fields: ['FirstName', 'LastName', 'Email', 'Phone', 'Birthdate', 'NativeCountry', 'Location', 'HowHeard', 'Interest', 'KTAPProgram', 'SNAPProgram', 'Comments', 'ReceiveUpdates'],
  RequiredFields: ['Location']
};
