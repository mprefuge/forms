window.REGISTRATION_FORM_CONFIGS = window.REGISTRATION_FORM_CONFIGS || {};
window.REGISTRATION_FORM_CONFIGS['Event Registration'] = {
  TitleKey: 'eventRegistrationTitle',
  SubtitleKey: 'eventRegistrationSubtitle',
  Translations: {
    en: {
      eventRegistrationTitle: 'Event Registration',
      eventRegistrationSubtitle: 'Complete the form below to register for this event.',
    },
    es: {
      eventRegistrationTitle: 'Registro de evento',
      eventRegistrationSubtitle: 'Complete el siguiente formulario para registrarse en este evento.',
    },
  },
  Fields: ['FirstName', 'LastName', 'Email', 'Phone', 'Location', 'Comments', 'ReceiveUpdates'],
  RequiredFields: ['Location']
};
