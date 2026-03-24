(() => {
  const config = window.FORMS_CONFIG || {};
  const ENDPOINT = config.apiEndpoint || "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form";
  const HOST_ID = "registration-app";

  const findScriptElement = () => {
    try {
      if (document.currentScript) return document.currentScript;
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      return scripts.reverse().find((script) => /registration\.js(\?|$)/i.test(script.getAttribute('src') || '')) || null;
    } catch (e) {
      return null;
    }
  };

  const scriptEl = findScriptElement();
  const urlParams = new URLSearchParams(window.location.search);
  const getParam = (name) => {
    const scriptValue = scriptEl ? (scriptEl.getAttribute(name) || scriptEl.getAttribute(`data-${name}`)) : null;
    return scriptValue || urlParams.get(name) || '';
  };

  const LANGUAGE_ALIASES = {
    en: 'en',
    english: 'en',
    es: 'es',
    spanish: 'es',
    espanol: 'es',
    español: 'es',
    fr: 'fr',
    french: 'fr',
    francais: 'fr',
    français: 'fr',
    pt: 'pt',
    portuguese: 'pt',
    portugues: 'pt',
    português: 'pt',
    ar: 'ar',
    arabic: 'ar',
  };

  const TRANSLATIONS = {
    en: {
      documentTitle: 'Registration Form - Refuge International',
      formTitle: 'Registration Form',
      formSubtitle: 'Complete the form below to register.',
      contactSection: 'Contact Information',
      detailsSection: 'Registration Details',
      firstName: 'First Name',
      lastName: 'Last Name',
      email: 'Email',
      phone: 'Phone',
      birthdate: 'Date of Birth',
      nativeCountry: 'Native Country',
      street: 'Street Address',
      city: 'City',
      state: 'State/Province',
      zip: 'Postal Code',
      country: 'Country/Region',
      location: 'Location',
      type: 'Type',
      howHeard: 'How did you hear about this ESL program?',
      howHeardPlaceholder: 'Tell us how you heard about this ESL program',
      interest: 'What are you interested in?',
      ktap: 'Do you participate in or need documentation for the KTAP program?',
      snap: 'Do you participate in or need documentation for the SNAP Program?',
      selectOption: 'Select one',
      optionRegisterChildren: 'Registering your children for school',
      optionBibleStudy: 'Bible study in Spanish',
      optionCitizenship: 'Citizenship classes',
      yes: 'Yes',
      no: 'No',
      comments: 'Comments',
      commentsPlaceholder: 'Anything else we should know?',
      receiveUpdates: 'I agree to receive periodic updates from Refuge International',
      submit: 'Submit Registration',
      submitting: 'Submitting...',
      successTitle: 'Registration submitted successfully',
      successBody: 'Please save your confirmation code for your records.',
      confirmationCode: 'Confirmation Code',
      requiredPrefix: 'Please fill in required fields:',
      submitError: 'Failed to submit. Please try again.',
    },
    es: {
      documentTitle: 'Formulario de registro - Refuge International',
      formTitle: 'Formulario de registro',
      formSubtitle: 'Complete el siguiente formulario para registrarse.',
      contactSection: 'Información de contacto',
      detailsSection: 'Detalles del registro',
      firstName: 'Nombre',
      lastName: 'Apellido',
      email: 'Correo electrónico',
      phone: 'Teléfono',
      birthdate: 'Fecha de nacimiento',
      nativeCountry: 'País de origen',
      street: 'Dirección',
      city: 'Ciudad',
      state: 'Estado/Provincia',
      zip: 'Código postal',
      country: 'País/Región',
      location: 'Ubicación',
      type: 'Tipo',
      howHeard: '¿Cómo se enteró de este programa de ESL?',
      howHeardPlaceholder: 'Cuéntenos cómo se enteró de este programa de ESL',
      interest: '¿Qué le interesa?',
      ktap: '¿Participa en el programa KTAP o necesita documentación para ese programa?',
      snap: '¿Participa en el programa SNAP o necesita documentación para ese programa?',
      selectOption: 'Seleccione una opción',
      optionRegisterChildren: 'Inscribir a sus hijos en la escuela',
      optionBibleStudy: 'Estudio bíblico en español',
      optionCitizenship: 'Clases de ciudadanía',
      yes: 'Sí',
      no: 'No',
      comments: 'Comentarios',
      commentsPlaceholder: '¿Hay algo más que debamos saber?',
      receiveUpdates: 'Acepto recibir actualizaciones periódicas de Refuge International',
      submit: 'Enviar registro',
      submitting: 'Enviando...',
      successTitle: 'Registro enviado correctamente',
      successBody: 'Guarde su código de confirmación para sus registros.',
      confirmationCode: 'Código de confirmación',
      requiredPrefix: 'Complete los campos obligatorios:',
      submitError: 'No se pudo enviar el formulario. Inténtelo de nuevo.',
    },
    fr: {
      documentTitle: 'Formulaire d’inscription - Refuge International',
      formTitle: 'Formulaire d’inscription',
      formSubtitle: 'Remplissez le formulaire ci-dessous pour vous inscrire.',
      contactSection: 'Coordonnées',
      detailsSection: 'Détails de l’inscription',
      firstName: 'Prénom',
      lastName: 'Nom',
      email: 'E-mail',
      phone: 'Téléphone',
      birthdate: 'Date de naissance',
      nativeCountry: 'Pays d’origine',
      street: 'Adresse',
      city: 'Ville',
      state: 'État/Province',
      zip: 'Code postal',
      country: 'Pays/Région',
      location: 'Lieu',
      type: 'Type',
      howHeard: 'Comment avez-vous entendu parler de ce programme d’anglais langue seconde ?',
      howHeardPlaceholder: 'Dites-nous comment vous avez entendu parler de ce programme ESL',
      interest: 'Qu’est-ce qui vous intéresse ?',
      ktap: 'Participez-vous au programme KTAP ou avez-vous besoin de documents pour ce programme ?',
      snap: 'Participez-vous au programme SNAP ou avez-vous besoin de documents pour ce programme ?',
      selectOption: 'Sélectionnez une option',
      optionRegisterChildren: 'Inscrire vos enfants à l’école',
      optionBibleStudy: 'Étude biblique en espagnol',
      optionCitizenship: 'Cours de citoyenneté',
      yes: 'Oui',
      no: 'Non',
      comments: 'Commentaires',
      commentsPlaceholder: 'Y a-t-il autre chose que nous devrions savoir ?',
      receiveUpdates: 'J’accepte de recevoir des mises à jour périodiques de Refuge International',
      submit: 'Envoyer l’inscription',
      submitting: 'Envoi en cours...',
      successTitle: 'Inscription envoyée avec succès',
      successBody: 'Veuillez conserver votre code de confirmation.',
      confirmationCode: 'Code de confirmation',
      requiredPrefix: 'Veuillez renseigner les champs obligatoires :',
      submitError: 'Échec de l’envoi. Veuillez réessayer.',
    },
    pt: {
      documentTitle: 'Formulário de inscrição - Refuge International',
      formTitle: 'Formulário de inscrição',
      formSubtitle: 'Preencha o formulário abaixo para se inscrever.',
      contactSection: 'Informações de contato',
      detailsSection: 'Detalhes da inscrição',
      firstName: 'Nome',
      lastName: 'Sobrenome',
      email: 'E-mail',
      phone: 'Telefone',
      birthdate: 'Data de nascimento',
      nativeCountry: 'País de origem',
      street: 'Endereço',
      city: 'Cidade',
      state: 'Estado/Província',
      zip: 'Código postal',
      country: 'País/Região',
      location: 'Local',
      type: 'Tipo',
      howHeard: 'Como você soube deste programa de ESL?',
      howHeardPlaceholder: 'Conte-nos como você soube deste programa de ESL',
      interest: 'No que você tem interesse?',
      ktap: 'Você participa do programa KTAP ou precisa de documentação para esse programa?',
      snap: 'Você participa do programa SNAP ou precisa de documentação para esse programa?',
      selectOption: 'Selecione uma opção',
      optionRegisterChildren: 'Matricular seus filhos na escola',
      optionBibleStudy: 'Estudo bíblico em espanhol',
      optionCitizenship: 'Aulas de cidadania',
      yes: 'Sim',
      no: 'Não',
      comments: 'Comentários',
      commentsPlaceholder: 'Há mais alguma coisa que devemos saber?',
      receiveUpdates: 'Concordo em receber atualizações periódicas da Refuge International',
      submit: 'Enviar inscrição',
      submitting: 'Enviando...',
      successTitle: 'Inscrição enviada com sucesso',
      successBody: 'Guarde seu código de confirmação.',
      confirmationCode: 'Código de confirmação',
      requiredPrefix: 'Preencha os campos obrigatórios:',
      submitError: 'Não foi possível enviar. Tente novamente.',
    },
    ar: {
      documentTitle: 'نموذج التسجيل - Refuge International',
      formTitle: 'نموذج التسجيل',
      formSubtitle: 'أكمل النموذج أدناه لإتمام التسجيل.',
      contactSection: 'معلومات الاتصال',
      detailsSection: 'تفاصيل التسجيل',
      firstName: 'الاسم الأول',
      lastName: 'اسم العائلة',
      email: 'البريد الإلكتروني',
      phone: 'الهاتف',
      birthdate: 'تاريخ الميلاد',
      nativeCountry: 'البلد الأصلي',
      street: 'العنوان',
      city: 'المدينة',
      state: 'الولاية/المقاطعة',
      zip: 'الرمز البريدي',
      country: 'الدولة/المنطقة',
      location: 'الموقع',
      type: 'النوع',
      howHeard: 'كيف سمعت عن برنامج ESL هذا؟',
      howHeardPlaceholder: 'أخبرنا كيف سمعت عن برنامج ESL هذا',
      interest: 'بماذا تهتم؟',
      ktap: 'هل تشارك في برنامج KTAP أو تحتاج إلى مستندات لهذا البرنامج؟',
      snap: 'هل تشارك في برنامج SNAP أو تحتاج إلى مستندات لهذا البرنامج؟',
      selectOption: 'اختر خيارًا',
      optionRegisterChildren: 'تسجيل أطفالك في المدرسة',
      optionBibleStudy: 'دراسة الكتاب المقدس بالإسبانية',
      optionCitizenship: 'دروس المواطنة',
      yes: 'نعم',
      no: 'لا',
      comments: 'ملاحظات',
      commentsPlaceholder: 'هل هناك أي شيء آخر يجب أن نعرفه؟',
      receiveUpdates: 'أوافق على تلقي تحديثات دورية من Refuge International',
      submit: 'إرسال التسجيل',
      submitting: 'جارٍ الإرسال...',
      successTitle: 'تم إرسال التسجيل بنجاح',
      successBody: 'يرجى حفظ رمز التأكيد لسجلاتك.',
      confirmationCode: 'رمز التأكيد',
      requiredPrefix: 'يرجى إكمال الحقول المطلوبة:',
      submitError: 'تعذر إرسال النموذج. حاول مرة أخرى.',
    },
  };

  const customTranslations = (config && typeof config.registrationTranslations === 'object' && config.registrationTranslations)
    ? config.registrationTranslations
    : {};
  const translations = Object.keys(customTranslations).reduce((acc, key) => {
    acc[key] = { ...(TRANSLATIONS.en || {}), ...(TRANSLATIONS[key] || {}), ...(customTranslations[key] || {}) };
    return acc;
  }, { ...TRANSLATIONS });

  const normalizeLanguage = (raw) => {
    const cleaned = (raw || '').toString().trim().toLowerCase();
    if (!cleaned) return 'en';
    if (translations[cleaned]) return cleaned;
    if (LANGUAGE_ALIASES[cleaned]) return LANGUAGE_ALIASES[cleaned];
    const base = cleaned.split(/[-_]/)[0];
    if (translations[base]) return base;
    return LANGUAGE_ALIASES[base] || 'en';
  };

  const language = normalizeLanguage(getParam('language'));
  const copy = translations[language] || TRANSLATIONS.en;
  const isRtl = language === 'ar';

  const EMAIL_TEMPLATES = {
    applicationCopy: {
      subject: 'Registration received',
      text: 'Hello {{FirstName__c}},\n\nYour registration has been received. Your confirmation code is {{FormCode__c}}.\n\nThank you,\nRefuge International',
      html: '<p>Hello {{FirstName__c}},</p><p>Your registration has been received. Your confirmation code is <strong>{{FormCode__c}}</strong>.</p><p>Thank you,<br/>Refuge International</p>'
    }
  };

  const FORM_CONFIG = {
    id: 'registration',
    name: 'Registration Form',
    salesforce: {
      objectName: 'Form__c',
      recordTypeName: 'Registration',
      allowedFields: [
        'FirstName__c', 'LastName__c', 'Email__c', 'Phone__c',
        'Birthdate__c', 'CountryOfOrigin__c',
        'Street__c', 'City__c', 'State__c', 'Zip__c', 'Country__c',
        'Location__c', 'Type__c', 'HowHeard__c', 'Interest__c',
        'KTAPProgram__c', 'SNAPProgram__c', 'Comments__c'
      ],
      queryFields: [
        'Id', 'FormCode__c', 'FirstName__c', 'LastName__c', 'Email__c',
        'Phone__c', 'Birthdate__c', 'CountryOfOrigin__c', 'Location__c', 'Type__c',
        'HowHeard__c', 'Interest__c', 'KTAPProgram__c', 'SNAPProgram__c', 'CreatedDate'
      ],
      updateFields: [],
      searchField: 'FormCode__c',
      lookupEmailField: 'Email__c'
    }
  };

  const fieldOrder = [
    'FirstName',
    'LastName',
    'Email',
    'Phone',
    'Birthdate',
    'NativeCountry',
    'Street',
    'City',
    'State',
    'Zip',
    'Country',
    'Location',
    'Type',
    'HowHeard',
    'Interest',
    'KTAPProgram',
    'SNAPProgram',
    'Comments',
    'ReceiveUpdates',
  ];

  const fieldMeta = {
    FirstName: { label: copy.firstName, type: 'text', required: true },
    LastName: { label: copy.lastName, type: 'text', required: true },
    Email: { label: copy.email, type: 'email', required: true },
    Phone: { label: copy.phone, type: 'tel', required: true },
    Birthdate: { label: copy.birthdate, type: 'date', required: false },
    NativeCountry: { label: copy.nativeCountry, type: 'text', required: false },
    Street: { label: copy.street, type: 'text', required: false },
    City: { label: copy.city, type: 'text', required: false },
    State: { label: copy.state, type: 'text', required: false },
    Zip: { label: copy.zip, type: 'text', required: false },
    Country: { label: copy.country, type: 'text', required: false },
    Location: { label: copy.location, type: 'text', required: true },
    Type: { label: copy.type, type: 'text', required: true },
    HowHeard: { label: copy.howHeard, type: 'text', required: false, placeholder: copy.howHeardPlaceholder },
    Interest: {
      label: copy.interest,
      type: 'select',
      required: false,
      options: [
        { value: '', label: copy.selectOption },
        { value: copy.optionRegisterChildren, label: copy.optionRegisterChildren },
        { value: copy.optionBibleStudy, label: copy.optionBibleStudy },
        { value: copy.optionCitizenship, label: copy.optionCitizenship },
      ],
    },
    KTAPProgram: {
      label: copy.ktap,
      type: 'select',
      required: false,
      options: [
        { value: '', label: copy.selectOption },
        { value: copy.yes, label: copy.yes },
        { value: copy.no, label: copy.no },
      ],
    },
    SNAPProgram: {
      label: copy.snap,
      type: 'select',
      required: false,
      options: [
        { value: '', label: copy.selectOption },
        { value: copy.yes, label: copy.yes },
        { value: copy.no, label: copy.no },
      ],
    },
    Comments: { label: copy.comments, type: 'textarea', required: false, placeholder: copy.commentsPlaceholder },
    ReceiveUpdates: { label: copy.receiveUpdates, type: 'checkbox', required: false },
  };

  const fieldToSf = {
    FirstName: 'FirstName__c',
    LastName: 'LastName__c',
    Email: 'Email__c',
    Phone: 'Phone__c',
    Birthdate: 'Birthdate__c',
    NativeCountry: 'CountryOfOrigin__c',
    Street: 'Street__c',
    City: 'City__c',
    State: 'State__c',
    Zip: 'Zip__c',
    Country: 'Country__c',
    Location: 'Location__c',
    Type: 'Type__c',
    HowHeard: 'HowHeard__c',
    Interest: 'Interest__c',
    KTAPProgram: 'KTAPProgram__c',
    SNAPProgram: 'SNAPProgram__c',
    Comments: 'Comments__c',
  };

  const initialFormData = {
    FirstName: '',
    LastName: '',
    Email: '',
    Phone: '',
    Birthdate: '',
    NativeCountry: '',
    Street: '',
    City: '',
    State: '',
    Zip: '',
    Country: '',
    Location: getParam('location'),
    Type: getParam('type'),
    HowHeard: '',
    Interest: '',
    KTAPProgram: '',
    SNAPProgram: '',
    Comments: '',
    ReceiveUpdates: true,
  };

  let state = {
    formData: { ...initialFormData },
    loading: false,
    error: null,
    status: null,
    formCode: null,
  };

  const injectCSS = () => {
    try {
      const activeScript = findScriptElement();
      if (!activeScript) return;
      const cssHref = new URL("./registration.css", activeScript.src).toString();
      const exists = Array.from(document.styleSheets).some((sheet) => sheet.href && sheet.href.includes("registration.css"));
      if (exists) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      document.head.appendChild(link);
    } catch (e) {
      console.warn("CSS injection skipped", e);
    }
  };
  injectCSS();

  const getContainer = () => document.getElementById(HOST_ID);

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (key === 'className') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'checked') el.checked = !!value;
      else if (key === 'value') el.value = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else el.setAttribute(key, String(value));
    });
    children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false).forEach((child) => {
      if (typeof child === 'string' || typeof child === 'number') el.appendChild(document.createTextNode(String(child)));
      else el.appendChild(child);
    });
    return el;
  };

  const setState = (updates) => {
    state = { ...state, ...updates };
    render();
  };

  const updateField = (key, value) => {
    state.formData = { ...state.formData, [key]: value };
  };

  const buildField = (key) => {
    const meta = fieldMeta[key];
    const id = `registration-${key}`;

    if (meta.type === 'checkbox') {
      const checkbox = h('input', {
        id,
        type: 'checkbox',
        checked: !!state.formData[key],
        onchange: (event) => updateField(key, !!event.target.checked),
      });
      return h('div', { className: 'ri-field ri-field-checkbox' },
        h('div', { className: 'ri-checkbox' },
          checkbox,
          h('label', { for: id, text: meta.label })
        )
      );
    }

    const shared = {
      id,
      name: fieldToSf[key] || key,
      placeholder: meta.placeholder || '',
      value: state.formData[key] || '',
      dir: isRtl ? 'rtl' : 'ltr',
      oninput: (event) => updateField(key, event.target.value),
    };

    let input;
    if (meta.type === 'textarea') {
      input = h('textarea', shared);
    } else if (meta.type === 'select') {
      input = h('select', {
        ...shared,
        onchange: (event) => updateField(key, event.target.value),
      }, (meta.options || []).map((option) => h('option', {
        value: option.value,
        selected: option.value === (state.formData[key] || '') ? 'selected' : null,
      }, option.label)));
    } else {
      input = h('input', { ...shared, type: meta.type });
    }

    return h('div', { className: 'ri-field' },
      h('label', { for: id, text: meta.label }),
      input
    );
  };

  const validate = () => {
    const missing = fieldOrder.filter((key) => fieldMeta[key].required && !String(state.formData[key] || '').trim());
    if (!missing.length) return null;
    return `${copy.requiredPrefix} ${missing.map((key) => fieldMeta[key].label).join(', ')}`;
  };

  const submitForm = async () => {
    const validationError = validate();
    if (validationError) {
      setState({ error: validationError });
      return;
    }

    setState({ loading: true, error: null });

    try {
      const payload = {};
      Object.entries(state.formData).forEach(([clientKey, value]) => {
        if (value === '' || value === null || value === undefined) return;
        const sfKey = fieldToSf[clientKey];
        if (sfKey) payload[sfKey] = value;
        else payload[clientKey] = value;
      });

      payload.__formConfig = FORM_CONFIG;
      payload.__sendEmail = true;
      payload.__emailTemplates = EMAIL_TEMPLATES;
      payload.__language = language;
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) payload.__clientTimeZone = tz;
      } catch (e) {}

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || copy.submitError);

      setState({
        loading: false,
        status: 'success',
        formCode: result.formCode || '',
      });
    } catch (error) {
      setState({
        loading: false,
        error: error.message || copy.submitError,
      });
    }
  };

  const renderSuccess = () => h('div', { className: 'ri-card ri-success-card' },
    h('h1', { className: 'ri-title', text: copy.successTitle }),
    h('p', { className: 'ri-subtitle', text: copy.successBody }),
    h('div', { className: 'ri-confirmation-block' },
      h('div', { className: 'ri-confirmation-label', text: copy.confirmationCode }),
      h('div', { className: 'ri-confirmation-code', text: state.formCode || '' })
    )
  );

  const renderForm = () => h('div', { className: 'ri-card' },
    h('div', { className: 'ri-header-copy' },
      h('h1', { className: 'ri-title', text: copy.formTitle }),
      h('p', { className: 'ri-subtitle', text: copy.formSubtitle })
    ),
    state.error ? h('div', { className: 'ri-alert ri-alert-error', text: state.error }) : null,
    h('div', { className: 'ri-section' },
      h('h2', { className: 'ri-section-title', text: copy.contactSection }),
      h('div', { className: 'ri-grid ri-grid-two' },
        buildField('FirstName'),
        buildField('LastName'),
        buildField('Email'),
        buildField('Phone'),
        buildField('Birthdate'),
        buildField('NativeCountry'),
        buildField('Street'),
        buildField('City'),
        buildField('State'),
        buildField('Zip'),
        buildField('Country')
      )
    ),
    h('div', { className: 'ri-section' },
      h('h2', { className: 'ri-section-title', text: copy.detailsSection }),
      h('div', { className: 'ri-grid ri-grid-two' },
        buildField('Location'),
        buildField('Type'),
        buildField('Interest'),
        buildField('KTAPProgram'),
        buildField('SNAPProgram')
      ),
      buildField('HowHeard'),
      buildField('Comments'),
      buildField('ReceiveUpdates')
    ),
    h('div', { className: 'ri-actions' },
      h('button', {
        type: 'button',
        className: 'ri-btn ri-btn-primary',
        onclick: submitForm,
        disabled: state.loading ? 'disabled' : null,
        text: state.loading ? copy.submitting : copy.submit,
      })
    )
  );

  const render = () => {
    const root = getContainer();
    if (!root) return;
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    if (document.title) document.title = copy.documentTitle;
    root.innerHTML = '';
    root.className = 'ri-app';
    root.appendChild(state.status === 'success' ? renderSuccess() : renderForm());
  };

  const initializeApp = () => {
    if (!document.getElementById(HOST_ID)) {
      setTimeout(initializeApp, 50);
      return;
    }
    render();
  };

  if (typeof window !== 'undefined') {
    window.__ri_registration = {
      render,
      resetState: () => {
        state = {
          formData: { ...initialFormData },
          loading: false,
          error: null,
          status: null,
          formCode: null,
        };
        render();
      },
      getState: () => state,
      getLanguage: () => language,
    };
  }

  initializeApp();
})();
