(() => {
  const ENDPOINT = "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form"; // TODO: replace with real endpoint
  const HOST_ID = "volunteer-app"; // optional host div id; falls back to body

  // Attempt to inject CSS from the same folder as this script
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

  // Utility to create elements
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
    Zip: 'PostalCode__c',
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
    AffirmStatementOfFaith: 'AffirmStatementOfFaith__c'
  };

  const data = {};
  let formCode = null;
  let currentStep = 0;
  let statusEl, bannerEl, stepperEl, formEl;

  const setStatus = (msg, kind = "") => {
    statusEl.innerHTML = "";
    if (!msg) return;
    statusEl.append(h("div", { class: `ri-alert ${kind}` }, msg));
  };

  // Show a persistent banner with the resume code, copy and dismiss controls
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
      stepperEl.append(chip);
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
    // Translate frontend keys to Salesforce API names using fieldToSf mapping
    const payload = {};
    // include metadata fields using mapped names when available
    payload[fieldToSf.FormCode || 'FormCode'] = formCode || undefined;
    payload[fieldToSf.Step || 'Step'] = currentStep;
    Object.entries(data).forEach(([k, v]) => {
      const sfKey = fieldToSf[k] || k;
      payload[sfKey] = v;
    });

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
    const res = await fetch(`${ENDPOINT}?FormCode=${encodeURIComponent(code)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || res.statusText || "Not found");
    Object.assign(data, json);
    formCode = json.FormCode || code;
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
    const grid = h("div", { class: "ri-grid" }, step.fields.map(fieldFor));
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
