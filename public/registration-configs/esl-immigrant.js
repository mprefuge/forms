window.REGISTRATION_FORM_CONFIGS = window.REGISTRATION_FORM_CONFIGS || {};
window.REGISTRATION_FORM_CONFIGS['ESL Immigrant Form'] = {
  TitleKey: 'eslImmigrantTitle',
  Translations: {
    en: {
      eslImmigrantTitle: 'ESL Immigrant Form',
      receiveUpdates: 'Sign up for news and updates',
      whyLearnEnglish: 'Why do you want to learn English and how will this help you adjust to your home in the U.S.?',
      originAndFirstLanguage: 'What is your country of origin and first language? *This information will only be used in the process of pairing you with an English Mentor.',
      gender: 'Gender',
      selectOption: 'Select an option',
      optionMale: 'Male',
      optionFemale: 'Female',
    },
    es: {
      eslImmigrantTitle: 'Formulario de ESL para inmigrantes',
      receiveUpdates: 'Suscríbase para recibir noticias y actualizaciones',
      whyLearnEnglish: '¿Por qué desea aprender inglés y cómo le ayudará esto a adaptarse a su hogar en los EE. UU.?',
      originAndFirstLanguage: '¿Cuál es su país de origen y su lengua materna? *Esta información solo se utilizará en el proceso de emparejarlo con un mentor de inglés.',
      gender: 'Género',
      optionMale: 'Masculino',
      optionFemale: 'Femenino',
    },
  },
  NotificationEmail: '',
  Fields: ['FirstName', 'LastName', 'Email', 'ReceiveUpdates', 'PhoneOptional', 'WhyLearnEnglish', 'OriginAndFirstLanguage', 'Gender'],
  RequiredFields: ['WhyLearnEnglish', 'Gender'],
};
