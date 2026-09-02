(() => {
  // Configuration: Set window.FORMS_CONFIG before loading this script to override defaults
  // For production, add this single block before the script tag:
  // <script>
  //   window.FORMS_CONFIG = { apiEndpoint: 'https://your-app.azurewebsites.net/api/form' };
  // </script>
  const config = window.FORMS_CONFIG || {};
  // Ensure disableAddressLookup defaults to true (disabled) when not provided
  config.disableAddressLookup = config.hasOwnProperty('disableAddressLookup') ? !!config.disableAddressLookup : true;
  const ENDPOINT = config.apiEndpoint || "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form";  //"http://localhost:7071/api/form";
  const HOST_ID = "waiver-app";

  // Optional telemetry (send to config.telemetryEndpoint if provided; otherwise keep a small local buffer)
  const TELEMETRY_ENDPOINT = config.telemetryEndpoint || '';
  const TELEMETRY_KEY = 'ri_telemetry_waiver';
  const TELEMETRY_SESSION_KEY = 'ri_telemetry_session_waiver';

  const getTelemetrySessionId = () => {
    try {
      const existing = localStorage.getItem(TELEMETRY_SESSION_KEY);
      if (existing) return existing;
      const id = `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem(TELEMETRY_SESSION_KEY, id);
      return id;
    } catch (e) {
      return `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
  };

  const telemetry = (() => {
    const sessionId = getTelemetrySessionId();
    let queue = [];
    let flushTimer = null;

    const enqueue = (evt) => {
      try {
        queue.push({
          ...evt,
          ts: new Date().toISOString(),
          sessionId,
          formId: 'waiver',
          url: (typeof location !== 'undefined' && location.href) ? location.href : '',
          ua: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : ''
        });
        if (queue.length >= 10) {
          flush();
        } else if (!flushTimer) {
          flushTimer = setTimeout(flush, 8000);
        }
      } catch (e) {}
    };

    const storeLocal = (events) => {
      try {
        const prev = JSON.parse(localStorage.getItem(TELEMETRY_KEY) || '[]');
        const next = prev.concat(events).slice(-50);
        localStorage.setItem(TELEMETRY_KEY, JSON.stringify(next));
      } catch (e) {}
    };

    const flush = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (!queue.length) return;
      const batch = queue;
      queue = [];

      if (!TELEMETRY_ENDPOINT) {
        storeLocal(batch);
        return;
      }

      try {
        const payload = JSON.stringify({ events: batch });
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(TELEMETRY_ENDPOINT, payload);
        } else if (typeof fetch === 'function') {
          fetch(TELEMETRY_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
        } else {
          storeLocal(batch);
        }
      } catch (e) {
        storeLocal(batch);
      }
    };

    return { enqueue, flush };
  })();

  if (typeof window !== 'undefined') {
    // Guard against multiple listener attachments when multiple forms load
    if (!window.__globalErrorListenersAttached) {
      window.__globalErrorListenersAttached = true;

      window.addEventListener('error', (e) => {
        telemetry.enqueue({
          type: 'error',
          message: e && e.message ? String(e.message) : 'Unknown error',
          stack: e && e.error && e.error.stack ? String(e.error.stack) : '',
          source: e && e.filename ? String(e.filename) : ''
        });
      });

      window.addEventListener('unhandledrejection', (e) => {
        telemetry.enqueue({
          type: 'unhandledrejection',
          message: e && e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled rejection',
          stack: e && e.reason && e.reason.stack ? String(e.reason.stack) : ''
        });
        try { if (e && typeof e.preventDefault === 'function') e.preventDefault(); } catch (err) {}
      });
    }
  }

  // Organization terminology
  let orgTerms = {
    orgName: "Refuge International",
    programName: "The Nations Next Door",
    address: {
      street: "5590 Bruce Ave",
      city: "Louisville",
      state: "KY",
      zip: "40214",
      website: "refugeintl.org"
    },
    labels: {
      Zip: "Zip Code",
      State: "State",
      Country: "Country",
    },
    phaseNames: {
      initial: "Waiver and Release Form of Liability",
    }
  };

  // ============================================================================
  // FORM CONFIGURATION (Parental Waiver)
  // ============================================================================

  const FORM_CONFIG = {
    id: 'waiver',
    name: 'Waiver and Release Form of Liability',
    subtitle: 'The Nations Next Door',
    salesforce: {
      objectName: 'Form__c',
      recordTypeName: 'TNND Waiver',
      skipContactCreation: true, // Waiver form doesn't need contact records
      allowedFields: [
        // Volunteer Information
        'ParentFirstName__c', 'ParentLastName__c', 'FirstName__c', 'LastName__c', 'Church__c',
        'Street__c', 'City__c', 'State__c', 'Zip__c', 'Country__c',
        'Email__c', 'Phone__c',
        
        // Legal Acknowledgments
        'ReleaseOfLiability__c', 'NegligenceClause__c', 'RiskAcknowledgment__c',
        'VulnerablePopulationsAcknowledgment__c', 'SeverabilityClause__c',
        'MedicalConsent__c', 'ContractAcknowledgment__c',
        
        // Signatures
        'ParentSignature__c', 'ParentSignatureDate__c',
        'TransportationConsentSignature__c', 'TransportationConsentDate__c',
        
        // Consents
        'EmailUpdatesConsent__c', 'TransportationConsent__c', 'PhotoRelease__c',
      ],
      queryFields: [
        'Id', 'FormCode__c', 'ParentFirstName__c', 'ParentLastName__c', 'FirstName__c', 'LastName__c', 'Email__c',
        'CreatedDate'
      ],
      updateFields: [],
      searchField: 'FormCode__c',
      lookupEmailField: 'Email__c'
    }
  };

  const injectCSS = () => {
    try {
      const scriptEl = document.currentScript;
      if (!scriptEl) return;
      const cssHref = new URL("./waiver.css", scriptEl.src).toString();
      const exists = Array.from(document.styleSheets).some(ss => ss.href && ss.href.includes("waiver.css"));
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

  try { if (typeof window !== 'undefined') { window.__riTest = window.__riTest || {}; } } catch (e) {}

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const initialState = {
    phase: 'initial',
    step: 0,
    // Default preference: agree to receive periodic updates
    formData: { ReceiveUpdates: true },
    formCode: null,
    status: null,
    error: null,
    loading: false,
  };
  let state = { ...initialState };

  // optional override when running inside a modal so we can target a specific
  // container element instead of always using the element identified by HOST_ID
  let hostOverride = null;
  let activeModalClose = null;

  function getContainer() {
    return hostOverride || document.getElementById(HOST_ID);
  }

  function resetState() {
    state = { ...initialState };
    // keep signature dates in sync when resetting
    const today = new Date().toISOString().split('T')[0];
    state.formData.ParentSignatureDate__c = today;
    state.formData.TransportationConsentDate__c = today;
  }

  // ============================================================================
  // FORM STRUCTURE
  // ============================================================================
  const formStructure = {
    initial: {
      title: orgTerms.phaseNames.initial,
      steps: [
        {
          title: 'Volunteer Information',
          description: 'Please provide your contact information',
          fields: [
            { key: 'ParentFirstName__c', label: 'Parent/Guardian First Name (if under 18)', type: 'text', required: false },
            { key: 'ParentLastName__c', label: 'Parent/Guardian Last Name (if under 18)', type: 'text', required: false },
            { key: 'FirstName__c', label: 'Participant First Name', type: 'text', required: true },
            { key: 'LastName__c', label: 'Participant Last Name', type: 'text', required: true },
            { key: 'Church__c', label: 'Church', type: 'text', required: false },
            { key: 'Street__c', label: 'Street Address', type: 'text', required: true },
            { key: 'City__c', label: 'City', type: 'text', required: true },
            { key: 'State__c', label: orgTerms.labels.State, type: 'text', required: true },
            { key: 'Zip__c', label: orgTerms.labels.Zip, type: 'text', required: true },
            { key: 'Country__c', label: orgTerms.labels.Country, type: 'text', required: true },
            { key: 'Email__c', label: 'Email', type: 'email', required: true },
            { key: 'Phone__c', label: 'Phone Number', type: 'tel', required: true },
          ]
        },
        {
          title: 'Legal Acknowledgments',
          description: 'Please read and acknowledge the following statements',
          fields: [
            { 
              key: 'ReleaseOfLiability__c', 
              label: 'Release of Liability', 
              type: 'checkbox', 
              required: true,
              text: 'In return for being allowed to participate in Refuge International\'s "The Nations Next Door", I release and agree to hold harmless Refuge International or its directors, employees, sub-contractors, donors, and affiliates from all present and future claims that may be made by me, my family, estate, heirs, or assigns for property damage, personal injury, or wrongful death arising as a result of my participation.'
            },
            { 
              key: 'NegligenceClause__c', 
              label: 'Negligence Clause', 
              type: 'checkbox', 
              required: true,
              text: 'I understand and agree that the Organization is not responsible for any injury or property damage arising out of "The Nations Next Door," even if caused by their ordinary negligence or otherwise.'
            },
            { 
              key: 'RiskAcknowledgment__c', 
              label: 'Risk Acknowledgment', 
              type: 'checkbox', 
              required: true,
              text: 'I understand that participation in "The Nations Next Door" involves certain risks, up to and including, but not limited to, mental or emotional trauma, serious physical injury, and death.'
            },
            { 
              key: 'VulnerablePopulationsAcknowledgment__c', 
              label: 'Vulnerable Populations Acknowledgment', 
              type: 'checkbox', 
              required: true,
              text: 'I am aware that I will be working with vulnerable populations (including refugees, immigrants, and young children) possibly in their place of residence. I understand that this comes with a unique set of possible risks and repercussions and I voluntarily agree to accept all risks of participation.'
            },
            { 
              key: 'SeverabilityClause__c', 
              label: 'Severability Clause', 
              type: 'checkbox', 
              required: true,
              text: 'I understand that this document is intended to be as broad and inclusive as permitted by the laws of the state in which "The Nations Next Door" takes place and agree that if any portion of this Agreement is invalid, the remainder will continue in full legal force and effect.'
            },
            { 
              key: 'MedicalConsent__c', 
              label: 'Medical Consent', 
              type: 'checkbox', 
              required: true,
              text: 'I agree and consent to the provision of medical treatment in the event of an accident or emergency and accept full financial responsibility for any such treatment provided to me.'
            },
            { 
              key: 'ContractAcknowledgment__c', 
              label: 'Contract Acknowledgment', 
              type: 'checkbox', 
              required: true,
              text: 'I understand that this document is a contract which grants certain rights to and eliminates the liability of the Organization.'
            },
          ]
        },
        {
          title: 'Signatures & Consents',
          description: 'Please sign and provide consent to submit',
          fields: [
            { key: 'ParentSignature__c', label: 'Parent/Legal Guardian Signature (Full Name)', type: 'text', required: true, placeholder: 'Type your full name' },
            { key: 'ParentSignatureDate__c', label: 'Date of Signature', type: 'date', required: true },
            { 
              key: 'SignatureAcknowledgment__c', 
              label: 'Signature Acknowledgment', 
              type: 'checkbox', 
              required: true,
              text: 'I am the parent or legal guardian of the Volunteer. I am of legal age and am freely signing this agreement. I have read this form and understand that by signing this form, I am giving up legal rights and remedies.'
            },
            { key: 'TransportationConsentSignature__c', label: 'Transportation Consent Signature (Full Name)', type: 'text', required: true, placeholder: 'Type your full name' },
            { key: 'TransportationConsentDate__c', label: 'Transportation Consent Date', type: 'date', required: true },
            { 
              key: 'TransportationConsent__c', 
              label: 'Transportation Consent', 
              type: 'checkbox', 
              required: true,
              text: 'I give my permission for my child to ride in any vehicle designated by "The Nations Next Door" adult employees and adult volunteers while participating in "The Nations Next Door" summer events.'
            },
            {
              key: 'PhotoRelease__c',
              label: 'Photo Release Consent',
              type: 'checkbox',
              required: true,
              text: 'I grant Refuge International permission to use photographs and images of me (or my child) for promotional, outreach, educational, and organizational purposes.'
            },
            { 
              key: 'EmailUpdatesConsent__c', 
              label: 'Email Updates Consent', 
              type: 'checkbox', 
              required: false,
              text: 'By signing this form, I would like to receive news and updates about Refuge International!.'
            },
          ]
        }
      ]
    }
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  function updateState(updates) {
    state = { ...state, ...updates };
    render();
  }

  function setError(message) {
    updateState({ error: message, loading: false });
  }

  function clearError() {
    updateState({ error: null });
  }

  // Lookup + Address utilities
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
      Country: 'countries',
      State: 'states',
      Gender: 'genders',
      EmergencyContactRelationship: 'relationship'
    };

    Object.entries(map).forEach(([baseField, key]) => {
      const rawOpts = lookup[key];
      // Provide minimal sensible fallbacks if lookup doesn't return data
      const fallback = baseField === 'Country' ? ['United States', 'Canada', 'United Kingdom'] : baseField === 'State' ? ['Alabama','Alaska','Arizona','Arkansas','California'] : [];
      const source = Array.isArray(rawOpts) ? rawOpts : fallback;
      if (!Array.isArray(source) || source.length === 0) return;
      // Normalize options to { value, label }
      const opts = source.map(o => {
        if (o === null || o === undefined) return null;
        if (typeof o === 'string') return { value: String(o), label: String(o) };
        // object heuristics
        const value = o.value ?? o.code ?? o.id ?? o.name ?? o.label ?? String(o);
        const label = o.label ?? o.name ?? o.value ?? o.code ?? String(o);
        return { value: String(value), label: String(label) };
      }).filter(opt => opt && String(opt.value).trim() !== '');

      // Find matching fields in formStructure and inject options
      Object.values(formStructure).forEach(phase => {
        phase.steps.forEach(step => {
          step.fields.forEach(f => {
            const base = f.key.replace(/__c$/,'');
            if (base === baseField) {
              if (!f.options || f.options.length === 0) {
                f.options = opts;
              }
              // Ensure the field renders as a select when options exist
              f.type = 'select';
            }
          });
        });
      });
    });

    // Re-render so selects are populated
    render();
  };

  const debounce = (fn, wait = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };

  let addressSearchAbort = null;

  const searchAddress = async (q) => {
    if (!q || q.length < 3) return [];
    try {
      if (addressSearchAbort && typeof addressSearchAbort.abort === 'function') {
        addressSearchAbort.abort();
      }
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      if (controller) addressSearchAbort = controller;

      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      const json = await res.json().catch(() => []);
      return Array.isArray(json) ? json : [];
    } catch (e) {
      if (e && e.name === 'AbortError') return [];
      console.warn('Address lookup failed', e);
      return [];
    }
  };

  const fillAddressFromNominatim = (item) => {
    if (!item) return;
    const addr = item.address || {};
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
    state.formData.Street__c = street || (addr.road || '');
    state.formData.City__c = addr.city || addr.town || addr.village || addr.county || '';
    state.formData.State__c = addr.state || '';
    state.formData.Zip__c = addr.postcode || '';
    state.formData.Country__c = addr.country || '';
    updateState({});
  };

  const renderAddressSuggestions = (items, container) => {
    if (!container) return;
    container.innerHTML = '';
    if (!items || items.length === 0) return;
    items.forEach(it => {
      const label = it.display_name || [it.address?.road, it.address?.city, it.address?.state].filter(Boolean).join(', ');
      const node = document.createElement('div');
      node.className = 'ri-address-suggestion';
      node.textContent = label;
      node.onclick = () => { fillAddressFromNominatim(it); };
      container.appendChild(node);
    });
  };

  const computeAge = (dob) => {
    if (!dob) return null;
    const b = new Date(dob);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  };


  // ============================================================================
  // API FUNCTIONS
  // ============================================================================
  async function submitForm(formData) {
    updateState({ loading: true, error: null });
    
    try {
      const payload = {
        ...formData,
        __formConfig: FORM_CONFIG,
        __sendEmail: true,
        // Email templates are owned by the API and selected by FORM_CONFIG.id.
      };

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': crypto.randomUUID()
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit form');
      }

      updateState({
        loading: false,
        formCode: result.formCode,
        status: 'success'
      });
    } catch (error) {
      setError(error.message || 'An error occurred while submitting the form');
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  function nextStep() {
    const currentPhase = formStructure[state.phase];
    const currentStep = currentPhase.steps[state.step];
    
    // Validate required fields
    const missingFields = currentStep.fields
      .filter(f => f.required && !state.formData[f.key])
      .map(f => f.label);

    if (missingFields.length > 0) {
      setError(`Please complete the following required fields: ${missingFields.join(', ')}`);
      return;
    }

    clearError();

    // Check if this is the last step
    if (state.step === currentPhase.steps.length - 1) {
      // Submit the form
      submitForm(state.formData);
    } else {
      // Move to next step
      updateState({ step: state.step + 1 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function prevStep() {
    if (state.step > 0) {
      updateState({ step: state.step - 1 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goToStep(stepIndex) {
    updateState({ step: stepIndex });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================
  function closeSuccessView() {
    if (typeof activeModalClose === 'function') {
      const closeFn = activeModalClose;
      activeModalClose = null;
      closeFn();
      return;
    }

    resetState();
    render();
  }

  function renderSuccessView() {
    return `
      <div class="ri-success-modal" style="position: static; transform: none; box-shadow: none; max-width: 100%; width: 100%; margin: 0;">
        <div class="ri-success-icon">✓</div>
        <h2 class="ri-modal-title">Waiver and Release Form of Liability Submitted Successfully!</h2>
        <p class="ri-modal-subtitle">Your waiver and release form of liability has been submitted. Please save your confirmation code for your records.</p>
        <div class="ri-code-display">
          <code>${state.formCode || ''}</code>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin: 16px 0;">
          A confirmation email has been sent to ${state.formData.Email__c || 'your email address'}.
        </p>
        <div class="ri-modal-actions">
          <button class="ri-btn ri-btn-primary" type="button" onclick="window.closeWaiverSuccess()">Close</button>
        </div>
      </div>
    `;
  }

  function renderField(field) {
    const value = state.formData[field.key] || '';
    
    if (field.type === 'checkbox') {
      // If there's statement/help text, keep stacked statement style, otherwise render inline checkbox with label
      if (field.text) {
        return `
          <div class="ri-field">
            <div class="ri-checkbox ri-checkbox--statement">
              <input 
                type="checkbox" 
                id="${field.key}" 
                name="${field.key}"
                ${value ? 'checked' : ''}
                ${field.required ? 'required' : ''}
              />
              <label for="${field.key}">
                <span class="ri-statement-top">
                  <strong>${field.label}</strong>
                  ${field.required ? '<span class="ri-required">*</span>' : ''}
                </span>
                ${field.text ? `<span style="font-weight: 400; font-size: 13px; line-height: 1.5; margin-top: 4px; display: block;">${field.text}</span>` : ''}
              </label>
            </div>
          </div>
        `;
      }

      // Inline, brand-aligned checkbox for simple consent fields (e.g., ReceiveUpdates)
      return `
        <div class="ri-field">
          <div class="ri-checkbox">
            <input 
              type="checkbox" 
              id="${field.key}" 
              name="${field.key}"
              ${value ? 'checked' : ''}
              ${field.required ? 'required' : ''}
            />
            <label for="${field.key}">${field.label}${field.required ? ' <span class="ri-required">*</span>' : ''}</label>
          </div>
        </div>
      `;
    }

    if (field.type === 'select') {
      const opts = field.options || [];
      return `
        <div class="ri-field">
          <label for="${field.key}">
            ${field.label}
            ${field.required ? '<span class="ri-required">*</span>' : ''}
          </label>
          <select id="${field.key}" name="${field.key}" ${field.required ? 'required' : ''}>
            <option value="">Select...</option>
            ${opts.map(opt => {
              if (typeof opt === 'object' && opt !== null) {
                const v = String(opt.value);
                return `\n              <option value="${v}" ${String(value) === v ? 'selected' : ''}>${opt.label}</option>`;
              }
              const v = String(opt);
              return `\n              <option value="${v}" ${String(value) === v ? 'selected' : ''}>${v}</option>`;
            }).join('')}
          </select>
        </div>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <div class="ri-field">
          <label for="${field.key}">
            ${field.label}
            ${field.required ? '<span class="ri-required">*</span>' : ''}
          </label>
          <textarea 
            id="${field.key}" 
            name="${field.key}"
            placeholder="${field.placeholder || ''}"
            ${field.required ? 'required' : ''}
          >${value}</textarea>
        </div>
      `;
    }

    // Special handling: show computed age next to ChildBirthdate__c
    if (field.type === 'date' && field.key === 'ChildBirthdate__c') {
      const ageDisplay = typeof state.formData.ChildAge__c !== 'undefined' && state.formData.ChildAge__c !== null ? `\n        <div style="margin-top:6px;font-size:13px;color:#6b7280" data-age-display="${field.key}">Child age: ${state.formData.ChildAge__c}</div>` : '';
      return `
        <div class="ri-field">
          <label for="${field.key}">
            ${field.label}
            ${field.required ? '<span class="ri-required">*</span>' : ''}
          </label>
          <input 
            type="${field.type}" 
            id="${field.key}" 
            name="${field.key}"
            value="${value}"
            placeholder="${field.placeholder || ''}"
            ${field.required ? 'required' : ''}
          />
          ${ageDisplay}
        </div>
      `;
    }

    return `
      <div class="ri-field">
        <label for="${field.key}">
          ${field.label}
          ${field.required ? '<span class="ri-required">*</span>' : ''}
        </label>
        <input 
          type="${field.type}" 
          id="${field.key}" 
          name="${field.key}"
          value="${value}"
          placeholder="${field.placeholder || ''}"
          ${field.required ? 'required' : ''}
        />
      </div>
    `;
  }

  function renderStep() {
    const currentPhase = formStructure[state.phase];
    const currentStep = currentPhase.steps[state.step];
    const totalSteps = currentPhase.steps.length;
    const progressPercent = ((state.step + 1) / totalSteps) * 100;

    const headerHtml = FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? '' : `
      <div class="ri-step-header">
        <h2 class="ri-step-title">${currentStep.title}</h2>
        ${currentStep.description ? `<p class="ri-step-description">${currentStep.description}</p>` : ''}
      </div>
    `;

    const progressHtml = FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? '' : `
      <div class="ri-progress-wrapper">
        <div class="ri-progress-fill" style="width: ${progressPercent}%"></div>
        <span class="ri-progress-text">${state.step + 1} of ${totalSteps}</span>
      </div>
    `;

    return `
      ${headerHtml}

      ${progressHtml}

      <div class="ri-stepper ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? 'waiver-stepper' : ''}">
        ${currentPhase.steps.map((step, index) => `
          <div 
            class="ri-chip ${index === state.step ? 'active' : ''} ${index < state.step ? 'completed' : ''} ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? 'waiver-chip' : ''}"
            onclick="window.goToStep(${index})"
          >
            ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? '' : (index < state.step ? '<span class="ri-checkmark">✓</span>' : `<span class="ri-step-number">${index + 1}</span>`) }
            <span class="ri-step-label">${step.title}</span>
          </div>
        `).join('')}
      </div>

      <form class="${state.step === 0 ? 'ri-form ri-form--first-step' : 'ri-form'}" onsubmit="return false;">
        ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' && currentStep.title === 'Volunteer Information' ? `
          <div class="ri-grid">
            <div class="waiver-row waiver-row--two">
              ${renderField(currentStep.fields.find(f => f.key === 'ParentFirstName__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'ParentLastName__c'))}
            </div>

            <div class="waiver-row waiver-row--two">
              ${renderField(currentStep.fields.find(f => f.key === 'FirstName__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'LastName__c'))}
            </div>

            <div class="waiver-row waiver-row--full">
              ${renderField(currentStep.fields.find(f => f.key === 'Church__c'))}
            </div>

            <div class="waiver-row waiver-row--address">
              ${renderField(currentStep.fields.find(f => f.key === 'Street__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'City__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'State__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Zip__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Country__c'))}
            </div>

            <div class="waiver-row waiver-row--two">
              ${renderField(currentStep.fields.find(f => f.key === 'Email__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Phone__c'))}
            </div>
          </div>
        ` : FORM_CONFIG && FORM_CONFIG.id === 'waiver' && currentStep.title === 'Legal Acknowledgments' ? `
          <div class="ri-grid">
            ${currentStep.fields.map(field => `
              <div class="waiver-row waiver-row--consent">
                ${renderField(field)}
              </div>
            `).join('')}
          </div>
        ` : FORM_CONFIG && FORM_CONFIG.id === 'waiver' && currentStep.title === 'Signatures & Consents' ? `
          <div class="ri-grid">
            <div class="waiver-row waiver-row--signature">
              ${renderField(currentStep.fields.find(f => f.key === 'ParentSignature__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'ParentSignatureDate__c'))}
            </div>

            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'SignatureAcknowledgment__c'))}
            </div>

            <div class="waiver-row waiver-row--signature">
              ${renderField(currentStep.fields.find(f => f.key === 'TransportationConsentSignature__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'TransportationConsentDate__c'))}
            </div>

            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'TransportationConsent__c'))}
            </div>

            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'PhotoRelease__c'))}
            </div>

            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'EmailUpdatesConsent__c'))}
            </div>
          </div>
        ` : `
          <div class="ri-grid">
            ${currentStep.fields.map(field => renderField(field)).join('')}
          </div>
        `}

        ${state.error ? `
          <div class="ri-alert error">
            ${state.error}
          </div>
        ` : ''}

        <div class="ri-actions">
          <button 
            type="button" 
            class="ri-btn ri-btn-ghost" 
            onclick="window.prevStep()"
            ${state.step === 0 ? 'style="visibility: hidden;"' : ''}
          >
            ← Previous
          </button>
          <button 
            type="button" 
            class="ri-btn ri-btn-primary" 
            onclick="window.nextStep()"
            ${state.loading ? 'disabled' : ''}
          >
            ${state.loading ? '<div class="ri-loader"></div>' : ''}
            ${state.step === totalSteps - 1 ? 'Submit Waiver' : 'Next →'}
          </button>
        </div>
      </form>
    `;
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  // Flag to prevent duplicate listener attachment
  let formListenersAttached = false;

  function attachFormListeners(containerOverride) {
    const container = containerOverride || getContainer();
    if (!container) return;
    if (container._formListenersAttached) return;
    container._formListenersAttached = true;

    // Use event delegation on the stable container so listeners survive re-renders
    const handleFieldUpdate = (target) => {
      if (!target || !target.name) return;
      const tag = (target.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;

      if (target.type === 'checkbox') {
        state.formData[target.name] = !!target.checked;
      } else {
        state.formData[target.name] = target.value;
      }
    };

    container.addEventListener('input', (e) => {
      handleFieldUpdate(e.target);
    });

    container.addEventListener('change', (e) => {
      handleFieldUpdate(e.target);
    });
  }

  function attachAddressLookupListener(containerOverride) {
    const container = containerOverride || getContainer();
    if (!container || config.disableAddressLookup) return;
    const streetInput = container.querySelector('#Street__c');
    if (!streetInput || streetInput._waiverHandlerAttached) return;
    streetInput._waiverHandlerAttached = true;

    let suggestionsEl = streetInput.parentNode.querySelector('.ri-address-suggestions');
    if (!suggestionsEl) {
      suggestionsEl = document.createElement('div');
      suggestionsEl.className = 'ri-address-suggestions';
      streetInput.parentNode.appendChild(suggestionsEl);
    }
    const onInput = debounce(async (ev) => {
      const q = ev.target.value;
      if (!q || q.length < 3) { suggestionsEl.innerHTML = ''; return; }
      const items = await searchAddress(q);
      renderAddressSuggestions(items, suggestionsEl);
    }, 350);
    streetInput.addEventListener('input', onInput);
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    if (state.status === 'success') {
      container.innerHTML = `
        <div class="ri-app">
          <div class="ri-card">
            ${renderSuccessView()}
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="ri-app">
        <div class="ri-card">
          <div class="ri-header">
            <div class="ri-brand-title">${orgTerms.orgName}</div>
          </div>
          
          <div class="ri-title">${FORM_CONFIG.name}</div>
          ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? '' : `<div class="ri-subtitle">Complete all sections to submit your parental waiver</div>`}

          ${renderStep()}
        </div>
      </div>
    `;

    // Attach listeners for whichever container we're rendering into
    attachFormListeners(container);
    attachAddressLookupListener(container);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.goToStep = goToStep;

  // initialize state (also populates sig dates)
  resetState();

  // Initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  if (typeof document !== 'undefined' && !document.__globalPageHideListenersAttached) {
    document.__globalPageHideListenersAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') telemetry.flush();
    });
  }
  if (typeof window !== 'undefined' && !window.__globalPageHideListenersAttached) {
    window.__globalPageHideListenersAttached = true;
    window.addEventListener('pagehide', () => { telemetry.flush(); });
  }

  // Load lookup data to populate selects (countries, states, relationship, etc.)
  loadLookup().then(applyLookupOptions).catch(() => {});

  // ---------------------------------------------------------------------------
  // Modal helpers (generic)
  // ---------------------------------------------------------------------------
  /**
   * Opens a modal overlay with a container element and optional initialization
   * callback. The container is assigned the given `containerId` (defaults to
   * `HOST_ID`). Returns an object with a `close()` method.
   *
   * @param {object} opts
   * @param {string} [opts.containerId] id to use for the inner container
   * @param {(container:HTMLElement)=>void} [opts.onOpen] called after modal is
   *        appended; receives the container element.
   */
  function openModal({ containerId = HOST_ID, onOpen } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'ri-modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    });

    const modal = document.createElement('div');
    modal.className = 'ri-modal';
    Object.assign(modal.style, {
      position: 'relative',
      zIndex: '2147483647'
    });

    // modal content shell (persistent chrome)
    const shell = document.createElement('div');
    shell.className = 'ri-modal-content';
    Object.assign(shell.style, {
      display: 'inline-block',
      maxHeight: '90vh',
      maxWidth: '96vw',
      overflow: 'auto'
    });

    // close button in top corner
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ri-modal-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = close;
    shell.appendChild(closeBtn);

    // render target inside shell (this is what app render replaces)
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'ri-modal-host';
    shell.appendChild(container);

    modal.appendChild(shell);
    overlay.appendChild(modal);

    // clicking outside the modal content should dismiss
    overlay.addEventListener('click', (e) => {
      const path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
      const clickedInsideShell = path.length ? path.includes(shell) : shell.contains(e.target);
      if (!clickedInsideShell) close();
    });

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (hostOverride === container) hostOverride = null;
      if (activeModalClose === close) activeModalClose = null;
      // restore scrolling
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('ri-modal-open');
        document.body.classList.remove('ri-modal-open');
      }
    }

    document.body.appendChild(overlay);
    // prevent background from scrolling by adding a class to html/body
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('ri-modal-open');
      document.body.classList.add('ri-modal-open');
    }
    activeModalClose = close;
    if (typeof onOpen === 'function') onOpen(container);

    return { overlay, close };
  }


  // expose globally for callers
  if (typeof window !== 'undefined') {
    window.openModal = openModal;
    window.closeWaiverSuccess = closeSuccessView;
    // also export helpers so host pages can drive the waiver rendering
    window.__ri_waiver = {
      render,
      resetState,
      get hostOverride() { return hostOverride; },
      set hostOverride(v) { hostOverride = v; }
    };
  }

})();
