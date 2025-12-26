(() => {
  // Configuration: Set window.FORMS_CONFIG before loading this script to override defaults
  // For production, add this single block before the script tag:
  // <script>
  //   window.FORMS_CONFIG = { apiEndpoint: 'https://your-app.azurewebsites.net/api/form' };
  // </script>
  const config = window.FORMS_CONFIG || {};
  const ENDPOINT = config.apiEndpoint || "http://localhost:7071/api/form"; //"https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form";
  const HOST_ID = "waiver-app";

  // Organization terminology
  let orgTerms = {
    orgName: "Refuge International",
    labels: {
      Zip: "Postal Code",
      State: "State/Province",
      Country: "Country/Region",
    },
    phaseNames: {
      initial: "Waiver Submission",
    }
  };

  // ============================================================================
  // FORM CONFIGURATION (Parental Waiver)
  // ============================================================================
  const FORM_CONFIG = {
    id: 'waiver',
    name: 'Parental Waiver & Consent Form',
    salesforce: {
      objectName: 'Form__c',
      recordTypeName: 'Parental Waiver',
      allowedFields: [
        // Parent/Guardian Information
        'ParentFirstName__c', 'ParentLastName__c', 'Email__c', 'Phone__c',
        'Street__c', 'City__c', 'State__c', 'Zip__c', 'Country__c',
        
        // Child Information
        'FirstName__c', 'LastName__c', 'Birthdate__c', 'Gender__c',
        
        // Medical Information
        'Allergies__c', 'Medications__c', 'MedicalConditions__c',
        
        // Waivers & Consents
        'LiabilityWaiver__c', 'PhotoRelease__c', 'MedicalTreatmentConsent__c',
        'CodeOfConduct__c',
        
        // Signature
        'ParentSignature__c', 'SignatureDate__c',
        
      ],
      queryFields: [
        'Id', 'FormCode__c', 'ParentFirstName__c', 'ParentLastName__c', 'Email__c',
        'FirstName__c', 'LastName__c', 'CreatedDate'
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

  try { if (typeof window !== 'undefined') { window.__riTest = window.__riTest || {}; } } catch (e) {}

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  let state = {
    phase: 'initial',
    step: 0,
    formData: {},
    formCode: null,
    status: null,
    error: null,
    loading: false,
  };

  // ============================================================================
  // FORM STRUCTURE
  // ============================================================================
  const formStructure = {
    initial: {
      title: orgTerms.phaseNames.initial,
      steps: [
        {
          title: 'Parent/Guardian Information',
          description: 'Please provide your contact information',
          fields: [
            { key: 'ParentFirstName__c', label: 'First Name', type: 'text', required: true },
            { key: 'ParentLastName__c', label: 'Last Name', type: 'text', required: true },
            { key: 'Email__c', label: 'Email Address', type: 'email', required: true },
            { key: 'Phone__c', label: 'Phone Number', type: 'tel', required: true },
            { key: 'Street__c', label: 'Street Address', type: 'text', required: true },
            { key: 'City__c', label: 'City', type: 'text', required: true },
            { key: 'State__c', label: orgTerms.labels.State, type: 'text', required: true },
            { key: 'Zip__c', label: orgTerms.labels.Zip, type: 'text', required: true },
            { key: 'Country__c', label: orgTerms.labels.Country, type: 'text', required: true },
          ]
        },
        {
          title: 'Child Information',
          description: 'Please provide information about your child and any relevant medical details',
          fields: [
            { key: 'FirstName__c', label: 'Child\'s First Name', type: 'text', required: true },
            { key: 'LastName__c', label: 'Child\'s Last Name', type: 'text', required: true },
            { key: 'Birthdate__c', label: 'Date of Birth', type: 'date', required: true },
            { key: 'Gender__c', label: 'Gender', type: 'select', required: false, options: ['Male', 'Female'] },
            { key: 'Allergies__c', label: 'Allergies', type: 'textarea', required: false, placeholder: 'List any allergies (food, medication, environmental, etc.)' },
            { key: 'Medications__c', label: 'Current Medications', type: 'textarea', required: false, placeholder: 'List any medications your child is currently taking' },
            { key: 'MedicalConditions__c', label: 'Medical Conditions', type: 'textarea', required: false, placeholder: 'List any medical conditions, disabilities, or special needs' },
          ]
        },

        {
          title: 'Consent & Signature',
          description: 'Please review the waivers, provide consent, and sign to submit',
          fields: [
            { 
              key: 'LiabilityWaiver__c', 
              label: 'Liability Waiver', 
              type: 'checkbox', 
              required: true,
              text: 'I hereby release and hold harmless Refuge International and its staff from any and all liability for injuries or damages that may occur during participation in activities.'
            },
            { 
              key: 'PhotoRelease__c', 
              label: 'Photo & Video Release', 
              type: 'checkbox', 
              required: true,
              text: 'I grant permission for my child\'s image to be used in photographs, videos, and other media for promotional and educational purposes.'
            },
            { 
              key: 'MedicalTreatmentConsent__c', 
              label: 'Medical Treatment Authorization', 
              type: 'checkbox', 
              required: true,
              text: 'I authorize Refuge International staff to seek emergency medical treatment for my child if I cannot be reached immediately.'
            },
            { 
              key: 'CodeOfConduct__c', 
              label: 'Code of Conduct Agreement', 
              type: 'checkbox', 
              required: true,
              text: 'I agree that my child will follow all rules and code of conduct guidelines established by Refuge International.'
            },
            { key: 'ParentSignature__c', label: 'Parent/Guardian Full Name (Electronic Signature)', type: 'text', required: true, placeholder: 'Type your full name' },
            { key: 'SignatureDate__c', label: 'Date', type: 'date', required: true },
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
        __formConfig: FORM_CONFIG
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

      showSuccessModal(result.formCode);
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
  function showSuccessModal(formCode) {
    const modal = document.createElement('div');
    modal.className = 'ri-modal';
    modal.innerHTML = `
      <div class="ri-modal-overlay"></div>
      <div class="ri-modal-content">
        <div class="ri-success-icon">✓</div>
        <h2 class="ri-modal-title">Waiver Submitted Successfully!</h2>
        <p class="ri-modal-subtitle">Your parental waiver has been submitted. Please save your confirmation code for your records.</p>
        <div class="ri-code-display">
          <code>${formCode}</code>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin: 16px 0;">
          A confirmation email has been sent to ${state.formData.Email__c || 'your email address'}.
        </p>
        <div class="ri-modal-actions">
          <button class="ri-btn ri-btn-primary" onclick="location.reload()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function renderField(field) {
    const value = state.formData[field.key] || '';
    
    if (field.type === 'checkbox') {
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
      const ageDisplay = typeof state.formData.ChildAge__c !== 'undefined' && state.formData.ChildAge__c !== null ? `\n        <div style="margin-top:6px;font-size:13px;color:#6b7280">Child age: ${state.formData.ChildAge__c}</div>` : '';
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
        ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' && currentStep.title === 'Parent/Guardian Information' ? `
          <div class="ri-grid">
            <div class="waiver-row waiver-row--two">
              ${renderField(currentStep.fields.find(f => f.key === 'ParentFirstName__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'ParentLastName__c'))}
            </div>

            <div class="waiver-row waiver-row--two">
              ${renderField(currentStep.fields.find(f => f.key === 'Email__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Phone__c'))}
            </div>

            <div class="waiver-row waiver-row--address">
              ${renderField(currentStep.fields.find(f => f.key === 'Street__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'City__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'State__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Zip__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Country__c'))}
            </div>
          </div>
        ` : FORM_CONFIG && FORM_CONFIG.id === 'waiver' && currentStep.title === 'Child Information' ? `
          <div class="ri-grid">
            <div class="waiver-row waiver-row--child-top">
              ${renderField(currentStep.fields.find(f => f.key === 'FirstName__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'LastName__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Birthdate__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Gender__c'))}
            </div>

            <div class="waiver-row waiver-row--child-bottom">
              ${renderField(currentStep.fields.find(f => f.key === 'Allergies__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'Medications__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'MedicalConditions__c'))}
            </div>
          </div>
        ` : FORM_CONFIG && FORM_CONFIG.id === 'waiver' && currentStep.title === 'Consent & Signature' ? `
          <div class="ri-grid">
            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'LiabilityWaiver__c'))}
            </div>
            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'PhotoRelease__c'))}
            </div>
            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'MedicalTreatmentConsent__c'))}
            </div>
            <div class="waiver-row waiver-row--consent">
              ${renderField(currentStep.fields.find(f => f.key === 'CodeOfConduct__c'))}
            </div>

            <div class="waiver-row waiver-row--signature">
              ${renderField(currentStep.fields.find(f => f.key === 'ParentSignature__c'))}
              ${renderField(currentStep.fields.find(f => f.key === 'SignatureDate__c'))}
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
  function render() {
    const container = document.getElementById(HOST_ID);
    if (!container) return;

    container.innerHTML = `
      <div class="ri-app">
        <div class="ri-card">
          <div class="ri-header">
            <div class="ri-brand-title">${orgTerms.orgName}</div>
          </div>
          
          <div class="ri-title">${FORM_CONFIG.name}</div>
          ${FORM_CONFIG && FORM_CONFIG.id === 'waiver' ? '' : `<div class="ri-subtitle">Complete all sections to submit your parental waiver</div>`}

          ${state.status === 'success' ? '' : renderStep()}
        </div>
      </div>
    `;

    // Attach event listeners for form inputs
    const form = container.querySelector('.ri-form');
    if (form) {
      form.addEventListener('input', (e) => {
        if (e.target.type === 'checkbox') {
          state.formData[e.target.name] = e.target.checked;
        } else {
          state.formData[e.target.name] = e.target.value;
        }
        // Compute age when birthdate changes
        if (e.target.name === 'ChildBirthdate__c') {
          const age = computeAge(e.target.value);
          state.formData.ChildAge__c = age;
          updateState({});
        }

        // Auto-copy parent fields -> emergency contact fields (parent is emergency contact)
        if (e.target.name === 'ParentFirstName__c') state.formData.EmergencyContactFirstName__c = e.target.value;
        if (e.target.name === 'ParentLastName__c') state.formData.EmergencyContactLastName__c = e.target.value;
        if (e.target.name === 'Phone__c' || e.target.name === 'ParentPhone__c') state.formData.EmergencyContactPhone__c = e.target.value;
        if (e.target.name === 'Email__c' || e.target.name === 'ParentEmail__c') state.formData.EmergencyContactEmail__c = e.target.value;
        // Relationship is parent by default
        state.formData.EmergencyContactRelationship__c = 'Parent';
      });

      form.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
          state.formData[e.target.name] = e.target.checked;
        } else {
          state.formData[e.target.name] = e.target.value;
        }
        if (e.target.name === 'ChildBirthdate__c') {
          const age = computeAge(e.target.value);
          state.formData.ChildAge__c = age;
          updateState({});
        }

        // Auto-copy parent fields -> emergency contact fields (parent is emergency contact)
        if (e.target.name === 'ParentFirstName__c') state.formData.EmergencyContactFirstName__c = e.target.value;
        if (e.target.name === 'ParentLastName__c') state.formData.EmergencyContactLastName__c = e.target.value;
        if (e.target.name === 'Phone__c' || e.target.name === 'ParentPhone__c') state.formData.EmergencyContactPhone__c = e.target.value;
        if (e.target.name === 'Email__c' || e.target.name === 'ParentEmail__c') state.formData.EmergencyContactEmail__c = e.target.value;
        // Relationship is parent by default
        state.formData.EmergencyContactRelationship__c = 'Parent';
      });

      // Address suggestions for Street__c
      const streetInput = container.querySelector('#Street__c');
      if (streetInput) {
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

      // Ensure select fields show updated state when options populate
      const selects = container.querySelectorAll('select');
      selects.forEach(s => s.addEventListener('change', (e) => { state.formData[e.target.name] = e.target.value; }));
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.goToStep = goToStep;

  // Auto-fill today's date for signature date
  const today = new Date().toISOString().split('T')[0];
  state.formData.SignatureDate__c = today;

  // Initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  // Load lookup data to populate selects (countries, states, relationship, etc.)
  loadLookup().then(applyLookupOptions).catch(() => {});

})();
