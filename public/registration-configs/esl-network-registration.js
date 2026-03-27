window.REGISTRATION_FORM_CONFIGS = window.REGISTRATION_FORM_CONFIGS || {};
window.REGISTRATION_FORM_CONFIGS['ESL Network Registration'] = {
  TitleKey: 'eslNetworkRegistrationTitle',
  SubtitleKey: 'eslNetworkRegistrationSubtitle',
  Translations: {
    en: {
      eslNetworkRegistrationTitle: 'ESL Network Registration',
      eslNetworkRegistrationSubtitle: 'Complete the ESL Network registration details below.',
    },
    es: {
      eslNetworkRegistrationTitle: 'Registro de ESL Network',
      eslNetworkRegistrationSubtitle: 'Complete a continuación los detalles de registro de ESL Network.',
    },
  },
  NotificationEmail: '',
  Fields: ['FirstName', 'LastName', 'Email', 'Phone', 'Birthdate', 'NativeCountry', 'Location', 'HowHeard', 'Interest', 'KTAPProgram', 'SNAPProgram', 'Comments', 'ReceiveUpdates'],
  RequiredFields: ['Location']
};
