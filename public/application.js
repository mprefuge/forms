(() => {
  const ENDPOINT = "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form";
  const HOST_ID = "volunteer-app";
  // Public link to the Statement of Faith (opened in a new tab)
  const STATEMENT_URL = "https://static1.squarespace.com/static/5af0bc3a96d45593d7d7e55b/t/675251913102604777fd712c/1733448082026/Refuge+International+Statement+Of+Faith-Rev.+9_25_23.pdf";


  // Organization terminology (labels/titles). Terms are static and defined here
  let orgTerms = {
    orgName: "Refuge International",
    labels: {
      Zip: "Postal Code",
      State: "State/Province",
      Country: "Country/Region",
      ChurchServingDetails: "How are you involved in your church?",
      GospelDetails: "Briefly Share the Gospel",
      TestimonyDetails: "Briefly Share Your Testimony",
      PreferredServingArea: "Primary Area of Interest",
    },
    stepTitles: {
      "Basic Information": "Contact Information",
      "Church & Ministry": "Church Information",
      "What You'd Like to Do": "Areas to Serve",
      "Your Faith Journey": "Your Beliefs",
      "Commitments & Agreement": "Agreements",
    },
    phaseNames: {
      initial: "Volunteer Application",
      supplemental: "Supplemental Documents",
      review: "Review",
      placement: "Placement"
    }
  };

  // Organization terminology is static (defined in `orgTerms`) and not fetched from the backend.



  const injectCSS = () => {
    try {
      const scriptEl = document.currentScript;
      if (!scriptEl) return;
      const cssHref = new URL("./application.css", scriptEl.src).toString();
      const exists = Array.from(document.styleSheets).some(ss => ss.href && ss.href.includes("application.css"));
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

  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el[k] = v;
      else if (k === "for") el.htmlFor = v;
      else if (k === "checked") el.checked = !!v;
      else if (k === "value") el.value = v;
      else if (k === "disabled") el.disabled = !!v;
      else el.setAttribute(k, v);
    });
    kids.flat().forEach(k => { if (k !== null && k !== undefined) el.append(k); });
    return el;
  };

  const phases = {
    initial: {
      name: "Application",
      description: "Tell us about yourself and your interest in serving",
      estimatedTime: 15, // minutes
      steps: [
        { title: "Basic Information", description: "Your name and contact details", fields: ["Salutation","FirstName","LastName","Email","Phone"] },
        { title: "Personal Details", description: "Background and language preferences", fields: ["Birthdate","Street","City","State","Zip","Country","LanguagesSpoken","CountryOfOrigin","Gender","MaritalStatus"] },
        { title: "Church Information", description: "Tell us about your church", fields: ["Church","ChurchServingDetails","PastorSalutation","PastorFirstName","PastorLastName","PastorEmail"] },
        { title: "Emergency Contact", description: "Who should we reach out to in case of an emergency?", fields: ["EmergencyContactFirstName","EmergencyContactLastName","EmergencyContactRelationship","EmergencyContactPhone"] },
        { title: "What You'd Like to Do", description: "Your serving interests and availability", fields: ["ServingInterest","PreferredServingArea","Skills","Availability"] },
        { title: "Your Faith Journey", description: "Tell us about your faith", fields: ["GospelDetails","TestimonyDetails"] },
        { title: "Commitments & Agreement", description: "Confirmations and next steps", fields: ["AffirmStatementOfFaith","WillPay","MinistrySafeCompleted","AdditionalNotes","HowHeard"] },
      ]
    },
    supplemental: {
      name: "Document Review (Admin)",
      description: "Review and verification documents",
      estimatedTime: 10,
      steps: [
        { title: "Pastoral Reference Review", description: "Status and notes from pastoral reference", fields: ["PastoralReferenceStatus","PastoralReferenceNotes"] },
        { title: "Background Check", description: "Background screening results", fields: ["BackgroundCheckStatus","BackgroundCheckDate","BackgroundCheckNotes"] },
        { title: "Additional Documents", description: "Any other relevant information", fields: ["AdditionalDocumentsNotes"] },
      ]
    },
    placement: {
      name: "Placement (Admin)",
      description: "Volunteer placement details",
      estimatedTime: 5,
      steps: [
        { title: "Placement Details", description: "Assignment and start date", fields: ["PlacementArea","PlacementStartDate","PlacementNotes"] },
      ]
    }
  };

  let currentPhase = 'initial';
  const steps = phases[currentPhase].steps;

  const fieldMeta = {
    Salutation: { label: "Salutation", type: "select", options: [], required: false },
    FirstName: { label: "First Name", type: "text", required: true },
    LastName: { label: "Last Name", type: "text", required: true },
    Email: { label: "Email", type: "email", required: true },
    Phone: { label: "Phone", type: "tel", required: true },
    Gender: { label: "Gender", type: "select", options: ["Male","Female"], required: true },
    MaritalStatus: { label: "Marital Status", type: "select", options: [], required: false },
    Country: { label: "Country/Region", type: "select", options: [], required: true },
    CountryOfOrigin: { label: "Country of Origin", type: "select", options: [], required: true },
    PrimaryLanguage: { label: "Primary Language", type: "select", options: [], required: false },
    LanguagesSpoken: { label: "Languages Spoken", type: "multiselect", options: [], required: true },
    Skills: { label: "What gifts/skills do you have?", type: "multiselect", options: [], required: false },
    Church: { label: "Church Name", type: "text", required: true },
    ChurchServingDetails: { label: "Church Involvement", type: "textarea", required: false },
    HowHeard: { label: "How did you hear about Refuge International?", type: "select", options: [], required: false },
    ServingInterest: { label: "Which areas are you interested in serving?", type: "multiselect", options: [], required: true },
    PreferredServingArea: { label: "Primary Area of Interest", type: "select", options: [], required: false },
    GospelDetails: { label: "Share the Gospel (in your own words)", type: "textarea", required: true },
    TestimonyDetails: { label: "Your Faith Story", type: "textarea", required: true },
    AdditionalNotes: { label: "Additional Notes", type: "textarea", required: false },
    Availability: { label: "What is your general availability?", type: "multiselect", options: [], required: false },
    AffirmStatementOfFaith: { label: "I affirm Refuge International's Statement of Faith", type: "checkbox", required: true },
    WillPay: { label: "I am able to pay the application fee", type: "checkbox", required: false },
    Birthdate: { label: "Birthdate", type: "date", required: true },
    PastorSalutation: { label: "Salutation", type: "select", options: [], required: false },
    PastorFirstName: { label: "First Name", type: "text", required: true },
    PastorLastName: { label: "Last Name", type: "text", required: true },
    PastorEmail: { label: "Email", type: "email", required: true },
    EmergencyContactFirstName: { label: "First Name", type: "text", required: true },
    EmergencyContactLastName: { label: "Last Name", type: "text", required: true },
    EmergencyContactPhone: { label: "Phone", type: "tel", required: true },
    EmergencyContactRelationship: { label: "Relationship", type: "select", options: [], required: true },
    Street: { label: "Address", type: "text", required: true },
    City: { label: "City", type: "text", required: true },
    State: { label: "State/Province", type: "select", options: [], required: true },
    Zip: { label: "Postal Code", type: "text", required: true },
    PastoralReferenceStatus: { label: "Status", type: "select", options: ["Pending","Submitted","Approved","Declined"], required: false },
    PastoralReferenceNotes: { label: "Notes", type: "textarea", required: false },
    BackgroundCheckStatus: { label: "Status", type: "select", options: ["Not Started","In Progress","Completed","Approved","Issues"], required: false },
    BackgroundCheckDate: { label: "Completion Date", type: "date", required: false },
    BackgroundCheckNotes: { label: "Notes", type: "textarea", required: false },
    MinistrySafeCompleted: { label: "I have completed MinistrySafe training in the past 5 years", type: "checkbox", required: false },
    MinistrySafeCertificate: { label: "Upload Certificate", type: "file", accept: ".pdf,.jpg,.jpeg,.png", required: false },
    AdditionalDocumentsNotes: { label: "Additional Documents Notes", type: "textarea", required: false },
    PlacementArea: { label: "Placement Area", type: "text", required: false },
    PlacementStartDate: { label: "Start Date", type: "date", required: false },
    PlacementNotes: { label: "Placement Notes", type: "textarea", required: false },
  };

  const fieldToSf = {
    FirstName: 'FirstName__c',
    LastName: 'LastName__c',
    Email: 'Email__c',
    Phone: 'Phone__c',
    Salutation: 'Salutation__c',
    Street: 'Street__c',
    City: 'City__c',
    State: 'State__c',
    Zip: 'Zip__c',
    Country: 'Country__c',
    Gender: 'Gender__c',
    MaritalStatus: 'MaritalStatus__c',
    Birthdate: 'Birthdate__c',
    CountryOfOrigin: 'CountryOfOrigin__c',
    PrimaryLanguage: 'PrimaryLanguage__c',
    LanguagesSpoken: 'LanguagesSpoken__c',
    Skills: 'Skills__c',
    Church: 'Church__c',
    ChurchServingDetails: 'ChurchServingDetails__c',
    PastorSalutation: 'PastorSalutation__c',
    PastorFirstName: 'PastorFirstName__c',
    PastorLastName: 'PastorLastName__c',
    PastorEmail: 'PastorEmail__c',
    EmergencyContactFirstName: 'EmergencyContactFirstName__c',
    EmergencyContactLastName: 'EmergencyContactLastName__c',
    EmergencyContactPhone: 'EmergencyContactPhone__c',
    EmergencyContactRelationship: 'EmergencyContactRelationship__c',
    GospelDetails: 'GospelDetails__c',
    TestimonyDetails: 'TestimonyDetails__c',
    ServingInterest: 'ServingAreasInterest__c',
    PreferredServingArea: 'ServingAreaPrimaryInterest__c',
    Availability: 'Availability__c',
    HowHeard: 'HowHeard__c',
    WillPay: 'WillPay__c',
    AdditionalNotes: 'AdditionalNotes__c',
    AffirmStatementOfFaith: 'AffirmStatementOfFaith__c',
    PastoralReferenceStatus: 'PastoralReferenceStatus__c',
    PastoralReferenceNotes: 'PastoralReferenceNotes__c',
    BackgroundCheckStatus: 'BackgroundCheckStatus__c',
    BackgroundCheckDate: 'BackgroundCheckDate__c',
    BackgroundCheckNotes: 'BackgroundCheckNotes__c',
    MinistrySafeCompleted: 'RecentMinistrySafe__c',
    MinistrySafeCompletionDate: 'MinistrySafeCompletionDate__c',
    MinistrySafeCertificate: 'MinistrySafeCertificate__c',
    AdditionalDocumentsNotes: 'AdditionalDocumentsNotes__c',
    PlacementArea: 'PlacementArea__c',
    PlacementStartDate: 'PlacementStartDate__c',
    PlacementNotes: 'PlacementNotes__c',
    FormCode: 'FormCode__c',
    CurrentPhase: 'CurrentPhase__c'
  };

  // Inverted mapping: SF API name -> client field key (for loading responses)
  const sfToField = Object.entries(fieldToSf).reduce((acc, [k, v]) => {
    acc[v] = k;
    return acc;
  }, {});

  const data = {};
  const fileUploads = {};
  const completedSteps = new Set();
  let formCode = null;
  let currentStep = 0;
  let statusEl, bannerEl, stepperEl, formEl, landingEl, phaseIndicatorEl; 
  let manualAddressMode = false;
  let firstPageSaved = false;
  let addressSuggestionsEl = null;
  let appState = 'landing'; 
  let autoSaveTimer = null;

  const LOOKUP_URL = 'https://mprefuge.github.io/site-assets/scripts/lookup.js';
  let lookupPromise = null;

  const loadLookup = () => {
    if (lookupPromise) return lookupPromise;
    lookupPromise = new Promise((resolve) => {
      if (window.lookup) return resolve(window.lookup);
      const script = document.createElement('script');
      script.src = LOOKUP_URL;
      script.async = true;
      script.onload = () => resolve(window.lookup || {});
      script.onerror = () => resolve({});
      document.head.appendChild(script);
    });
    return lookupPromise;
  };

  const applyLookupOptions = (lookup) => {
    if (!lookup) return;
    const map = {
      Salutation: 'salutation',
      PastorSalutation: 'salutation',
      MaritalStatus: 'maritalStatus',
      Country: 'countries',
      CountryOfOrigin: 'countries',
      State: 'states',
      PrimaryLanguage: 'languages',
      PreferredServingArea: 'servingAreas',
      ServingInterest: 'servingAreas',
      Skills: 'skills',
      LanguagesSpoken: 'languages',
      Availability: 'availability',
      HowHeard: 'howHeard',
      EmergencyContactRelationship: 'relationship',
    };
    Object.entries(map).forEach(([field, key]) => {
      const opts = lookup[key];
      if (Array.isArray(opts) && fieldMeta[field]) {
        fieldMeta[field].options = opts;
      }
    });
  };

  const isUS = () => {
    const c = (data.Country || '').toString().toLowerCase();
    return c === 'united states' || c === 'united states of america' || c === 'usa' || c === 'us' || c === 'u.s.' || c === 'u.s.a.';
  };

  const getLabel = (name) => {
    if (name === 'State') return isUS() ? 'State' : (orgTerms.labels.State || 'State/Province');
    if (name === 'Zip') return isUS() ? 'ZIP Code' : (orgTerms.labels.Zip || 'Postal Code');
    if (name === 'Country') return orgTerms.labels.Country || (fieldMeta[name]?.label || name);
    if (name === 'HowHeard') return `How did you hear about ${orgTerms.orgName}?`;
    return orgTerms.labels[name] || (fieldMeta[name]?.label || name);
  };

  const getStepTitle = (title) => orgTerms.stepTitles[title] || title;
  const getPhaseName = (phaseKey) => orgTerms.phaseNames[phaseKey] || (phases[phaseKey]?.name || '');

  const formatValue = (key, val) => {
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  const buildReviewSummary = () => {
    const wrap = h('div', { class: 'ri-review' });
    const currentStepsDef = phases[currentPhase].steps || [];
    const stepsForReview = currentStepsDef.slice(0, Math.max(0, currentStepsDef.length - 1));

    stepsForReview.forEach(step => {
      const section = h('div', { class: 'ri-review-section' });
      section.append(h('h4', { class: 'ri-review-title', text: getStepTitle(step.title) }));
      const grid = h('div', { class: 'ri-review-grid' });
      (step.fields || []).forEach(field => {
        const val = data[field];
        const hasVal = Array.isArray(val) ? val.length > 0 : (val !== undefined && val !== null && String(val).trim() !== '');
        if (!hasVal) return;
        const label = getLabel(field);
        const display = formatValue(field, val);
        const item = h('div', { class: 'ri-review-item' },
          h('div', { class: 'ri-review-label', text: label }),
          h('div', { class: 'ri-review-value', text: display })
        );
        grid.append(item);
      });
      if (grid.children.length > 0) {
        section.append(grid);
        wrap.append(section);
      }
    });
    return wrap;
  };

  const saveToLocalStorage = () => {
    try {
      const sessionData = {
        data: data,
        formCode: formCode,
        currentPhase: currentPhase,
        currentStep: currentStep,
        completedSteps: Array.from(completedSteps),
        firstPageSaved: firstPageSaved,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('volunteerAppSession', JSON.stringify(sessionData));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  };

  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('volunteerAppSession');
      if (!saved) return false;
      
      const sessionData = JSON.parse(saved);
      
      // Restore session data
      Object.assign(data, sessionData.data);
      formCode = sessionData.formCode;
      currentPhase = sessionData.currentPhase || 'initial';
      currentStep = sessionData.currentStep || 0;
      firstPageSaved = sessionData.firstPageSaved || false;
      sessionData.completedSteps.forEach(s => completedSteps.add(s));
      
      return true;
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
      return false;
    }
  };

  const clearLocalStorage = () => {
    try {
      localStorage.removeItem('volunteerAppSession');
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
  };

  const autoSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveToLocalStorage();
    }, 1000);
  };

  const setStatus = (msg, kind = "") => {
    statusEl.innerHTML = "";
    if (!msg) return;
    statusEl.append(h("div", { class: `ri-alert ${kind}` }, msg));
  };

  const showBanner = (code) => {
    if (!bannerEl) return;
    bannerEl.innerHTML = '';
    const text = h('div', { text: 'Your application code:' });
    const codeSpan = h('strong', { text: ` ${code}` });
    const copyBtn = h('button', { class: 'ri-btn ri-btn-ghost ri-btn-sm', type: 'button', text: 'Copy' });
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code);
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = prev, 1400);
      } catch (e) {
        setStatus('Unable to copy to clipboard', 'error');
      }
    };
    const exitBtn = h('button', { class: 'ri-btn ri-btn-ghost ri-btn-sm', type: 'button', text: 'Exit & Resume Later' });
    exitBtn.onclick = () => { showExitModal(code); };
    const dismiss = h('button', { class: 'ri-btn ri-btn-ghost ri-btn-sm', type: 'button' });
    dismiss.innerHTML = '&times;';
    dismiss.onclick = () => { bannerEl.style.display = 'none'; };
    bannerEl.append(text, codeSpan, copyBtn, exitBtn, dismiss);
    bannerEl.style.display = 'flex';
  };

  const showExitModal = (code) => {
    const modal = h('div', { class: 'ri-modal' });
    const overlay = h('div', { class: 'ri-modal-overlay' });
    const content = h('div', { class: 'ri-modal-content' },
      h('h3', { text: 'Save Your Application Code', class: 'ri-modal-title' }),
      h('p', { text: 'Please save this code to resume your application later:' }),
      h('div', { class: 'ri-code-display' }, h('code', { text: code })),
      h('p', { class: 'ri-modal-subtitle', text: 'You can continue your application anytime by entering this code on the home page.' })
    );
    const copyBtn = h('button', { class: 'ri-btn ri-btn-ghost', type: 'button', text: 'Copy Code' });
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy Code', 1400);
      } catch (e) {
        setStatus('Unable to copy to clipboard', 'error');
      }
    };
    const closeBtn = h('button', { class: 'ri-btn ri-btn-primary', type: 'button', text: 'Close & Exit' });
    closeBtn.onclick = () => {
      document.body.removeChild(modal);
        clearLocalStorage();
      appState = 'landing';
      landingEl.style.display = 'block';
      stepperEl.style.display = 'none';
      formEl.style.display = 'none';
      if (phaseIndicatorEl) phaseIndicatorEl.style.display = 'none';
      if (bannerEl) { bannerEl.style.display = 'none'; bannerEl.innerHTML = ''; }
      renderLanding();
    };
    const btnGroup = h('div', { class: 'ri-modal-actions' }, copyBtn, closeBtn);
    content.append(btnGroup);
    modal.append(overlay, content);
    overlay.onclick = () => { document.body.removeChild(modal); };
    document.body.appendChild(modal);
  };

  const fieldFor = (name) => {
    const meta = fieldMeta[name] || { label: name, type: "text", required: false };
    const value = data[name] ?? "";
    const wrapper = h("div", { class: "ri-field" });
    
    // Build label with required indicator
    const buildLabel = (labelText) => {
      const labelEl = h("label", { for: name });
      labelEl.append(h("span", { text: labelText }));
      if (meta.required) {
        labelEl.append(h("span", { class: "ri-required", text: " *" }));
      }

      return labelEl;
    };

    if (meta.type === "checkbox") {
      const input = h("input", { type: "checkbox", id: name, checked: !!value, onchange: e => { 
        data[name] = e.target.checked;
        autoSave();
        if (name === "MinistrySafeCompleted" || name === "WillPay") {
          if (name === 'MinistrySafeCompleted' && !e.target.checked) {
            // Remove uploaded certificate if training is unchecked
            delete data.MinistrySafeCertificate;
            if (fileUploads && fileUploads.MinistrySafeCertificate) delete fileUploads.MinistrySafeCertificate;
            autoSave();
          }
          renderForm();
        }
      }});

      if (name === 'WillPay') {
        const hasCertificate = !!(data.MinistrySafeCertificate || (fileUploads && fileUploads.MinistrySafeCertificate));
        const price = hasCertificate ? 15 : 20;
        // Build label as: "I am able to pay the $XX application fee"
        const raw = getLabel(name) || '';
        const feePhrase = /application fee/i;
        let left = raw;
        let right = '';
        if (feePhrase.test(raw)) {
          left = raw.replace(feePhrase, '').trim();
          right = 'application fee';
        }
        const labelEl = h('label', { for: name });
        const leftSpan = h('span', { text: left + (left ? ' ' : '') });
        const badge = h('span', { class: 'ri-fee-badge', text: `$${price}` });
        const rightSpan = h('span', { text: (right ? ' ' + right : '') });
        labelEl.append(leftSpan, badge, rightSpan);
        const row = h("div", { class: "ri-checkbox" }, input, labelEl);
        wrapper.append(row);
      } else if (name === 'AffirmStatementOfFaith') {
        // Statement of Faith: require opening the statement before the checkbox becomes enabled
        input.disabled = !(data._AffirmStatement_Read || value);
        const topRow = h('div', { class: 'ri-statement-top' });
        topRow.append(h('span', { text: getLabel(name) }), h('span', { class: 'ri-required', text: ' *' }));
        const link = h('a', { href: STATEMENT_URL, target: '_blank', rel: 'noopener noreferrer', class: 'ri-statement-link', text: 'Read the Statement of Faith' });
        // Clicking the link enables the checkbox so users can affirm
        link.onclick = (e) => { try { input.disabled = false; input.focus(); } catch (err) {} data._AffirmStatement_Read = true; helper.style.display = 'none'; };
        link.onkeydown = (e) => { if (e.key === 'Enter') link.click(); };
        const labelEl = h('label', { for: name });
        labelEl.append(topRow, link);
        const helper = h('div', { class: 'ri-field-note ri-field-note--hidden', text: 'Please read the full Statement of Faith before affirming. Opens in a new tab.' });
        const row = h('div', { class: 'ri-checkbox ri-checkbox--statement', tabindex: 0 }, input, labelEl);
        // If the user tries to click or press Enter/Space on the disabled checkbox/area, reveal the helper text
        row.onclick = (e) => {
          if (input.disabled) {
            helper.style.display = 'block';
            helper.classList.add('ri-field-note--pulse');
            setTimeout(() => helper.classList.remove('ri-field-note--pulse'), 900);
          }
        };
        row.onkeydown = (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && input.disabled) {
            e.preventDefault();
            helper.style.display = 'block';
            helper.classList.add('ri-field-note--pulse');
            setTimeout(() => helper.classList.remove('ri-field-note--pulse'), 900);
          }
        };
        wrapper.append(row, helper);
      } else {
        const row = h("div", { class: "ri-checkbox" }, input, buildLabel(getLabel(name)));
        wrapper.append(row);
      }
      
      // Always show a short, visible note under the MinistrySafe training checkbox (with info icon)
      if (name === 'MinistrySafeCompleted') {
        const infoIcon = h('span', { class: 'ri-info-icon', html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.88 6.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM11 11h2v6h-2v-6z"/></svg>' });
        const textEl = h('div', { class: 'ri-note-text', text: "Optional - If you have a MinistrySafe certificate you may upload it now. If you haven't completed training, part of the application process includes completing the MinistrySafe training." });
        const minNote = h('div', { class: 'ri-file-note ri-ministry-note' }, infoIcon, textEl);
        wrapper.append(minNote);
      }

      if (name === "MinistrySafeCompleted" && value) {
        const certField = fieldFor("MinistrySafeCertificate");
        wrapper.append(certField);
      }
      return wrapper;
    }

    const label = buildLabel(getLabel(name));
    let control;

    if (name === 'PreferredServingArea') {
      const hiddenVal = (Array.isArray(data[name]) ? data[name].join('|') : (data[name] || ''));
      control = h('input', { type: 'hidden', id: name, value: hiddenVal });
      wrapper.append(control);
      return wrapper;
    }
    
    if (name === 'ServingInterest') {
      const opts = fieldMeta.PreferredServingArea?.options || [];
      const curVals = Array.isArray(data[name]) && data[name].length > 0 ? data[name] : [];
      const primary = data.PreferredServingArea || '';
      const container = h('div', { class: 'ri-multiselect-box' });
      if (opts.length === 0) container.append(h('div', { class: 'ri-muted', text: 'No options available' }));
      const visibleOpts = (opts || []).map(opt => {
        const val = (opt && typeof opt === 'object') ? (opt.value ?? opt.text ?? '') : opt;
        const txt = (opt && typeof opt === 'object') ? (opt.text ?? opt.value ?? '') : opt;
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return null;
        return { val, txt };
      }).filter(Boolean);
      visibleOpts.forEach((optObj, i) => {
        const val = optObj.val;
        const txt = optObj.txt;
        const idOpt = `${name}__${i}`;
        const chk = h("input", { type: "checkbox", id: idOpt, checked: Array.isArray(curVals) && curVals.includes(val), onchange: e => {
          const prev = Array.isArray(data[name]) ? Array.from(data[name]) : [];
          const set = new Set(prev);
          if (e.target.checked) set.add(val); else set.delete(val);
          data[name] = Array.from(set);
          if (!data[name].includes(primary)) {
            if (data.PreferredServingArea === val && !data[name].includes(val)) data.PreferredServingArea = '';
          }
          autoSave();
        }});
        const lab = h("label", { for: idOpt, text: txt });
        const isStarred = (primary === val);
        const star = h('button', { type: 'button', class: isStarred ? 'ri-star ri-starred' : 'ri-star', title: 'Mark as primary area of interest' });
        star.innerHTML = isStarred ? '&#9733;' : '&#9734;';
        star.onclick = (e) => {
          e.preventDefault();
          if (!Array.isArray(data[name])) data[name] = [];
          if (!data[name].includes(val)) data[name].push(val);
          try { if (chk && !chk.checked) { chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true })); } } catch (err) {}
          if (data.PreferredServingArea === val) {
            data.PreferredServingArea = '';
          } else {
            data.PreferredServingArea = val;
          }
          autoSave();
          const allStars = container.querySelectorAll('.ri-star');
          allStars.forEach((s, idx) => {
            const starVal = visibleOpts[idx] && visibleOpts[idx].val;
            if (!starVal) return;
            const isNowStarred = (data.PreferredServingArea === starVal);
            s.innerHTML = isNowStarred ? '&#9733;' : '&#9734;';
            if (isNowStarred) s.classList.add('ri-starred'); else s.classList.remove('ri-starred');
          });
        };
        container.append(h("div", { class: "ri-checkbox" }, chk, lab, star));
      });
      const helper = h('div', { class: 'ri-field-note', text: 'Click the star to indicate your primary area of interest.' });
      wrapper.append(label, helper, container);
      return wrapper;
    }

    if (name === 'LanguagesSpoken') {
      const opts = fieldMeta.LanguagesSpoken?.options || [];
      const curVals = Array.isArray(data.LanguagesSpoken) && data.LanguagesSpoken.length > 0 ? data.LanguagesSpoken : [];
      const primary = data.PrimaryLanguage || '';
      const container = h('div', { class: 'ri-multiselect-box' });
      // Add a small visible helper above the list to emphasize starring a primary language
      const helper = h('div', { class: 'ri-field-note', text: 'Click the star to indicate your primary language.' });
      if (opts.length === 0) container.append(h('div', { class: 'ri-muted', text: 'No options available' }));
      const visibleOpts = (opts || []).map(opt => {
        const val = (opt && typeof opt === 'object') ? (opt.value ?? opt.text ?? '') : opt;
        const txt = (opt && typeof opt === 'object') ? (opt.text ?? opt.value ?? '') : opt;
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return null;
        return { val, txt };
      }).filter(Boolean);
      visibleOpts.forEach((optObj, i) => {
        const val = optObj.val;
        const txt = optObj.txt;
        const idOpt = `LanguagesSpoken__${i}`;
        const chk = h("input", { type: "checkbox", id: idOpt, checked: Array.isArray(curVals) && curVals.includes(val), onchange: e => {
          const prev = Array.isArray(data.LanguagesSpoken) ? Array.from(data.LanguagesSpoken) : [];
          const set = new Set(prev);
          if (e.target.checked) set.add(val); else set.delete(val);
          data.LanguagesSpoken = Array.from(set);
          if (!data.LanguagesSpoken.includes(primary)) {
            if (data.PrimaryLanguage === val && !data.LanguagesSpoken.includes(val)) data.PrimaryLanguage = '';
          }
          autoSave();
        }});
        const lab = h("label", { for: idOpt, text: txt });
        const isStarred = (primary === val);
        const star = h('button', { type: 'button', class: isStarred ? 'ri-star ri-starred' : 'ri-star', title: 'Mark as primary language' });
        star.innerHTML = isStarred ? '&#9733;' : '&#9734;';
        star.onclick = (e) => {
          e.preventDefault();
          if (!Array.isArray(data.LanguagesSpoken)) data.LanguagesSpoken = [];
          if (!data.LanguagesSpoken.includes(val)) data.LanguagesSpoken.push(val);
          try { if (chk && !chk.checked) { chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true })); } } catch (err) {}
          if (data.PrimaryLanguage === val) {
            data.PrimaryLanguage = '';
          } else {
            data.PrimaryLanguage = val;
          }
          autoSave();
          const allStars = container.querySelectorAll('.ri-star');
          allStars.forEach((s, idx) => {
            const starVal = visibleOpts[idx] && visibleOpts[idx].val;
            if (!starVal) return;
            const isNowStarred = (data.PrimaryLanguage === starVal);
            s.innerHTML = isNowStarred ? '&#9733;' : '&#9734;';
            if (isNowStarred) s.classList.add('ri-starred'); else s.classList.remove('ri-starred');
          });
        };
        container.append(h("div", { class: "ri-checkbox" }, chk, lab, star));
      });
      //container.append(h('div', { class: 'ri-muted', text: "Tap items to select languages; click the star to mark your primary language." }));
      wrapper.append(label, helper, container);
      return wrapper;
    }

    if (meta.type === "file") {
      if (name === 'MinistrySafeCertificate' && !data.MinistrySafeCompleted) {
        return wrapper;
      }

      control = h("input", { id: name, type: "file", accept: meta.accept || "*" });
      control.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          fileUploads[name] = file;
          data[name] = file.name;
          autoSave();
          if (name === 'MinistrySafeCertificate') renderForm();
        }
      };
      if (fileUploads[name]) {
        const fileInfo = h("div", { class: "ri-file-info", text: `Selected: ${fileUploads[name].name}` });
        wrapper.append(label, control, fileInfo);
      } else {
        wrapper.append(label, control);
      }
    } else if (meta.type === "select") {
      if (name === 'MinistrySafeCompletionDate' && !data.MinistrySafeCompleted) {
        return wrapper;
      }
      control = h("select", { id: name, onchange: e => { 
        data[name] = e.target.value;
        autoSave();
        if (name === 'Country') {
          renderForm(); // refresh labels for State/Zip
        }
      }});
      control.append(h("option", { value: "" }, "Select..."));
      (meta.options || []).forEach(opt => {
        let val, txt;
        if (opt && typeof opt === 'object') {
          val = opt.value ?? opt.text ?? '';
          txt = opt.text ?? opt.value ?? '';
        } else {
          val = opt;
          txt = opt;
        }
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return;
        control.append(h("option", { value: val, text: txt }));
      });
      control.value = value;
      wrapper.append(label, control);
    } else if (meta.type === "textarea") {
      control = h("textarea", { id: name, placeholder: meta.placeholder || "", oninput: e => { 
        data[name] = e.target.value;
        autoSave();
      }}, value);
      wrapper.append(label, control);
    } else if (meta.type === "multiselect") {
      const container = h("div", { class: "ri-multiselect-box" });
      const helper = h('div', { class: 'ri-field-note', text: "Tap the items you want to select - multiple selections are allowed." });
      const opts = meta.options || [];
      const curVals = Array.isArray(value) ? value : (typeof value === 'string' ? value.split('|').map(s => s.trim()).filter(Boolean) : []);
      if ((opts || []).length === 0) {
        container.append(h('div', { class: 'ri-muted', text: 'No options available' }));
      }
      const visibleOpts = (opts || []).map(opt => {
        const val = (opt && typeof opt === 'object') ? (opt.value ?? opt.text ?? '') : opt;
        const txt = (opt && typeof opt === 'object') ? (opt.text ?? opt.value ?? '') : opt;
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return null;
        return { val, txt };
      }).filter(Boolean);
      visibleOpts.forEach((optObj, i) => {
        const val = optObj.val;
        const txt = optObj.txt;
        const idOpt = `${name}__${i}`;
        const chk = h("input", { type: "checkbox", id: idOpt, checked: Array.isArray(curVals) && curVals.includes(val), onchange: e => {
          const prev = Array.isArray(data[name]) ? Array.from(data[name]) : Array.from(curVals);
          const set = new Set(prev);
          if (e.target.checked) set.add(val); else set.delete(val);
          data[name] = Array.from(set);
          autoSave();
        }});
        const lab = h("label", { for: idOpt, text: txt });
        container.append(h("div", { class: "ri-checkbox" }, chk, lab));
      });
      wrapper.append(label, helper, container);
    } else {
      control = h("input", { id: name, type: meta.type || "text", placeholder: meta.placeholder || "", value, oninput: e => { 
        data[name] = e.target.value;
        autoSave();
      }});
      wrapper.append(label, control);
    }
    return wrapper;
  };

  const renderPhaseIndicator = () => {
    if (!phaseIndicatorEl) return;
    phaseIndicatorEl.innerHTML = "";
    const phaseNames = ['initial', 'supplemental', 'placement'];
    phaseNames.forEach(phaseName => {
      const phase = phases[phaseName];
      const isActive = phaseName === currentPhase;
      const isPast = phaseNames.indexOf(phaseName) < phaseNames.indexOf(currentPhase);
      const chip = h("div", { 
        class: `ri-phase-chip ${isActive ? "active" : ""} ${isPast ? "completed" : ""}` 
      }, getPhaseName(phaseName) || phase.name);
      phaseIndicatorEl.append(chip);
    });
  };

  const calculateProgress = () => {
    const currentSteps = phases[currentPhase].steps;
    const totalStepsInPhase = currentSteps.length;
    const completedInPhase = Array.from(completedSteps).filter(s => s.startsWith(`${currentPhase}-`)).length;
    const progressPercent = totalStepsInPhase > 0 ? (completedInPhase / totalStepsInPhase) * 100 : 0;
    return { completed: completedInPhase, total: totalStepsInPhase, percent: progressPercent };
  };

  const renderStepper = () => {
    renderPhaseIndicator();
    stepperEl.innerHTML = "";
    const currentSteps = phases[currentPhase].steps;
    const phaseInfo = phases[currentPhase];
    
    // Phase info bar
    const infoBar = h("div", { class: "ri-phase-info" });
    const phaseTitle = h("div", { class: "ri-phase-title", text: getPhaseName(currentPhase) || phaseInfo.name });
    const phaseDesc = h("div", { class: "ri-phase-desc", text: phaseInfo.description });
    const timeEst = h("div", { class: "ri-phase-time", text: `Est. ${phaseInfo.estimatedTime} min` });
    infoBar.append(phaseTitle, phaseDesc, timeEst);
    
    // Progress bar
    const progress = calculateProgress();
    const progressBar = h("div", { class: "ri-progress-wrapper" });
    const progressFill = h("div", { class: "ri-progress-fill", style: `width: ${progress.percent}%` });
    const progressText = h("div", { class: "ri-progress-text", text: `Step ${currentStep + 1} of ${currentSteps.length}` });
    progressBar.append(progressFill, progressText);
    
    stepperEl.append(infoBar, progressBar);
    
    const chipContainer = h("div", { class: "ri-chip-container" });
    currentSteps.forEach((s, idx) => {
      const stepKey = `${currentPhase}-${idx}`;
      const isCompleted = completedSteps.has(stepKey);
      const isActive = idx === currentStep;
      
      const chipContent = [];
      if (isCompleted) {
        const checkmark = h('span', { class: 'ri-checkmark' });
        checkmark.innerHTML = '&#10003;';
        chipContent.push(checkmark);
      } else {
        chipContent.push(h('span', { class: 'ri-step-number', text: String(idx + 1) }));
      }
      chipContent.push(h('span', { class: 'ri-step-label', text: getStepTitle(s.title) }));
      
      const chip = h("div", { 
        class: `ri-chip ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}` 
      }, ...chipContent);
      
      chip.style.cursor = 'pointer';
      chip.onclick = () => {
        if (idx === currentStep) return;
        if (idx > 0 && !firstPageSaved) {
          setStatus('Complete the first page to access other steps.', 'error');
          return;
        }
        currentStep = idx;
        renderForm();
      };
      chipContainer.append(chip);
    });
    stepperEl.append(chipContainer);
  };

  const debounce = (fn, wait = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  const searchAddress = async (q) => {
    if (!q || q.length < 3) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => []);
    return Array.isArray(json) ? json : [];
  };

  const fillAddressFromNominatim = (item) => {
    if (!item) return;
    const addr = item.address || {};
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
    data.Street = street || (addr.road || '');
    data.City = addr.city || addr.town || addr.village || addr.county || '';
    data.State = addr.state || '';
    data.Zip = addr.postcode || '';
    data.Country = addr.country || '';
    manualAddressMode = true;
    renderForm();
  };

  const renderAddressSuggestions = (items, container) => {
    if (!container) return;
    container.innerHTML = '';
    if (!items || items.length === 0) return;
    items.forEach(it => {
      const label = it.display_name || [it.address?.road, it.address?.city, it.address?.state].filter(Boolean).join(', ');
      const node = h('div', { class: 'ri-address-suggestion', text: label });
      node.onclick = () => { fillAddressFromNominatim(it); };
      container.append(node);
    });
  };

  const validateStep = () => {
    const currentSteps = phases[currentPhase].steps;
    const step = currentSteps[currentStep];
    
    // Define required fields by step title
    const churchStepTitle = orgTerms.stepTitles['Church & Ministry'] || 'Church & Ministry';
    const requiredByStep = {
      "Basic Information": ["FirstName", "LastName", "Email", "Phone"],
      "Personal Details": ["Gender", "Street", "City", "State"],
      [churchStepTitle]: ["Church", "PastorFirstName", "PastorLastName", "PastorEmail"],
      "Emergency Contact": ["EmergencyContactFirstName", "EmergencyContactLastName", "EmergencyContactPhone"],
      "What You'd Like to Do": ["ServingInterest"],
      "Your Faith Journey": ["GospelDetails", "TestimonyDetails"],
      "Commitments & Agreement": ["AffirmStatementOfFaith"],
    };
    
    const required = requiredByStep[step.title] || [];
    const missing = required.filter(k => {
      const val = data[k];
      if (fieldMeta[k]?.type === 'checkbox') return !val;
      if (fieldMeta[k]?.type === 'multiselect') return !(Array.isArray(val) && val.length > 0);
      return !val || (typeof val === 'string' && val.trim() === '');
    });
    
    if (missing.length) {
      const fieldNames = missing.map(k => fieldMeta[k]?.label || k).join(", ");
      setStatus(`Please complete required fields: ${fieldNames}`, "error");
      return false;
    }
    return true;
  };

  const saveProgress = async () => {
    const payload = {};
    const currentSteps = phases[currentPhase].steps;
    const stepFields = (currentSteps[currentStep] && currentSteps[currentStep].fields) ? currentSteps[currentStep].fields : Object.keys(data);

    stepFields.forEach((k) => {
      if (!(k in data)) return;
      const v = data[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'string' && v.trim() === '') return;
      const sfKey = fieldToSf[k] || k;
      // Convert multiselect arrays to pipe-delimited strings for storage
      if (Array.isArray(v)) {
        payload[sfKey] = v.join('|');
      } else {
        payload[sfKey] = v;
      }
    });

    // If this is a create (no formCode yet), set the Record Type explicitly
    if (!formCode) {
      payload['RecordType__c'] = 'Volunteer Application';
      payload['RecordType'] = 'Volunteer Application';
      payload['RecordTypeName'] = 'Volunteer Application';
    }

    if (formCode) {
      payload['FormCode__c'] = formCode;
    }

    payload['CurrentPhase__c'] = currentPhase;

    // Handle file uploads
    if (Object.keys(fileUploads).length > 0) {
      const formData = new FormData();
      formData.append('data', JSON.stringify(payload));
      Object.entries(fileUploads).forEach(([key, file]) => {
        formData.append(key, file);
      });

      const res = await fetch(ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || res.statusText || "Request failed");
      return json;
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || res.statusText || "Request failed");
    return json;
  };

  const normalizeAndAssign = (json) => {
    Object.entries(json).forEach(([k, v]) => {
      let clientKey = sfToField[k];
      if (!clientKey) {
        const alt = k.replace(/__c$/i, '');
        const found = Object.keys(fieldMeta).find(f => f.toLowerCase() === alt.toLowerCase());
        if (found) clientKey = found;
      }
      if (clientKey) {
        if (fieldMeta[clientKey]?.type === 'checkbox' && typeof v === 'string') {
          const lower = v.toLowerCase();
          if (lower === 'true' || lower === 'false') v = lower === 'true';
        }
        // Support multiselect fields stored as pipe/semicolon/comma delimited strings
        if (fieldMeta[clientKey]?.type === 'multiselect' && typeof v === 'string') {
          const delim = v.includes('|') ? '|' : (v.includes(';') ? ';' : ',');
          v = v.split(delim).map(s => s.trim()).filter(Boolean);
        }
        data[clientKey] = v;
      } else {
        data[k] = v;
      }
    });
    
    // Reconstruct completed steps across all phases based on filled data
    completedSteps.clear();
    Object.entries(phases).forEach(([phaseKey, phaseDef]) => {
      (phaseDef.steps || []).forEach((step, idx) => {
        const hasData = step.fields.some(field => {
          const val = data[field];
          if (Array.isArray(val)) return val.length > 0;
          return val !== undefined && val !== null && val !== '';
        });
        if (hasData) completedSteps.add(`${phaseKey}-${idx}`);
      });
    });

    // Ensure primary selections are included in their corresponding arrays when loading
    if (data.PreferredServingArea && data.PreferredServingArea !== '') {
      if (!Array.isArray(data.ServingInterest)) data.ServingInterest = [];
      if (!data.ServingInterest.includes(data.PreferredServingArea)) data.ServingInterest.push(data.PreferredServingArea);
    }
    if (data.PrimaryLanguage && data.PrimaryLanguage !== '') {
      if (!Array.isArray(data.LanguagesSpoken)) data.LanguagesSpoken = [];
      if (!data.LanguagesSpoken.includes(data.PrimaryLanguage)) data.LanguagesSpoken.push(data.PrimaryLanguage);
    }
  };

  const getAllFormFields = () => {
    const allFields = new Set();
    // Collect all fields from all phases
    Object.values(phases).forEach(phase => {
      (phase.steps || []).forEach(step => {
        (step.fields || []).forEach(field => {
          const sfField = fieldToSf[field] || field;
          allFields.add(sfField);
        });
      });
    });
    // Always include Id and FormCode__c
    allFields.add('Id');
    allFields.add('FormCode__c');
    return Array.from(allFields);
  };

  const loadByCode = async (code) => {
    // Get all fields from the form definition and pass them to the API
    const allFields = getAllFormFields();
    const fieldsParam = JSON.stringify(allFields);
    const encodedFields = encodeURIComponent(fieldsParam);
    
    const tryUrls = [
      `${ENDPOINT}?code=${encodeURIComponent(code)}&fields=${encodedFields}`,
      `${ENDPOINT}?FormCode=${encodeURIComponent(code)}&fields=${encodedFields}`,
      `${ENDPOINT}?FormCode__c=${encodeURIComponent(code)}&fields=${encodedFields}`,
    ];

    for (const url of tryUrls) {
      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (res.ok && Object.keys(json).length > 0) {
          normalizeAndAssign(json);
          firstPageSaved = true;
          formCode = json?.FormCode || json?.Form_Code__c || json?.formCode || json?.form_code || json?.FormCode__c || code;
          // Update UI to reflect loaded completion state
          renderStepper();
          if (formEl.style.display === 'block') renderForm();
          return json;
        }
      } catch (e) {
        // Continue to next URL
      }
    }

    // Last attempt with POST
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, FormCode__c: code }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      normalizeAndAssign(json);
      firstPageSaved = true;
      formCode = json?.FormCode || json?.Form_Code__c || json?.formCode || json?.form_code || code;
      renderStepper();
      if (formEl.style.display === 'block') renderForm();
      return json;
    }
    throw new Error(json.message || res.statusText || 'Application not found');
  };

  const doSubmit = async (stay = false) => {
    setStatus("", "");
    if (!validateStep()) return;
    const submitBtn = formEl.querySelector("button[type=submit]");
    if (!submitBtn) return;
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="ri-loader"></span>';
    try {
      const res = await saveProgress();
      const returnedCode = res?.FormCode || res?.Form_Code__c || res?.formCode || res?.form_code || res?.Form_Code || res?.form_code__c;
      if (returnedCode) {
        formCode = returnedCode;
        showBanner(formCode);
        if (currentStep === 0) firstPageSaved = true;
        saveToLocalStorage();
      }
      setStatus("Progress saved.", "success");
      
      // Mark current step as completed
      const stepKey = `${currentPhase}-${currentStep}`;
      completedSteps.add(stepKey);
      
      const currentSteps = phases[currentPhase].steps;
      
      if (!stay && currentStep < currentSteps.length - 1) {
        currentStep += 1;
        renderForm();
      } else if (!stay && currentStep === currentSteps.length - 1) {
        if (currentPhase === 'initial') {
          setStatus("Application submitted successfully! Thank you for applying. We'll review your application and be in touch soon.", "success");
          setTimeout(() => {
            showExitModal(formCode);
          }, 2500);
        } else if (currentPhase === 'supplemental') {
          setStatus("Document review phase completed!", "success");
          setTimeout(() => {
            showExitModal(formCode);
          }, 2000);
        } else {
          setStatus("All phases completed successfully!", "success");
        }
      }
    } catch (e) {
      setStatus(e.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  };

  const renderForm = () => {
    renderStepper();
    const currentSteps = phases[currentPhase].steps;
    const step = currentSteps[currentStep];
    formEl.innerHTML = "";
    
    // Step header with description
    const stepHeader = h("div", { class: "ri-step-header" });
    const stepTitle = h("h3", { text: getStepTitle(step.title), class: "ri-step-title" });
    const stepDesc = h("p", { text: step.description, class: "ri-step-description" });
    stepHeader.append(stepTitle, stepDesc);

    // Welcome banner on first page of initial phase (disabled here; shown on landing instead)
    if (false && currentPhase === 'initial' && currentStep === 0) {
      const welcome = h('div', { class: 'ri-welcome' },
        h('img', { src: 'https://images.squarespace-cdn.com/content/v1/5af0bc3a96d45593d7d7e55b/e7f37dd1-a057-4564-99a4-0d1907541ff4/No+MS+1.jpg?format=750w', alt: 'Refuge International volunteers', class: 'ri-welcome-image' }),
        h('div', { class: 'ri-welcome-content' },
          h('h4', { class: 'ri-welcome-title', text: 'Welcome to the first part of our volunteer application.' }),
          h('p', { class: 'ri-welcome-text', html: `We are so thankful for your interest in serving with us!<br><br>Refuge International exists to glorify God by partnering with local churches to love refugees and immigrants. One of the primary ways we do this is through our various volunteer ministry offerings: English Mentoring; Conversation Clubs, Adopt-A-Family, Right Start children's reading program; and the ESL ministry that we sponsor, Community Of Friends Focused On Effective English (COFFEE). This online form is Part 1 of our volunteer application which helps us ensure the integrity of our volunteer programs and the safety of the refugees, children, and immigrants we serve.<br><br>You should be able to complete this section in 5-7 minutes. After you submit this form, you\'ll receive an email from us concerning the second part of the application. Then, following approval of your application, we look forward to deploying you for service in your desired ministry offering! And we look forward to the blessings that await both you and the refugees and immigrants you will serve!<br><br>Warmly,<br><strong>Matt Reynolds</strong><br>Executive Director` })
        )
      );
      formEl.append(welcome);
    }

    formEl.append(stepHeader);
    
    let grid;
    if (step.title === 'Basic Information') {
      const row1 = h('div', { class: 'ri-basic-row' },
        h('div', { class: 'ri-basic-col ri-basic-col--salutation' }, fieldFor('Salutation')),
        h('div', { class: 'ri-basic-col ri-basic-col--name' }, fieldFor('FirstName')),
        h('div', { class: 'ri-basic-col ri-basic-col--name' }, fieldFor('LastName')),
      );
      const row2 = h('div', { class: 'ri-basic-row' },
        h('div', { class: 'ri-basic-col ri-basic-col--email' }, fieldFor('Email')),
        h('div', { class: 'ri-basic-col ri-basic-col--phone' }, fieldFor('Phone')),
      );
      grid = h('div', { class: 'ri-grid ri-grid--basic-info' }, row1, row2);
    } else if (step.title === 'Personal Details') {
      const left = h('div', { class: 'ri-personal-left' },
        fieldFor('Birthdate'),
        fieldFor('CountryOfOrigin'),
        fieldFor('Gender'),
        fieldFor('MaritalStatus')
      );

      const right = h('div', { class: 'ri-personal-right' },
        fieldFor('LanguagesSpoken')
      );

      // Address row spans both columns and sits at the bottom; use standard fieldFor wrappers
      const streetWrapper = fieldFor('Street');


      // suggestions container for street search
      addressSuggestionsEl = h('div', { class: 'ri-address-suggestions' });
      streetWrapper.append(addressSuggestionsEl);

      // wire up search on the street input
      try {
        const input = streetWrapper.querySelector('input');
        if (input) {
          input.oninput = debounce(async (e) => {
            const q = e.target.value;
            data.Street = q;
            const items = await searchAddress(q);
            renderAddressSuggestions(items, addressSuggestionsEl);
          });
        }
      } catch (err) {}

      const cityWrapper = fieldFor('City');
      const stateWrapper = fieldFor('State');
      const zipWrapper = fieldFor('Zip');
      const countryWrapper = fieldFor('Country');

      const addressSubgrid = h('div', { class: 'ri-address-subgrid' });
      addressSubgrid.append(cityWrapper, stateWrapper, zipWrapper, countryWrapper);

      const addressRow = h('div', { class: 'ri-address-row' }, streetWrapper, addressSubgrid);

      grid = h('div', { class: 'ri-grid ri-grid--personal-details' }, left, right, addressRow);

    } else if (step.title === (orgTerms.stepTitles['Church & Ministry'] || 'Church & Ministry')) {
      // Top row: two evenly split fields (Church name and Church involvement)
      const churchTop = h('div', { class: 'ri-church-top', style: 'grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' },
        h('div', { class: 'ri-church-col ri-church-col--half' }, fieldFor('Church')),
        h('div', { class: 'ri-church-col ri-church-col--half' }, fieldFor('ChurchServingDetails'))
      );

      // Pastor subsection: Pastoral Reference (title + note) and pastor row
      const pastorRow = h('div', { class: 'ri-church-pastor-row', style: 'display:flex; gap:10px; align-items:center; flex-wrap:nowrap;' },
        h('div', { class: 'ri-pastor-salutation' }, fieldFor('PastorSalutation')),
        h('div', { class: 'ri-pastor-first' }, fieldFor('PastorFirstName')),
        h('div', { class: 'ri-pastor-last' }, fieldFor('PastorLastName')),
        h('div', { class: 'ri-pastor-email' }, fieldFor('PastorEmail'))
      );

      const pastoralSection = h('div', { class: 'ri-church-pastoral-section', style: 'grid-column: 1 / -1; margin-top: 12px;' },
        h('h4', { class: 'ri-section-title', text: 'Pastoral Reference' }),
        h('div', { class: 'ri-section-note', text: 'We will reach out to your pastoral reference on your behalf as part of the application process.' }),
        pastorRow
      );

      grid = h('div', { class: 'ri-grid ri-grid--church-info' }, churchTop, pastoralSection);

    } else if (step.title === "What You'd Like to Do") {
      // Areas to Serve: top row with Areas of Interest and Skills side-by-side
      const areasTop = h('div', { class: 'ri-areas-top', style: 'grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' },
        fieldFor('ServingInterest'),
        fieldFor('Skills')
      );

      // Availability: convert default list into a grid of three columns
      const availabilityWrapper = fieldFor('Availability');
      // Add a class so we can style the inner multiselect as a 3-column grid
      availabilityWrapper.classList.add('ri-availability-grid');

      grid = h('div', { class: 'ri-grid ri-grid--areas-to-serve' }, areasTop, availabilityWrapper);

    } else if (step.title === 'Commitments & Agreement') {
      // Review summary full-width, then agreements checkboxes left, notes right
      const review = buildReviewSummary();
      review.className = 'ri-review--full';
      
      // Agreements section with clean checkboxes
      const agreementsSection = h('div', { class: 'ri-agreements-section' },
        h('h4', { class: 'ri-agreements-title', text: 'Please Confirm the Following:' }),
        h('div', { class: 'ri-agreements-list' },
          fieldFor('AffirmStatementOfFaith'),
          fieldFor('MinistrySafeCompleted'),
          fieldFor('WillPay')
        )
      );
      
      // Right column: Additional info card
      const infoCard = h('div', { class: 'ri-info-card' },
        fieldFor('AdditionalNotes'),
        fieldFor('HowHeard')
      );
      
      const layoutRow = h('div', { class: 'ri-agreements-layout' }, agreementsSection, infoCard);
      grid = h('div', { class: 'ri-grid ri-grid--agreements' }, review, layoutRow);
    } else {
      grid = h("div", { class: "ri-grid" }, step.fields.map(fieldFor));
    }
    const isLast = currentStep === currentSteps.length - 1;
    const submitText = isLast && currentPhase === 'initial' ? 'Submit Application' : (isLast ? 'Complete Phase' : 'Next');
    const actions = h("div", { class: "ri-actions" },
      h("button", { class: "ri-btn ri-btn-ghost", type: "button", disabled: currentStep === 0, onclick: () => { currentStep = Math.max(0, currentStep - 1); renderForm(); } }, "Back"),
      h("button", { class: "ri-btn ri-btn-primary", type: "submit" }, submitText)
    );
    formEl.append(grid, actions);
  };

  const renderLanding = () => {

    landingEl.innerHTML = "";
    if (bannerEl) {
      bannerEl.style.display = 'none';
      bannerEl.innerHTML = '';
    }
    
    const hasSession = loadFromLocalStorage();
    
    if (hasSession && formCode) {
      const title = h("h2", { text: "Welcome Back!", class: "ri-landing-title" });
      const subtitle = h("p", { text: "You have an application in progress. Would you like to continue where you left off?", class: "ri-landing-subtitle" });
      
      const resumeBtn = h("button", { class: "ri-btn ri-btn-primary ri-landing-btn", type: "button", text: "Continue My Application" });
      resumeBtn.onclick = () => {
        appState = 'continue';
        landingEl.style.display = 'none';
        if (phaseIndicatorEl) phaseIndicatorEl.style.display = 'flex';
        stepperEl.style.display = 'flex';
        formEl.style.display = 'block';
        renderForm();
        if (formCode) showBanner(formCode);
        setStatus("Application restored from your last session.", "success");
      };
      
      const startNewBtn = h("button", { class: "ri-btn ri-btn-ghost ri-landing-btn", type: "button", text: "Start Fresh" });
      startNewBtn.onclick = () => {
        if (confirm("Are you sure? This will discard your current progress.")) {
          clearLocalStorage();
          Object.keys(data).forEach(k => delete data[k]);
          Object.keys(fileUploads).forEach(k => delete fileUploads[k]);
          completedSteps.clear();
          formCode = null;
          currentPhase = 'initial';
          currentStep = 0;
          firstPageSaved = false;
                    if (bannerEl) { bannerEl.style.display = 'none'; bannerEl.innerHTML = ''; }
          renderLanding();
        }
      };
      
      const codeInfo = h("div", { class: "ri-code-reminder", style: "margin: 20px 0; padding: 12px; background: #f5f5f5; border-radius: 4px; text-align: center;" }, 
        h("p", { text: "Your application code: ", style: "margin: 0; display: inline;" }),
        h("strong", { text: formCode, style: "font-size: 1.1em;" })
      );
      
      const btnContainer = h("div", { class: "ri-landing-actions" }, resumeBtn, startNewBtn);
      landingEl.append(title, subtitle, codeInfo, btnContainer);
      return;
    }
    
    // Welcome banner with mission copy and signature (stacked layout; letter format)
    const welcome = h('div', { class: 'ri-welcome' },
      h('img', { src: 'https://images.squarespace-cdn.com/content/v1/5af0bc3a96d45593d7d7e55b/e7f37dd1-a057-4564-99a4-0d1907541ff4/No+MS+1.jpg?format=750w', alt: 'Refuge International volunteers', class: 'ri-welcome-image' }),
      h('div', { class: 'ri-welcome-content' },
        h('h4', { class: 'ri-welcome-title', text: 'Welcome to the first part of our volunteer application.' }),
        h('p', { class: 'ri-welcome-text', text: 'We are so thankful for your interest in serving with us!' }),
        h('p', { class: 'ri-welcome-text', text: 'Refuge International exists to glorify God by partnering with local churches to love refugees and immigrants. One of the primary ways we do this is through our various volunteer ministry offerings: English Mentoring; Conversation Clubs, Adopt-A-Family, Right Start children\'s reading program; and the ESL ministry that we sponsor, Community Of Friends Focused On Effective English (COFFEE). This online form is Part 1 of our volunteer application which helps us ensure the integrity of our volunteer programs and the safety of the refugees, children, and immigrants we serve.' }),
        h('p', { class: 'ri-welcome-text', text: 'You should be able to complete this section in 5-7 minutes. After you submit this form, you\'ll receive an email from us concerning the second part of the application. Then, following approval of your application, we look forward to deploying you for service in your desired ministry offering! And we look forward to the blessings that await both you and the refugees and immigrants you will serve!' }),
        h('p', { class: 'ri-welcome-text', text: 'Warmly,' }),
        h('div', { class: 'ri-signature' },
          h('strong', { text: 'Matt Reynolds' }),
          h('div', { text: 'Executive Director' })
        )
      )
    );

    const infoBox = h('div', { class: 'ri-landing-info' },
      h('p', { html: '<strong>Start New Application</strong> &mdash; Begin a fresh application; Part 2 instructions will be emailed after submission.' }),
      h('p', { html: '<strong>Continue Existing Application</strong> &mdash; Already started an application? Use your application code to pick up where you left off.' })
    );

    const newBtn = h("button", { class: "ri-btn ri-btn-primary ri-landing-btn", type: "button", text: "Start New Application" });
    newBtn.onclick = () => {
      appState = 'new';
        if (bannerEl) { bannerEl.style.display = 'none'; bannerEl.innerHTML = ''; }
      currentPhase = 'initial';
      currentStep = 0;
      completedSteps.clear();
      Object.keys(data).forEach(k => delete data[k]);
      Object.keys(fileUploads).forEach(k => delete fileUploads[k]);
      landingEl.style.display = 'none';
      if (phaseIndicatorEl) phaseIndicatorEl.style.display = 'flex';
      stepperEl.style.display = 'flex';
      formEl.style.display = 'block';
      renderForm();
    };
    const continueBtn = h("button", { class: "ri-btn ri-btn-ghost ri-landing-btn", type: "button", text: "Continue Existing Application" });
    continueBtn.onclick = () => {
      appState = 'continue';
      landingEl.innerHTML = "";
      const backBtn = h("button", { class: "ri-btn ri-btn-ghost", type: "button", text: "← Back" });
      backBtn.onclick = () => { appState = 'landing'; renderLanding(); };
      const resumeTitle = h("h3", { text: "Continue Your Application", class: "ri-step-title" });
      const resumeSubtitle = h("p", { text: "Enter your application code to resume where you left off." });
      const input = h("input", { placeholder: "Enter your application code", style: "margin: 16px 0;" });
      const loadBtn = h("button", { class: "ri-btn ri-btn-primary", type: "button", text: "Load Application" });
      loadBtn.onclick = async () => {
        const code = (input.value || "").trim();
        if (!code) return setStatus("Please enter your application code.", "error");
        loadBtn.disabled = true;
        loadBtn.innerHTML = '<span class="ri-loader"></span>';
        setStatus("Loading your application...", "");
        try {
          await loadByCode(code);
          currentPhase = data.CurrentPhase || 'initial';
          landingEl.style.display = 'none';
          if (phaseIndicatorEl) phaseIndicatorEl.style.display = 'flex';
          stepperEl.style.display = 'flex';
          formEl.style.display = 'block';
          renderForm();
          if (formCode) showBanner(formCode);
          setStatus("Application loaded successfully.", "success");
        } catch (e) {
          setStatus(e.message, "error");
          loadBtn.disabled = false;
          loadBtn.textContent = "Load Application";
        }
      };
      landingEl.append(backBtn, resumeTitle, resumeSubtitle, input, loadBtn);
    };
    const btnContainer = h("div", { class: "ri-landing-actions" }, newBtn, continueBtn);
    landingEl.append(welcome, infoBox, btnContainer);
  };

  const host = document.getElementById(HOST_ID) || document.body;
  const container = h("div", { class: "ri-app" },
    h("div", { class: "ri-card" },
      // Header
      h("div", { class: "ri-header-wrapper" },
        h("div", { class: "ri-header" }, 

        )
      ),
      bannerEl = h("div", { class: "ri-banner", style: "display:none;" }),
      landingEl = h("div", { class: "ri-landing" }),
      phaseIndicatorEl = h("div", { class: "ri-phase-indicator", style: "display:none;" }),
      stepperEl = h("div", { class: "ri-stepper", style: "display:none;" }),
      formEl = h("form", { class: "ri-form", style: "display:none;", onsubmit: e => { e.preventDefault(); doSubmit(false); } }),
      statusEl = h("div", { class: "ri-status" })
    )
  );

  host.appendChild(container);

  loadLookup().then(applyLookupOptions).finally(() => {
    renderLanding();
  });
})();
