(() => {
  const config = window.FORMS_CONFIG || {};
  const ENDPOINT = config.apiEndpoint || "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form";
  const HOST_ID = "registration-app";
  const LOOKUP_URL = 'https://mprefuge.github.io/site-assets/scripts/lookup.js';

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
    // Fall back to window.FORMS_CONFIG (e.g. { type: 'esl-immigrant', language: 'es' })
    // so the form can be configured entirely in JS. This makes a fully self-contained
    // embed possible, where the scripts are inlined and have no src/data-* attributes.
    const configValue = (config && config[name] != null && config[name] !== '') ? config[name] : null;
    return scriptValue || urlParams.get(name) || configValue || '';
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

  const LANGUAGE_ALIASES = {
    en: 'en',
    english: 'en',
    es: 'es',
    spanish: 'es',
    espanol: 'es',
    'español': 'es',
  };

  const BASE_TRANSLATIONS = (window.REGISTRATION_TRANSLATIONS && typeof window.REGISTRATION_TRANSLATIONS === 'object')
    ? window.REGISTRATION_TRANSLATIONS
    : {};
  const customTranslations = (config && typeof config.registrationTranslations === 'object' && config.registrationTranslations)
    ? config.registrationTranslations
    : {};
  const translationLanguages = Array.from(new Set(['en', ...Object.keys(BASE_TRANSLATIONS), ...Object.keys(customTranslations)]));
  const translations = translationLanguages.reduce((acc, key) => {
    acc[key] = { ...(BASE_TRANSLATIONS.en || {}), ...(BASE_TRANSLATIONS[key] || {}), ...(customTranslations[key] || {}) };
    return acc;
  }, {});

  const normalizeLanguage = (raw) => {
    const cleaned = (raw || '').toString().trim().toLowerCase();
    if (!cleaned) return 'en';
    if (translations[cleaned] || customTranslations[cleaned]) return cleaned;
    if (LANGUAGE_ALIASES[cleaned]) return LANGUAGE_ALIASES[cleaned];
    const base = cleaned.split(/[-_]/)[0];
    return LANGUAGE_ALIASES[base] || 'en';
  };

  const language = normalizeLanguage(getParam('language'));
  const baseCopy = translations[language] || translations.en || {};
  let copy = baseCopy;

  const fieldsList = Array.isArray(window.REGISTRATION_FIELDS) ? window.REGISTRATION_FIELDS : [];
  const fieldDefinitions = fieldsList.reduce((acc, field) => {
    if (field && field.Name) acc[field.Name] = field;
    return acc;
  }, {});
  const formsRegistry = (window.REGISTRATION_FORMS && typeof window.REGISTRATION_FORMS === 'object')
    ? window.REGISTRATION_FORMS
    : { defaultForm: 'Generic Contact', aliases: {}, forms: {} };
  const formConfigCache = window.REGISTRATION_FORM_CONFIGS = window.REGISTRATION_FORM_CONFIGS || {};
  const loadedConfigFiles = new Set();
  let lookupPromise = null;

  const normalizeFormName = (raw) => {
    const cleaned = (raw || '').toString().trim();
    if (!cleaned) return formsRegistry.defaultForm || 'Generic Contact';
    const lowered = cleaned.toLowerCase();
    if (formsRegistry.aliases && formsRegistry.aliases[lowered]) return formsRegistry.aliases[lowered];
    const direct = Object.keys(formsRegistry.forms || {}).find((name) => name.toLowerCase() === lowered);
    return direct || formsRegistry.defaultForm || 'Generic Contact';
  };

  const activeFormName = normalizeFormName(getParam('type'));

  const loadScript = (relativePath) => new Promise((resolve, reject) => {
    if (!relativePath) {
      reject(new Error('Missing form configuration path'));
      return;
    }
    if (loadedConfigFiles.has(relativePath)) {
      resolve();
      return;
    }
    const base = scriptEl && scriptEl.src ? scriptEl.src : window.location.href;
    const script = document.createElement('script');
    script.src = new URL(relativePath, base).toString();
    script.onload = () => {
      loadedConfigFiles.add(relativePath);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${relativePath}`));
    document.head.appendChild(script);
  });

  const ensureFormConfigLoaded = async (formName) => {
    if (formConfigCache[formName]) return formConfigCache[formName];
    const fileName = formsRegistry.forms && formsRegistry.forms[formName];
    if (!fileName) throw new Error(`No form configuration registered for ${formName}`);
    await loadScript(fileName);
    if (!formConfigCache[formName]) throw new Error(`Form configuration ${formName} did not register itself`);
    return formConfigCache[formName];
  };

  const loadLookup = () => {
    if (lookupPromise) return lookupPromise;
    lookupPromise = new Promise((resolve) => {
      if (window.lookup) {
        resolve(window.lookup);
        return;
      }
      const script = document.createElement('script');
      script.src = LOOKUP_URL;
      script.onload = () => resolve(window.lookup || {});
      script.onerror = () => resolve({});
      document.head.appendChild(script);
    });
    return lookupPromise;
  };

  const normalizeLookupOptions = (rawOptions) => {
    if (!Array.isArray(rawOptions)) return [];
    return rawOptions.map((option) => {
      if (option === null || option === undefined) return null;
      if (typeof option === 'string') return { Value: option, Label: option };
      const value = option.value ?? option.code ?? option.id ?? option.name ?? option.label ?? String(option);
      const label = option.label ?? option.name ?? option.value ?? option.code ?? String(option);
      if (!String(value).trim()) return null;
      return { Value: String(value), Label: String(label) };
    }).filter(Boolean);
  };

  const applyLookupOptions = (lookup) => {
    if (!lookup) return;
    const lookupMap = {
      Country: 'countries',
      NativeCountry: 'countries',
    };

    Object.entries(lookupMap).forEach(([fieldName, lookupKey]) => {
      const field = fieldDefinitions[fieldName];
      const options = normalizeLookupOptions(lookup[lookupKey]);
      if (!field || options.length === 0) return;
      field.Type = 'Dropdown';
      field.Values = [
        { Value: '', LabelKey: 'selectOption' },
        ...options,
      ];
    });
  };

  const collectSalesforceFields = () => {
    const allowed = [];
    Object.values(fieldDefinitions).forEach((field) => {
      if (field && field.SalesforceID && !allowed.includes(field.SalesforceID)) allowed.push(field.SalesforceID);
    });
    return allowed;
  };

  const SALESFORCE_FIELDS = Array.from(new Set([
    ...collectSalesforceFields(),
    'CurrentStatus__c',
    'Campaign__c',
  ]));
  const FORM_CONFIG = {
    id: 'registration',
    name: activeFormName,
    salesforce: {
      objectName: 'Form__c',
      recordTypeName: 'Registration',
      allowedFields: SALESFORCE_FIELDS,
      queryFields: ['Id', 'FormCode__c', ...SALESFORCE_FIELDS.filter((field) => field !== 'FormCode__c')],
      updateFields: [],
      searchField: 'FormCode__c',
      lookupEmailField: 'Email__c',
      campaignField: 'Campaign__c',
      campaignRecordTypeName: 'Registration',
    }
  };

  const EMAIL_TEMPLATES = {
    applicationCopy: {
      subject: 'Registration received',
      text: 'Hello {{FirstName__c}},\n\nYour registration has been received. Your confirmation code is {{FormCode__c}}.\n\nThank you,\nRefuge International',
      html: '<p>Hello {{FirstName__c}},</p><p>Your registration has been received. Your confirmation code is <strong>{{FormCode__c}}</strong>.</p><p>Thank you,<br/>Refuge International</p>'
    }
  };

  const buildInitialFormData = () => ({
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
    Type: activeFormName,
    HowHeard: '',
    Interest: '',
    KTAPProgram: '',
    SNAPProgram: '',
    Comments: '',
    ReceiveUpdates: true,
    CustomData: '',
  });

  let activeFormConfig = null;
  let styleVariant = null;
  let state = {
    formData: buildInitialFormData(),
    loading: false,
    initializing: true,
    error: null,
    status: null,
    formCode: null,
  };

  const getContainer = () => document.getElementById(HOST_ID);

  const resolveFormTranslations = (formConfig) => {
    if (!formConfig || typeof formConfig.Translations !== 'object' || !formConfig.Translations) return {};
    return {
      ...(formConfig.Translations.en || {}),
      ...(formConfig.Translations[language] || {}),
    };
  };

  const syncCopyWithFormConfig = () => {
    copy = { ...baseCopy, ...resolveFormTranslations(activeFormConfig) };
  };

  const getFormTitle = () => {
    if (!activeFormConfig) return activeFormName;
    return copy[activeFormConfig.TitleKey] || activeFormConfig.Title || activeFormName;
  };

  const getCampaignName = () => {
    return state.formData.Type || activeFormName;
  };

  const getNotificationEmails = () => {
    if (!activeFormConfig || typeof activeFormConfig !== 'object') return undefined;
    if (Array.isArray(activeFormConfig.NotificationEmails) && activeFormConfig.NotificationEmails.length) {
      return activeFormConfig.NotificationEmails;
    }
    if (typeof activeFormConfig.NotificationEmails === 'string' && activeFormConfig.NotificationEmails.trim()) {
      return activeFormConfig.NotificationEmails.trim();
    }
    if (typeof activeFormConfig.NotificationEmail === 'string' && activeFormConfig.NotificationEmail.trim()) {
      return activeFormConfig.NotificationEmail.trim();
    }
    return undefined;
  };

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

  const getFieldLabel = (field) => copy[field.LabelKey] || field.Label || field.Name;
  const getFieldPlaceholder = (field) => field.PlaceholderKey ? (copy[field.PlaceholderKey] || field.Placeholder || '') : (field.Placeholder || '');

  const buildOptions = (field) => {
    const raw = Array.isArray(field.Values) ? field.Values : [];
    return raw.map((option) => {
      if (typeof option === 'string') return { value: option, label: option };
      const value = Object.prototype.hasOwnProperty.call(option, 'Value') ? option.Value : '';
      const label = option.LabelKey ? (copy[option.LabelKey] || option.Label || value) : (option.Label || value);
      return { value, label };
    });
  };

  const getCanonicalDropdownValue = (field, rawValue) => {
    const options = buildOptions(field);
    const match = options.find((option) => option.value === rawValue || option.label === rawValue);
    return match ? match.value : rawValue;
  };

  const isFieldRequired = (fieldName) => getRequiredFieldNames().includes(fieldName);

  const buildFieldLabel = (field, id) => {
    const showHint = styleVariant === 'minimal' && isFieldRequired(field.Name);
    return h('label', { for: id },
      getFieldLabel(field),
      showHint ? h('span', { className: 'ri-required-hint', text: ' (required)' }) : null
    );
  };

  const buildField = (fieldName) => {
    const field = fieldDefinitions[fieldName];
    if (!field || field.Hidden) return null;
    const id = `registration-${field.Name}`;
    const name = field.SalesforceID || field.Name;

    if (field.Type === 'Boolean') {
      const checkbox = h('input', {
        id,
        type: 'checkbox',
        checked: !!state.formData[field.Name],
        onchange: (event) => updateField(field.Name, !!event.target.checked),
      });
      return h('div', { className: 'ri-field ri-field-checkbox' },
        h('div', { className: 'ri-checkbox' },
          checkbox,
          h('label', { for: id, text: getFieldLabel(field) })
        )
      );
    }

    const shared = {
      id,
      name,
      placeholder: getFieldPlaceholder(field),
      value: state.formData[field.Name] || '',
      oninput: (event) => updateField(field.Name, event.target.value),
    };

    let input;
    if (field.Type === 'TextArea') {
      input = h('textarea', shared);
    } else if (field.Type === 'Dropdown') {
      input = h('select', {
        ...shared,
        className: (state.formData[field.Name] || '') ? null : 'ri-select-empty',
        onchange: (event) => {
          updateField(field.Name, getCanonicalDropdownValue(field, event.target.value));
          event.target.classList.toggle('ri-select-empty', !event.target.value);
        },
      }, buildOptions(field).map((option) => h('option', {
        value: option.value,
        selected: option.value === (state.formData[field.Name] || '') ? 'selected' : null,
      }, option.label)));
    } else {
      const type = field.Type === 'Email' ? 'email' : field.Type === 'Phone' ? 'tel' : field.Type === 'Date' ? 'date' : 'text';
      input = h('input', { ...shared, type });
    }

    return h('div', { className: 'ri-field' },
      buildFieldLabel(field, id),
      input
    );
  };

  const buildFormFields = () => {
    const names = getVisibleFieldNames();
    if (styleVariant !== 'minimal') {
      return h('div', { className: 'ri-grid ri-grid-two' }, names.map(buildField).filter(Boolean));
    }

    // Minimal variant: single column, with First/Last name grouped under a heading.
    const hasFirst = names.includes('FirstName');
    const hasLast = names.includes('LastName');
    const consumed = new Set();
    const container = h('div', { className: 'ri-grid ri-form-fields' });

    names.forEach((fieldName) => {
      if (consumed.has(fieldName)) return;
      if (fieldName === 'FirstName' && hasLast) {
        consumed.add('FirstName');
        consumed.add('LastName');
        container.appendChild(
          h('div', { className: 'ri-name-group' },
            h('div', { className: 'ri-group-heading', text: copy.nameGroup || 'Name' }),
            h('div', { className: 'ri-grid ri-grid-two ri-name-fields' },
              buildField('FirstName'),
              buildField('LastName')
            )
          )
        );
        return;
      }
      if (fieldName === 'LastName' && hasFirst) {
        // Rendered alongside FirstName in the name group.
        return;
      }
      const field = buildField(fieldName);
      if (field) container.appendChild(field);
    });

    return container;
  };

  const getVisibleFieldNames = () => {
    if (!activeFormConfig || !Array.isArray(activeFormConfig.Fields)) return [];
    return activeFormConfig.Fields.filter((fieldName) => fieldDefinitions[fieldName] && !fieldDefinitions[fieldName].Hidden);
  };

  const getRequiredFieldNames = () => {
    const explicit = Array.isArray(activeFormConfig && activeFormConfig.RequiredFields) ? activeFormConfig.RequiredFields : [];
    return getVisibleFieldNames().filter((fieldName) => explicit.includes(fieldName) || !!fieldDefinitions[fieldName].Required);
  };

  const validate = () => {
    const missing = getRequiredFieldNames().filter((fieldName) => !String(state.formData[fieldName] || '').trim());
    if (!missing.length) return null;
    return `${copy.requiredPrefix} ${missing.map((fieldName) => getFieldLabel(fieldDefinitions[fieldName])).join(', ')}`;
  };

  const buildPayload = () => {
    const payload = {};
    const customData = {};
    const notificationEmails = getNotificationEmails();

    Object.values(fieldDefinitions).forEach((field) => {
      const value = state.formData[field.Name];
      const isBoolean = typeof value === 'boolean';
      const hasValue = isBoolean || !(value === '' || value === null || value === undefined);
      if (!hasValue) return;

      if (field.UseCustomData) {
        customData[field.CustomDataKey || field.Name] = value;
        if (!field.PersistSeparately) return;
      }

      if (field.SalesforceID) payload[field.SalesforceID] = value;
      else if (!field.Hidden) payload[field.Name] = value;
    });

    if (notificationEmails) {
      if (Array.isArray(notificationEmails)) customData.NotificationEmails = notificationEmails;
      else customData.NotificationEmail = notificationEmails;
    }

    if (Object.keys(customData).length > 0 && fieldDefinitions.CustomData && fieldDefinitions.CustomData.SalesforceID) {
      payload[fieldDefinitions.CustomData.SalesforceID] = JSON.stringify(customData);
    }

    return payload;
  };

  const submitForm = async () => {
    const validationError = validate();
    if (validationError) {
      setState({ error: validationError });
      return;
    }

    setState({ loading: true, error: null });

    try {
      const payload = buildPayload();
      const submissionStatus = activeFormConfig && Object.prototype.hasOwnProperty.call(activeFormConfig, 'SubmissionStatus')
        ? activeFormConfig.SubmissionStatus
        : 'Submitted';
      if (typeof submissionStatus === 'string' && submissionStatus.trim()) {
        payload.CurrentStatus__c = submissionStatus.trim();
      }
      const campaignId = getParam('campaignId') || getParam('eventId') || '';
      if (campaignId) {
        payload.__eventId = campaignId;
        if (FORM_CONFIG.salesforce && FORM_CONFIG.salesforce.campaignField) {
          payload[FORM_CONFIG.salesforce.campaignField] = campaignId;
        }
      } else {
        const campaignName = getCampaignName();
        if (campaignName) {
          payload.__campaignName = campaignName;
        }
      }
      payload.__formConfig = {
        ...FORM_CONFIG,
        name: getFormTitle() || activeFormName,
        formFields: Array.isArray(activeFormConfig && activeFormConfig.Fields) ? activeFormConfig.Fields : [],
        salesforce: {
          ...FORM_CONFIG.salesforce,
          recordTypeName: activeFormConfig?.RecordTypeName || FORM_CONFIG.salesforce.recordTypeName,
          campaignRecordTypeName: activeFormConfig?.CampaignRecordTypeName || FORM_CONFIG.salesforce.campaignRecordTypeName,
        },
      };
      payload.__sendEmail = true;
      payload.__emailTemplates = EMAIL_TEMPLATES;

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

  const renderForm = () => {
    const title = getFormTitle();
    const subtitle = copy[activeFormConfig.SubtitleKey] || activeFormConfig.Subtitle || '';
    const images = Array.isArray(activeFormConfig.Images) ? activeFormConfig.Images : [];
    return h('div', { className: 'ri-card' },
      images.length ? h('div', { className: images.length > 1 ? 'ri-form-media-grid' : 'ri-form-media' },
        images.map((image, index) => h('figure', { className: 'ri-form-media-item' },
          h('img', {
            src: image.src,
            alt: image.alt || title || `Form image ${index + 1}`,
            loading: 'lazy',
            decoding: 'async'
          }),
          image.caption ? h('figcaption', { className: 'ri-form-media-caption', text: image.caption }) : null
        ))
      ) : null,
      h('div', { className: 'ri-header-copy' },
        h('h1', { className: 'ri-title', text: title }),
        subtitle ? h('p', { className: 'ri-subtitle', text: subtitle }) : null
      ),
      state.error ? h('div', { className: 'ri-alert ri-alert-error', text: state.error }) : null,
      buildFormFields(),
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
  };

  const renderLoading = () => h('div', { className: 'ri-card' },
    h('div', { className: 'ri-header-copy' },
      h('h1', { className: 'ri-title', text: copy.loadingForm })
    )
  );

  const renderInitError = () => h('div', { className: 'ri-card' },
    h('div', { className: 'ri-header-copy' },
      h('h1', { className: 'ri-title', text: copy.submitError }),
      state.error ? h('p', { className: 'ri-subtitle', text: state.error }) : null
    )
  );

  const render = () => {
    const root = getContainer();
    if (!root) return;
    document.documentElement.lang = language;
    if (copy.documentTitle) document.title = copy.documentTitle;
    root.innerHTML = '';
    root.className = styleVariant ? `ri-app ri-variant-${styleVariant}` : 'ri-app';

    if (state.status === 'success') {
      root.appendChild(renderSuccess());
      return;
    }
    if (!state.initializing && !activeFormConfig) {
      root.appendChild(renderInitError());
      return;
    }
    if (state.initializing || !activeFormConfig) {
      root.appendChild(renderLoading());
      return;
    }
    root.appendChild(renderForm());
  };

  const initializeApp = async () => {
    if (!document.getElementById(HOST_ID)) {
      setTimeout(initializeApp, 50);
      return;
    }

    try {
      const [formConfig, lookup] = await Promise.all([
        ensureFormConfigLoaded(activeFormName),
        loadLookup(),
      ]);
      activeFormConfig = formConfig;
      styleVariant = (formConfig && typeof formConfig.StyleVariant === 'string') ? formConfig.StyleVariant : null;
      applyLookupOptions(lookup);
      syncCopyWithFormConfig();
      state = { ...state, formData: buildInitialFormData(), initializing: false };
      render();
    } catch (error) {
      copy = baseCopy;
      state = { ...state, initializing: false, error: error.message || copy.submitError };
      render();
    }
  };

  if (typeof window !== 'undefined') {
    window.__ri_registration = {
      render,
      resetState: () => {
        state = {
          formData: buildInitialFormData(),
          loading: false,
          initializing: false,
          error: null,
          status: null,
          formCode: null,
        };
        render();
      },
      getState: () => state,
      getLanguage: () => language,
      getActiveFormType: () => activeFormName,
    };
  }

  render();
  initializeApp();
})();
