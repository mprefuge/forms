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

  const steps = [
    { title: "Your Info", fields: ["Salutation","FirstName","LastName","Email","Phone","Gender","Birthdate","MaritalStatus","CountryOfOrigin","PrimaryLanguage","LanguagesSpoken"] },
    { title: "Address", fields: ["Street","City","State","Zip","Country"] },
    { title: "Background", fields: ["Skills","Church","ChurchServingDetails","HowHeard","RecentMinistrySafe"] },
    { title: "Pastor", fields: ["PastorSalutation","PastorFirstName","PastorLastName","PastorEmail","Church"] },
    { title: "Emergency", fields: ["EmergencyContactFirstName","EmergencyContactLastName","EmergencyContactPhone","EmergencyContactRelationship"] },
    { title: "Interests", fields: ["ServingInterest","PreferredServingArea","Availability"] },
    { title: "Story & Agreements", fields: ["GospelDetails","TestimonyDetails","AdditionalNotes","AffirmStatementOfFaith","WillPay"] },
  ];

  const fieldMeta = {
    Salutation: { label: "Salutation", type: "select", options: ["Mr","Mrs","Ms","Dr","Rev","Pastor","Other"] },
    Gender: { label: "Gender", type: "select", options: ["Male","Female","Other","Prefer not to say"] },
    MaritalStatus: { label: "Marital Status", type: "select", options: ["Single","Married","Separated","Divorced","Widowed"] },
    Country: { label: "Country", type: "text", placeholder: "United States" },
    CountryOfOrigin: { label: "Country of Origin", type: "text" },
    PrimaryLanguage: { label: "Primary Language", type: "text" },
    LanguagesSpoken: { label: "Languages Spoken", type: "text" },
    Skills: { label: "Skills", type: "textarea" },
    ChurchServingDetails: { label: "Serving Details", type: "textarea" },
    GospelDetails: { label: "Gospel Details", type: "textarea" },
    TestimonyDetails: { label: "Testimony", type: "textarea" },
    AdditionalNotes: { label: "Additional Notes", type: "textarea" },
    Availability: { label: "Availability", type: "textarea" },
    RecentMinistrySafe: { label: "Recent MinistrySafe?", type: "checkbox" },
    AffirmStatementOfFaith: { label: "Affirm Statement of Faith", type: "checkbox" },
    WillPay: { label: "I will cover my costs", type: "checkbox" },
    Birthdate: { label: "Birthdate", type: "date" },
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
    FormCode: 'FormCode__c'
  };

  // Inverted mapping: SF API name -> client field key (for loading responses)
  const sfToField = Object.entries(fieldToSf).reduce((acc, [k, v]) => {
    acc[v] = k;
    return acc;
  }, {});

  const data = {};
  let formCode = null;
  let currentStep = 0;
  let statusEl, bannerEl, stepperEl, formEl;
  let manualAddressMode = false;
  let firstPageSaved = false;
  let addressSuggestionsEl = null;

  const setStatus = (msg, kind = "") => {
    statusEl.innerHTML = "";
    if (!msg) return;
    statusEl.append(h("div", { class: `ri-alert ${kind}` }, msg));
  };

  const showBanner = (code) => {
    if (!bannerEl) return;
    bannerEl.innerHTML = '';
    const text = h('div', { text: 'Need to take a break? Resume your progress by entering in your code:' });
    const codeSpan = h('strong', { text: ` ${code}` });
    const copyBtn = h('button', { class: 'ri-btn ri-btn-ghost', type: 'button', text: 'Copy' });
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
    const dismiss = h('button', { class: 'ri-btn', type: 'button', text: 'Dismiss' });
    dismiss.onclick = () => { bannerEl.style.display = 'none'; };
    bannerEl.append(text, codeSpan, copyBtn, dismiss);
    bannerEl.style.display = 'flex';
  };

  const fieldFor = (name) => {
    const meta = fieldMeta[name] || { label: name, type: "text" };
    const value = data[name] ?? "";
    const wrapper = h("div", { class: "ri-field" });

    if (meta.type === "checkbox") {
      const input = h("input", { type: "checkbox", id: name, checked: !!value, onchange: e => data[name] = e.target.checked });
      const row = h("div", { class: "ri-checkbox" }, input, h("label", { for: name, text: meta.label }));
      wrapper.append(row);
      return wrapper;
    }

    const label = h("label", { for: name, text: meta.label });
    let control;
    if (meta.type === "select") {
      control = h("select", { id: name, onchange: e => data[name] = e.target.value });
      control.append(h("option", { value: "" }, "Select..."));
      (meta.options || []).forEach(opt => control.append(h("option", { value: opt, text: opt })));
      control.value = value;
    } else if (meta.type === "textarea") {
      control = h("textarea", { id: name, placeholder: meta.placeholder || "", oninput: e => data[name] = e.target.value }, value);
    } else {
      control = h("input", { id: name, type: meta.type || "text", placeholder: meta.placeholder || "", value, oninput: e => data[name] = e.target.value });
    }
    wrapper.append(label, control);
    return wrapper;
  };

  const renderStepper = () => {
    stepperEl.innerHTML = "";
    steps.forEach((s, idx) => {
      const chip = h("div", { class: `ri-chip ${idx === currentStep ? "active" : ""}` }, `${idx + 1}. ${s.title}`);
      chip.style.cursor = 'pointer';
      chip.onclick = () => {
        if (idx === currentStep) return;
        if (idx > 0 && !firstPageSaved) {
          setStatus('Complete the first page (Name & Email) to access other stages.', 'error');
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
    if (currentStep !== 0) return true;
    const required = ["FirstName", "LastName", "Email"];
    const missing = required.filter(k => !data[k]);
    if (missing.length) {
      setStatus(`Please fill: ${missing.join(", ")}`, "error");
      return false;
    }
    return true;
  };

  const saveProgress = async () => {
    const payload = {};
    const stepFields = (steps[currentStep] && steps[currentStep].fields) ? steps[currentStep].fields : Object.keys(data);

    stepFields.forEach((k) => {
      if (!(k in data)) return;
      const v = data[k];
      if (v === undefined || v === null) return;
      if (typeof v === 'string' && v.trim() === '') return;
      const sfKey = fieldToSf[k] || k;
      payload[sfKey] = v;
    });


    if (formCode) {
      payload['FormCode__c'] = formCode;
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

  const loadByCode = async (code) => {
    // Try GET with different query param names, then fallback to POST with JSON body
    const tryUrls = [
      `${ENDPOINT}?FormCode=${encodeURIComponent(code)}`,
      `${ENDPOINT}?FormCode__c=${encodeURIComponent(code)}`,
    ];

    const normalizeAndAssign = (json) => {
      // Convert SF field names to client keys when possible
      Object.entries(json).forEach(([k, v]) => {
        if (sfToField[k]) data[sfToField[k]] = v;
        else data[k] = v;
      });
    };

    for (const url of tryUrls) {
      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          normalizeAndAssign(json);
          firstPageSaved = true;
          const returnedCode = json?.FormCode || json?.Form_Code__c || json?.formCode || json?.form_code || code;
          formCode = returnedCode;
          if (formCode) showBanner(formCode);
          return json;
        }
      } catch (e) {
        // continue to next attempt
      }
    }

    // Fallback: POST body with FormCode__c
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ FormCode__c: code }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        normalizeAndAssign(json);
        firstPageSaved = true;
        const returnedCode = json?.FormCode || json?.Form_Code__c || json?.formCode || json?.form_code || code;
        formCode = returnedCode;
        if (formCode) showBanner(formCode);
        return json;
      }
      throw new Error(json.message || res.statusText || 'Not found');
    } catch (e) {
      throw e;
    }
  };

  const doSubmit = async (stay = false) => {
    setStatus("", "");
    if (!validateStep()) return;
    const submitBtn = formEl.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.innerHTML = '<span class="ri-loader"></span>';
    try {
      const res = await saveProgress();
      // accept a variety of server response keys for the code
      const returnedCode = res?.FormCode || res?.Form_Code__c || res?.formCode || res?.form_code || res?.Form_Code || res?.form_code__c;
      if (returnedCode) {
        formCode = returnedCode;
        showBanner(formCode);
        if (currentStep === 0) firstPageSaved = true;
      }
      setStatus("Progress saved.", "success");
      if (!stay && currentStep < steps.length - 1) {
        currentStep += 1;
        renderForm();
      } else if (!stay && currentStep === steps.length - 1) {
        setStatus("Application submitted. Thank you!", "success");
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
    const step = steps[currentStep];
    formEl.innerHTML = "";
    formEl.append(h("h3", { text: step.title, class: "ri-step-title" }));
    let grid;
    if (step.title === 'Address') {
      // Address lookup + manual fields
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
      h("div", { style: "display:flex; gap:8px;" },
        h("button", { class: "ri-btn ri-btn-ghost", type: "button", onclick: () => doSubmit(true) }, "Save"),
        h("button", { class: "ri-btn ri-btn-primary", type: "submit" }, currentStep === steps.length - 1 ? "Submit" : "Next")
      )
    );
    formEl.append(grid, actions);
  };

  const renderResumeBox = () => {
    const input = h("input", { placeholder: "Have a code? Enter to resume" });
    const btn = h("button", { class: "ri-btn ri-btn-ghost", type: "button", text: "Load" });
    btn.onclick = async () => {
      const code = (input.value || "").trim();
      if (!code) return setStatus("Enter a code to load.", "error");
      btn.disabled = true;
      setStatus("Loading...", "");
      try {
        await loadByCode(code);
        renderForm();
        if (formCode) showBanner(formCode);
        setStatus("Draft loaded.", "success");
      } catch (e) {
        setStatus(e.message, "error");
      } finally {
        btn.disabled = false;
      }
    };
    return h("div", { class: "ri-resume-box" }, input, btn);
  };

  const host = document.getElementById(HOST_ID) || document.body;
  const container = h("div", { class: "ri-app" },
    h("div", { class: "ri-card" },
      h("div", { class: "ri-header" },
        h("h2", { class: "ri-title", text: "Refuge Application" }),
        h("div", { class: "ri-subtitle", text: "Save as you go. Come back with your code." })
      ),
      bannerEl = h("div", { class: "ri-banner" }, "Need to pause?"),
      renderResumeBox(),
      stepperEl = h("div", { class: "ri-stepper" }),
      formEl = h("form", { class: "ri-form", onsubmit: e => { e.preventDefault(); doSubmit(false); } }),
      statusEl = h("div", { class: "ri-status" })
    )
  );

  host.appendChild(container);
  renderForm();
})();
