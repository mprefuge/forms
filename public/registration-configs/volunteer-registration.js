window.REGISTRATION_FORM_CONFIGS = window.REGISTRATION_FORM_CONFIGS || {};
window.REGISTRATION_FORM_CONFIGS['Volunteer Registration'] = {
  TitleKey: 'volunteerRegistrationTitle',
  SubtitleKey: 'volunteerRegistrationSubtitle',
  Translations: {
    en: {
      volunteerRegistrationTitle: 'Volunteer Registration',
      volunteerRegistrationSubtitle: 'Complete the volunteer registration form below.',
    },
    es: {
      volunteerRegistrationTitle: 'Registro de voluntario',
      volunteerRegistrationSubtitle: 'Complete el siguiente formulario de registro para voluntarios.',
    },
  },
  Fields: ['FirstName', 'LastName', 'Email', 'Phone', 'Birthdate', 'Street', 'City', 'State', 'Zip', 'Country', 'Location', 'Comments', 'ReceiveUpdates'],
  RequiredFields: ['Location']
};
