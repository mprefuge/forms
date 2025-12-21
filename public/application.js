(() => {
  const ENDPOINT = "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form";
  const HOST_ID = "volunteer-app";

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
      else el.setAttribute(k, v);
    });
    kids.flat().forEach(k => { if (k !== null && k !== undefined) el.append(k); });
    return el;
  };

  const phases = {
    initial: {
      name: "Application",
      steps: [
        { title: "Basic Information", fields: ["Salutation","FirstName","LastName","Email","Phone","Birthdate"] },
        { title: "Personal Details", fields: ["Gender","MaritalStatus","CountryOfOrigin","PrimaryLanguage","LanguagesSpoken"] },
        { title: "Address", fields: ["Street","City","State","Zip","Country"] },
        { title: "Church & Ministry", fields: ["Church","ChurchServingDetails","Skills","HowHeard"] },
        { title: "Emergency Contact", fields: ["EmergencyContactFirstName","EmergencyContactLastName","EmergencyContactPhone","EmergencyContactRelationship"] },
        { title: "What You'd Like to Do", fields: ["ServingInterest","PreferredServingArea","Availability"] },
        { title: "Your Faith Journey", fields: ["GospelDetails","TestimonyDetails"] },
        { title: "Commitments & Agreement", fields: ["AffirmStatementOfFaith","WillPay","AdditionalNotes"] },
        { title: "Pastor Contact Information", fields: ["PastorSalutation","PastorFirstName","PastorLastName","PastorEmail"] },
      ]
    },
    supplemental: {
      name: "Document Review (Admin)",
      steps: [
        { title: "Pastoral Reference Review", fields: ["PastoralReferenceStatus","PastoralReferenceNotes"] },
        { title: "Background Check", fields: ["BackgroundCheckStatus","BackgroundCheckDate","BackgroundCheckNotes"] },
        { title: "MinistrySafe Training", fields: ["MinistrySafeCompleted","MinistrySafeCompletionDate","MinistrySafeCertificate"] },
        { title: "Additional Documents", fields: ["AdditionalDocumentsNotes"] },
      ]
    },
    placement: {
      name: "Placement (Admin)",
      steps: [
        { title: "Placement Details", fields: ["PlacementArea","PlacementStartDate","PlacementNotes"] },
      ]
    }
  };

  let currentPhase = 'initial';
  const steps = phases[currentPhase].steps;

  const fieldMeta = {
    Salutation: { label: "Salutation", type: "select", options: [] },
    FirstName: { label: "First Name", type: "text" },
    LastName: { label: "Last Name", type: "text" },
    Email: { label: "Email", type: "email" },
    Phone: { label: "Phone", type: "tel" },
    Gender: { label: "Gender", type: "select", options: ["Male","Female","Other","Prefer not to say"] },
    MaritalStatus: { label: "Marital Status", type: "select", options: [] },
    Country: { label: "Country", type: "select", options: [] },
    CountryOfOrigin: { label: "Country of Origin", type: "select", options: [] },
    PrimaryLanguage: { label: "Primary Language", type: "select", options: [] },
    LanguagesSpoken: { label: "Languages Spoken", type: "multiselect", options: [] },
    Skills: { label: "Skills", type: "multiselect", options: [] },
    Church: { label: "Church Name", type: "text" },
    ChurchServingDetails: { label: "Church Serving Details", type: "textarea" },
    HowHeard: { label: "How did you hear about us?", type: "select", options: [] },
    ServingInterest: { label: "Serving Interest", type: "multiselect", options: [] },
    PreferredServingArea: { label: "Preferred Serving Area", type: "select", options: [] },
    GospelDetails: { label: "Please share the Gospel", type: "textarea" },
    TestimonyDetails: { label: "Your Testimony", type: "textarea" },
    AdditionalNotes: { label: "Additional Notes", type: "textarea" },
    Availability: { label: "Availability", type: "multiselect", options: [] },
    AffirmStatementOfFaith: { label: "I affirm the Statement of Faith", type: "checkbox" },
    WillPay: { label: "I will cover my costs", type: "checkbox" },
    Birthdate: { label: "Birthdate", type: "date" },
    PastorSalutation: { label: "Pastor Salutation", type: "select", options: [] },
    PastorFirstName: { label: "Pastor First Name", type: "text" },
    PastorLastName: { label: "Pastor Last Name", type: "text" },
    PastorEmail: { label: "Pastor Email", type: "email" },
    EmergencyContactFirstName: { label: "First Name", type: "text" },
    EmergencyContactLastName: { label: "Last Name", type: "text" },
    EmergencyContactPhone: { label: "Phone", type: "tel" },
    EmergencyContactRelationship: { label: "Relationship", type: "select", options: [] },
    Street: { label: "Street", type: "text" },
    City: { label: "City", type: "text" },
    State: { label: "State", type: "select", options: [] },
    Zip: { label: "Zip Code", type: "text" },
    PastoralReferenceStatus: { label: "Status", type: "select", options: ["Pending","Submitted","Approved","Declined"] },
    PastoralReferenceNotes: { label: "Notes", type: "textarea" },
    BackgroundCheckStatus: { label: "Status", type: "select", options: ["Not Started","In Progress","Completed","Approved","Issues"] },
    BackgroundCheckDate: { label: "Completion Date", type: "date" },
    BackgroundCheckNotes: { label: "Notes", type: "textarea" },
    MinistrySafeCompleted: { label: "I have completed MinistrySafe training in the past 5 years", type: "checkbox" },
    MinistrySafeCompletionDate: { label: "Completion Date", type: "date" },
    MinistrySafeCertificate: { label: "Upload Certificate", type: "file", accept: ".pdf,.jpg,.jpeg,.png" },
    AdditionalDocumentsNotes: { label: "Additional Documents Notes", type: "textarea" },
    PlacementArea: { label: "Placement Area", type: "text" },
    PlacementStartDate: { label: "Start Date", type: "date" },
    PlacementNotes: { label: "Placement Notes", type: "textarea" },
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
    ServingInterest: 'ServingInterest__c',
    PreferredServingArea: 'PreferredServingArea__c',
    Availability: 'Availability__c',
    HowHeard: 'HowHeard__c',
    RecentMinistrySafe: 'RecentMinistrySafe__c',
    WillPay: 'WillPay__c',
    AdditionalNotes: 'AdditionalNotes__c',
    AffirmStatementOfFaith: 'AffirmStatementOfFaith__c',
    PastoralReferenceStatus: 'PastoralReferenceStatus__c',
    PastoralReferenceNotes: 'PastoralReferenceNotes__c',
    BackgroundCheckStatus: 'BackgroundCheckStatus__c',
    BackgroundCheckDate: 'BackgroundCheckDate__c',
    BackgroundCheckNotes: 'BackgroundCheckNotes__c',
    MinistrySafeCompleted: 'MinistrySafeCompleted__c',
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
    const meta = fieldMeta[name] || { label: name, type: "text" };
    const value = data[name] ?? "";
    const wrapper = h("div", { class: "ri-field" });

    if (meta.type === "checkbox") {
      const input = h("input", { type: "checkbox", id: name, checked: !!value, onchange: e => { 
        data[name] = e.target.checked;
        autoSave();
        if (name === "MinistrySafeCompleted") renderForm();
      }});
      const row = h("div", { class: "ri-checkbox" }, input, h("label", { for: name, text: meta.label }));
      wrapper.append(row);
      
      // Show certificate upload if MinistrySafe is checked
      if (name === "MinistrySafeCompleted" && value) {
        const certField = fieldFor("MinistrySafeCertificate");
        const dateField = fieldFor("MinistrySafeCompletionDate");
        wrapper.append(dateField, certField);
      }
      return wrapper;
    }

    const label = h("label", { for: name, text: meta.label });
    let control;

    // Hide fields that are represented via combined UI
    if (name === 'PreferredServingArea' || name === 'LanguagesSpoken') {
      // Render a hidden input to ensure the value is present for saves, but do not show a separate control
      const hiddenVal = (Array.isArray(data[name]) ? data[name].join('|') : (data[name] || ''));
      control = h('input', { type: 'hidden', id: name, value: hiddenVal });
      wrapper.append(control);
      return wrapper;
    }
    
    // Combined UI: ServingInterest controls PreferredServingArea as primary
    if (name === 'ServingInterest') {
      const opts = fieldMeta.PreferredServingArea?.options || [];
      const curVals = Array.isArray(data[name]) && data[name].length > 0 ? data[name] : [];
      const primary = data.PreferredServingArea || '';
      const container = h('div', { class: 'ri-multiselect-box' });
      if (opts.length === 0) container.append(h('div', { class: 'ri-muted', text: 'No options available' }));
      opts.forEach((opt, i) => {
        const val = (opt && typeof opt === 'object') ? (opt.value ?? opt.text ?? '') : opt;
        const txt = (opt && typeof opt === 'object') ? (opt.text ?? opt.value ?? '') : opt;
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return;
        const idOpt = `${name}__${i}`;
        const chk = h("input", { type: "checkbox", id: idOpt, checked: curVals.includes(val), onchange: e => {
          const prev = Array.isArray(data[name]) ? Array.from(data[name]) : [];
          const set = new Set(prev);
          if (e.target.checked) set.add(val); else set.delete(val);
          data[name] = Array.from(set);
          // If we cleared the primary, remove it
          if (!data[name].includes(primary)) {
            if (data.PreferredServingArea === val && !data[name].includes(val)) data.PreferredServingArea = '';
          }
          autoSave();
        }});
        const lab = h("label", { for: idOpt, text: txt });
        const isStarred = (primary === val);
        const star = h('button', { type: 'button', class: isStarred ? 'ri-star ri-starred' : 'ri-star', title: 'Mark as primary' });
        star.innerHTML = isStarred ? '&#9733;' : '&#9734;';
        star.onclick = (e) => {
          e.preventDefault();
          if (!Array.isArray(data[name])) data[name] = [];
          if (!data[name].includes(val)) data[name].push(val);
          // Toggle primary: unset if already set
          if (data.PreferredServingArea === val) {
            data.PreferredServingArea = '';
          } else {
            data.PreferredServingArea = val;
          }
          autoSave();
          // Update all stars in this container without re-rendering entire form
          const allStars = container.querySelectorAll('.ri-star');
          allStars.forEach((s, idx) => {
            const starVal = opts[idx] && typeof opts[idx] === 'object' ? (opts[idx].value ?? opts[idx].text ?? '') : opts[idx];
            const starTxtNorm = (opts[idx] && typeof opts[idx] === 'object' ? (opts[idx].text ?? opts[idx].value ?? '') : opts[idx]).toString().trim().toLowerCase();
            if (!starVal || starTxtNorm === '' || starTxtNorm.startsWith('select')) return;
            const isNowStarred = (data.PreferredServingArea === starVal);
            s.innerHTML = isNowStarred ? '&#9733;' : '&#9734;';
            if (isNowStarred) s.classList.add('ri-starred'); else s.classList.remove('ri-starred');
          });
        };
        container.append(h("div", { class: "ri-checkbox" }, chk, lab, star));
      });
      container.append(h('div', { class: 'ri-muted', text: "Tap items to select; click the star to mark the primary." }));
      wrapper.append(label, container);
      return wrapper;
    }

    // Combined UI: PrimaryLanguage controls LanguagesSpoken as a combined UI
    if (name === 'PrimaryLanguage') {
      const opts = fieldMeta.PrimaryLanguage?.options || [];
      const curVals = Array.isArray(data.LanguagesSpoken) && data.LanguagesSpoken.length > 0 ? data.LanguagesSpoken : [];
      const primary = data.PrimaryLanguage || '';
      const container = h('div', { class: 'ri-multiselect-box' });
      if (opts.length === 0) container.append(h('div', { class: 'ri-muted', text: 'No options available' }));
      opts.forEach((opt, i) => {
        const val = (opt && typeof opt === 'object') ? (opt.value ?? opt.text ?? '') : opt;
        const txt = (opt && typeof opt === 'object') ? (opt.text ?? opt.value ?? '') : opt;
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return;
        const idOpt = `PrimaryLanguage__${i}`;
        const chk = h("input", { type: "checkbox", id: idOpt, checked: curVals.includes(val), onchange: e => {
          const prev = Array.isArray(data.LanguagesSpoken) ? Array.from(data.LanguagesSpoken) : [];
          const set = new Set(prev);
          if (e.target.checked) set.add(val); else set.delete(val);
          data.LanguagesSpoken = Array.from(set);
          // If primary was cleared
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
          // Toggle primary language
          if (data.PrimaryLanguage === val) {
            data.PrimaryLanguage = '';
          } else {
            data.PrimaryLanguage = val;
          }
          autoSave();
          // Update all stars in this container without re-rendering entire form
          const allStars = container.querySelectorAll('.ri-star');
          allStars.forEach((s, idx) => {
            const starVal = opts[idx] && typeof opts[idx] === 'object' ? (opts[idx].value ?? opts[idx].text ?? '') : opts[idx];
            const starTxtNorm = (opts[idx] && typeof opts[idx] === 'object' ? (opts[idx].text ?? opts[idx].value ?? '') : opts[idx]).toString().trim().toLowerCase();
            if (!starVal || starTxtNorm === '' || starTxtNorm.startsWith('select')) return;
            const isNowStarred = (data.PrimaryLanguage === starVal);
            s.innerHTML = isNowStarred ? '&#9733;' : '&#9734;';
            if (isNowStarred) s.classList.add('ri-starred'); else s.classList.remove('ri-starred');
          });
        };
        container.append(h("div", { class: "ri-checkbox" }, chk, lab, star));
      });
      container.append(h('div', { class: 'ri-muted', text: "Tap items to select languages; click the star to mark your primary language." }));
      wrapper.append(label, container);
      return wrapper;
    }

    if (meta.type === "file") {
      control = h("input", { id: name, type: "file", accept: meta.accept || "*" });
      control.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          fileUploads[name] = file;
          data[name] = file.name;
        }
      };
      if (fileUploads[name]) {
        const fileInfo = h("div", { class: "ri-file-info", text: `Selected: ${fileUploads[name].name}` });
        wrapper.append(label, control, fileInfo);
      } else {
        wrapper.append(label, control);
      }
    } else if (meta.type === "select") {
      control = h("select", { id: name, onchange: e => { 
        data[name] = e.target.value;
        autoSave();
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
        // Skip empty/placeholder options from lookup (e.g., "", "Select a ...")
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
      const opts = meta.options || [];
      const curVals = Array.isArray(value) ? value : (typeof value === 'string' ? value.split('|').map(s => s.trim()).filter(Boolean) : []);
      if ((opts || []).length === 0) {
        container.append(h('div', { class: 'ri-muted', text: 'No options available' }));
      }
      opts.forEach((opt, i) => {
        const val = (opt && typeof opt === 'object') ? (opt.value ?? opt.text ?? '') : opt;
        const txt = (opt && typeof opt === 'object') ? (opt.text ?? opt.value ?? '') : opt;
        const txtNorm = (txt || '').toString().trim().toLowerCase();
        // Skip placeholder/blank options
        if (!val || txtNorm === '' || txtNorm.startsWith('select')) return;
        const idOpt = `${name}__${i}`;
        const chk = h("input", { type: "checkbox", id: idOpt, checked: curVals.includes(val), onchange: e => {
          const prev = Array.isArray(data[name]) ? Array.from(data[name]) : Array.from(curVals);
          const set = new Set(prev);
          if (e.target.checked) set.add(val); else set.delete(val);
          data[name] = Array.from(set);
          autoSave();
        }});
        const lab = h("label", { for: idOpt, text: txt });
        container.append(h("div", { class: "ri-checkbox" }, chk, lab));
      });
      // helper
      container.append(h('div', { class: 'ri-muted', text: "Tap the items you want to select — multiple selections are allowed." }));
      wrapper.append(label, container);
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
      }, phase.name);
      phaseIndicatorEl.append(chip);
    });
  };

  const renderStepper = () => {
    renderPhaseIndicator();
    stepperEl.innerHTML = "";
    const currentSteps = phases[currentPhase].steps;
    currentSteps.forEach((s, idx) => {
      const stepKey = `${currentPhase}-${idx}`;
      const isCompleted = completedSteps.has(stepKey);
      const isActive = idx === currentStep;
      
      const chipContent = [];
      if (isCompleted) {
        const checkmark = h('span', { class: 'ri-checkmark' });
        checkmark.innerHTML = '&#10003;';
        chipContent.push(checkmark);
      }
      chipContent.push(h('span', { text: `${idx + 1}. ${s.title}` }));
      
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
      stepperEl.append(chip);
    });
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
    const requiredByStep = {
      "Basic Information": ["FirstName", "LastName", "Email"],
      "Personal Details": ["Gender"],
      "Address": ["Street", "City", "State"],
      "Church & Ministry": ["Church"],
      "Emergency Contact": ["EmergencyContactFirstName", "EmergencyContactLastName", "EmergencyContactPhone"],
      "What You'd Like to Do": ["ServingInterest"],
      "Your Faith Journey": ["GospelDetails", "TestimonyDetails"],
      "Commitments & Agreement": ["AffirmStatementOfFaith"],
      "Pastor Contact Information": ["PastorFirstName", "PastorLastName", "PastorEmail"],
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
    formEl.append(h("h3", { text: step.title, class: "ri-step-title" }));
    let grid;
    if (step.title === 'Address') {
      const searchInput = h('input', { id: 'Street', placeholder: 'Search address (type 3+ chars)...', value: data.Street || '', oninput: debounce(async (e) => {
        const q = e.target.value;
        data.Street = q;
        const items = await searchAddress(q);
        renderAddressSuggestions(items, addressSuggestionsEl);
      }) });
      addressSuggestionsEl = h('div', { class: 'ri-address-suggestions' });
      const manualBtn = h('button', { class: 'ri-btn ri-btn-ghost', type: 'button', text: manualAddressMode ? 'Hide Manual' : 'Enter Manually' });
      manualBtn.onclick = () => { manualAddressMode = !manualAddressMode; renderForm(); };
      grid = h('div', { class: 'ri-grid' }, h('div', { class: 'ri-field' }, h('label', { text: 'Street / Address' }), searchInput, addressSuggestionsEl, manualBtn));
      if (manualAddressMode || data.City || data.State || data.Zip || data.Country) {
        ['City','State','Zip','Country'].forEach(n => grid.append(fieldFor(n)));
      }
    } else {
      grid = h("div", { class: "ri-grid" }, step.fields.map(fieldFor));
    }
    const actions = h("div", { class: "ri-actions" },
      h("button", { class: "ri-btn ri-btn-ghost", type: "button", disabled: currentStep === 0, onclick: () => { currentStep = Math.max(0, currentStep - 1); renderForm(); } }, "Back"),
      h("button", { class: "ri-btn ri-btn-primary", type: "submit" }, currentStep === currentSteps.length - 1 ? "Complete Phase" : "Next")
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
    
    const title = h("h2", { text: "Volunteer Application", class: "ri-landing-title" });
    const subtitle = h("p", { text: "Thank you for your interest in serving! We're excited to get to know you. Your progress is automatically saved as you go.", class: "ri-landing-subtitle" });
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
    landingEl.append(title, subtitle, btnContainer);
  };

  const host = document.getElementById(HOST_ID) || document.body;
  const container = h("div", { class: "ri-app" },
    h("div", { class: "ri-card" },
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
