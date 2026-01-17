// ============================================================================
// EVENT REGISTRATION FORM
// ============================================================================
// Event registration form with optional campaign association.
// 
// Usage Options:
// 1. URL parameter: event.html?eventId=campaign-id-123
// 2. Script attribute: <script src="event.js" data-eventid="campaign-id-123"></script>
// 3. No event ID: event.html (standalone registration)
// ============================================================================

(() => {
  // Configuration: Set window.FORMS_CONFIG before loading this script to override defaults
  // For production, add this single block before the script tag:
  // <script>
  //   window.FORMS_CONFIG = { apiEndpoint: 'https://your-app.azurewebsites.net/api/form' };
  // </script>
  const config = window.FORMS_CONFIG || {};
  const ENDPOINT = config.apiEndpoint || "https://rif-hhh8e6e7cbc2hvdw.eastus-01.azurewebsites.net/api/form"; //"http://localhost:7071/api/form";
  const PAYMENT_ENDPOINT = config.paymentEndpoint || 'https://payment-processing-function.azurewebsites.net/api/transaction';
  const HOST_ID = "event-app";

  const orgTerms = {
    orgName: "Refuge International",
    labels: {
      Zip: "Postal Code",
      State: "State/Province",
      Country: "Country/Region",
    },
    phaseNames: {
      initial: "Events Calendar",
    }
  };

  // Extract eventId from multiple sources (priority order):
  // 1. Script tag eventid attribute
  // 2. Script tag data-eventid attribute
  // 3. URL parameter eventId
  let eventId = null;
  
  // Try to get from script tag attribute
  try {
    const scriptEl = document.currentScript;
    if (scriptEl) {
      eventId = scriptEl.getAttribute('eventid') || scriptEl.getAttribute('data-eventid');
    }
  } catch (e) {
    // Ignore errors in case currentScript is not available
  }
  
  // Fallback to URL parameter if not found in script tag
  if (!eventId) {
    const urlParams = new URLSearchParams(window.location.search);
    eventId = urlParams.get('eventId');
  }

  // Remember whether we started with an eventId provided; used to decide whether to show "Back" UI
  const initialEventId = eventId;

  // ============================================================================
  // FORM CONFIGURATION
  // ============================================================================

  const EMAIL_TEMPLATES = {
    eventRegistration: {
      subject: 'Registration Confirmed: {{Name}}',
      text: 'Hello {{FirstName__c}},\n\nThank you — your registration for {{Name}} has been confirmed. Your confirmation code is: {{FormCode__c}}\n\nEvent details:\n{{eventDetails}}\nAdd to calendar:\n- Google: {{googleUrl}}\n- Outlook: {{outlookUrl}}\n- Apple: {{appleIcsUrl}}\n- ICS: {{icsUrl}}\n\nThank you,\nRefuge International',
      html: '<p>Hello {{FirstName__c}},</p><p>Thank you — your registration for <strong>{{Name}}</strong> has been confirmed. Your confirmation code is: <strong>{{FormCode__c}}</strong></p><div>{{eventDetailsHtml}}</div><p>Add to calendar: <a href="{{googleUrl}}" target="_blank">Google</a> | <a href="{{outlookUrl}}" target="_blank">Outlook</a> | <a href="{{appleIcsUrl}}">Apple</a> | <a href="{{icsUrl}}">ICS</a></p><p>Thank you,<br/>Refuge International</p>'
    },
    applicationCode: {
      subject: 'Your Registration Code',
      text: 'Hello,\n\nWe received a request to retrieve your registration code. Your registration code is: {{FormCode__c}}\n\nYou can use this code to view or update your registration at our website. If you did not request this email, please ignore it.\n\nThank you',
      html: '<p>Hello,</p><p>We received a request to retrieve your registration code. <strong>Your registration code is: <code>{{FormCode__c}}</code></strong></p><p>You can use this code to view or update your registration at our website. If you did not request this email, please ignore it.</p><p>Thank you</p>'
    }
  };

  const FORM_CONFIG = {
    id: 'event',
    name: 'Events Calendar',
    salesforce: {
      objectName: 'Form__c',
      recordTypeName: 'Event Registration',
      allowedFields: [
        'FirstName__c', 'LastName__c', 'Email__c', 'Phone__c', 
        'Street__c', 'City__c', 'State__c', 'Zip__c', 'Country__c',
        'Campaign__c',
        'DietaryRestrictions__c', 'AccessibilityNeeds__c', 
        'AccommodationNeeded__c', 'EmergencyContactName__c', 
        'EmergencyContactPhone__c', 'TShirtSize__c',
        'HowHeard__c', 'AdditionalNotes__c'
      ],
      queryFields: [
        'Id', 'FormCode__c', 'FirstName__c', 'LastName__c', 'Email__c',
        'Phone__c', 'Campaign__c',
        'CreatedDate'
      ],
      updateFields: [
        'DietaryRestrictions__c', 'AccessibilityNeeds__c',
        'AccommodationNeeded__c', 'TShirtSize__c', 'AdditionalNotes__c'
      ],
      searchField: 'FormCode__c',
      lookupEmailField: 'Email__c',
      campaignField: 'Campaign__c',  // Field to associate with campaign
      // Event metadata fields to query when eventId is provided
      eventQueryFields: ['Id','Name','StartDate','EndDate','Description', 'Location__c','StartTime__c','EndTime__c','RequiresPayment__c','PaymentAmount__c']
    }
  };

  // ============================================================================
  // FORM PHASES
  // ============================================================================
  const phases = {
    initial: {
      name: "Events Calendar",
      description: "Your contact details",
      estimatedTime: 2,
      steps: [
        {
          title: "Contact Information",
          description: "",
          fields: ["FirstName", "LastName", "Email", "Phone", "Street", "City", "State", "Zip", "Country"]
        }
      ]
    }
  };

  // ============================================================================
  // FIELD METADATA
  // ============================================================================
  const fieldMeta = {
    FirstName: { label: "First Name", type: "text", required: true },
    LastName: { label: "Last Name", type: "text", required: true },
    Email: { label: "Email", type: "email", required: true },
    Phone: { label: "Phone", type: "tel", required: true },
    Street: { label: "Street Address", type: "text", required: true },
    City: { label: "City", type: "text", required: true },
    State: { label: "State/Province", type: "select", options: [], required: true },
    Zip: { label: "Postal Code", type: "text", required: true },
    Country: { label: "Country/Region", type: "select", options: [], required: true },
    EventName: { label: "Event Name", type: "text", required: true, placeholder: "Which event are you attending?" },
    EventDate: { label: "Event Date", type: "date", required: false },
    DietaryRestrictions: { 
      label: "Dietary Restrictions", 
      type: "textarea", 
      required: false,
      placeholder: "Any dietary restrictions or allergies?" 
    },
    AccessibilityNeeds: { 
      label: "Accessibility Needs", 
      type: "textarea", 
      required: false,
      placeholder: "Do you have any accessibility requirements?" 
    },
    AccommodationNeeded: { 
      label: "Need Accommodation?", 
      type: "select", 
      options: ["No", "Yes - Hotel", "Yes - Homestay"], 
      required: false 
    },
    EmergencyContactName: { label: "Emergency Contact Name", type: "text", required: true },
    EmergencyContactPhone: { label: "Emergency Contact Phone", type: "tel", required: true },
    TShirtSize: { 
      label: "T-Shirt Size", 
      type: "select", 
      options: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], 
      required: false 
    },
    HowHeard: { 
      label: "How did you hear about this event?", 
      type: "select", 
      options: ["Website", "Social Media", "Email", "Friend", "Church", "Other"], 
      required: false 
    },
    AdditionalNotes: { 
      label: "Additional Notes", 
      type: "textarea", 
      required: false,
      placeholder: "Any additional information?" 
    },
  };

  // ============================================================================
  // FIELD MAPPING
  // ============================================================================
  const fieldToSf = {
    FirstName: 'FirstName__c',
    LastName: 'LastName__c',
    Email: 'Email__c',
    Phone: 'Phone__c',
    Street: 'Street__c',
    City: 'City__c',
    State: 'State__c',
    Zip: 'Zip__c',
    Country: 'Country__c',
    DietaryRestrictions: 'DietaryRestrictions__c',
    AccessibilityNeeds: 'AccessibilityNeeds__c',
    AccommodationNeeded: 'AccommodationNeeded__c',
    EmergencyContactName: 'EmergencyContactName__c',
    EmergencyContactPhone: 'EmergencyContactPhone__c',
    TShirtSize: 'TShirtSize__c',
    HowHeard: 'HowHeard__c',
    AdditionalNotes: 'AdditionalNotes__c',
  };

  const sfToField = Object.entries(fieldToSf).reduce((acc, [k, v]) => {
    acc[v] = k;
    return acc;
  }, {});

  // ============================================================================
  // CSS INJECTION
  // ============================================================================
  const injectCSS = () => {
    try {
      const scriptEl = document.currentScript;
      if (!scriptEl) return;
      const cssHref = new URL("./event.css", scriptEl.src).toString();
      const exists = Array.from(document.styleSheets).some(ss => ss.href && ss.href.includes("event.css"));
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
    initialLoading: true,
    eventId: eventId,  // Store eventId from URL
    campaignInfo: null, // Store campaign info if successfully fetched
    selectedEvent: null, // Store event chosen from list when no eventId in URL
    availableEvents: null, // When no eventId, list of active events
    requiresPayment: false, // Store if the campaign requires payment
    paymentAmount: 0, // Store the payment amount
    paymentCompleted: false, // Track if payment has been completed
    paymentError: null // Store any payment-related errors
  }; 

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    // Temporarily hold value so we can set it AFTER children (important for <select>)
    const valueToSet = Object.prototype.hasOwnProperty.call(attrs, 'value') ? attrs.value : undefined;

    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') {
        el.className = v;
      } else if (k === 'disabled') {
        if (v) el.setAttribute('disabled', '');
      } else if (k.startsWith('on')) {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'value') {
        // skip here; set after children appended to ensure proper selection for <select>
      } else {
        // fallback to setting attribute for other keys
        el.setAttribute(k, v);
      }
    });

    kids.flat().forEach(kid => {
      if (typeof kid === 'string') el.appendChild(document.createTextNode(kid));
      else if (kid) el.appendChild(kid);
    });

    // Now set value property for inputs/selects/textareas so their state persists after re-render
    if (typeof valueToSet !== 'undefined' && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
      try { el.value = valueToSet; } catch (e) { /* ignore if not supported */ }
    }

    return el;
  };

  const setState = (updates) => {
    state = { ...state, ...updates };
    render();
  };

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================
  
  const submitForm = async () => {
    // Collect current form values from DOM
    const currentValues = collectFormValues();
    state.formData = { ...state.formData, ...currentValues };
    
    const currentPhase = phases[state.phase];
    const allFields = currentPhase.steps.flatMap(s => s.fields);
    
    // Validate required fields
    const missing = allFields.filter(fKey => {
      const meta = fieldMeta[fKey];
      return meta.required && !state.formData[fKey];
    });

    if (missing.length > 0) {
      const labels = missing.map(k => fieldMeta[k].label).join(', ');
      setState({ error: `Please fill in required fields: ${labels}` });
      return;
    }

    // Validate eventId is present
    const selected = state.selectedEvent || state.campaignInfo || null;
    const selectedId = selected && (selected.id || selected.Id || null);
    if (!state.eventId && !selectedId) {
      setState({ error: 'An event must be selected to submit this form.' });
      return;
    }

    setState({ loading: true, error: null });

    try {
      // Build Salesforce payload
      const payload = {};
      Object.entries(state.formData).forEach(([clientKey, value]) => {
        const sfKey = fieldToSf[clientKey];
        if (sfKey) payload[sfKey] = value;
      });

      // Add form configuration
      payload['__formConfig'] = FORM_CONFIG;

      // Include email templates for event registration confirmation
      payload['__sendEmail'] = true;
      payload['__emailTemplates'] = {
        eventRegistration: EMAIL_TEMPLATES.eventRegistration
      };

      // Attach client time zone so server can generate calendar links appropriately
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) payload['__clientTimeZone'] = tz;
      } catch (e) { /* ignore */ }

      // Resolve selected event/campaign info
      const selected = state.selectedEvent || state.campaignInfo || null;
      const selectedId = selected && (selected.id || selected.Id || null);

      // Add eventId if provided (backend will handle campaign lookup)
      if (state.eventId) {
        payload['__eventId'] = state.eventId;
      } else if (selectedId) {
        // If user chose an event from the list, pass its id through
        payload['__eventId'] = selectedId;
      }

      // Also attach campaign field directly when we have an id (mirrors having an eventId up front)
      if (selectedId && FORM_CONFIG.salesforce && FORM_CONFIG.salesforce.campaignField) {
        payload[FORM_CONFIG.salesforce.campaignField] = selectedId;
      }

      // Pass through selected event metadata for completeness (non-blocking on backend)
      if (selected) {
        payload['__selectedEvent'] = selected;
      }

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to submit form');
      }

      // Success - store form code and campaign info
      setState({ 
        formCode: result.formCode,
        campaignInfo: result.campaignInfo || state.campaignInfo,  // Backend returns campaign info if associated
        loading: false 
      });

      // If payment is required, initiate payment flow
      if (state.requiresPayment && state.paymentAmount > 0) {
        try {
          setState({ error: null });
          
          // Open tab immediately to avoid popup blockers
          const paymentWindow = window.open('', '_blank');
          
          if (!paymentWindow) {
            console.warn('New tab was blocked by browser');
            setState({ 
              status: 'success',
              paymentError: 'Browser blocked opening new tab. Please allow popups/tabs for this site and try again.'
            });
            return;
          }
          
          const session = await createPaymentSession();
          console.log('Payment session response:', session);
          
          // Extract URL from various possible response structures
          const checkoutUrl = session?.url || session?.sessionUrl || session?.checkout_url || 
                            (session?.id ? `https://checkout.stripe.com/c/pay/${session.id}` : null);
          
          console.log('Extracted checkout URL:', checkoutUrl);
          
          if (checkoutUrl) {
            paymentWindow.location.href = checkoutUrl;
            setState({ 
              status: 'success', 
              paymentCompleted: true,
              error: null
            });
          } else {
            paymentWindow.close();
            console.error('No checkout URL found in session response:', session);
            setState({ 
              status: 'success',
              paymentError: 'Payment session could not be created. Your registration is complete but payment was not processed.'
            });
          }
        } catch (err) {
          // Payment failed, but registration was successful
          console.error('Payment initiation failed:', err);
          setState({ 
            status: 'success',
            paymentError: 'Payment failed: ' + (err.message || err) + '. Your registration is complete. Please try payment again.'
          });
        }
      } else {
        // No payment required, show success
        setState({ status: 'success' });
      }

    } catch (error) {
      console.error('Submission error:', error);
      setState({ 
        error: error.message || 'Failed to submit. Please try again.', 
        loading: false 
      });
    }
  };

  // ============================================================================
  // PAYMENT HANDLING
  // ============================================================================
  
  const createPaymentSession = async () => {
    const fc = (state.formCode || '').toString().trim();
    
    console.log('Creating payment session with state:', {
      paymentAmount: state.paymentAmount,
      requiresPayment: state.requiresPayment,
      formCode: state.formCode,
      campaignInfo: state.campaignInfo
    });
    
    // Convert amount to cents (Stripe requires integer in cents)
    const amountInCents = Math.round(state.paymentAmount * 100);
    
    const payload = {
      transactionType: "Donation",
      email: state.formData.Email || '',
      firstname: state.formData.FirstName || '',
      lastname: state.formData.LastName || '',
      phone: state.formData.Phone || '',
      amount: amountInCents,
      frequency: "onetime",
      category: `Events Calendar${state.campaignInfo && state.campaignInfo.name ? ' (' + state.campaignInfo.name + ')' : ''}${fc ? ' - ' + fc : ''}`,
      formCode: fc,
      FormCode: fc,
      address: {
        line1: state.formData.Street || '',
        city: state.formData.City || '',
        state: state.formData.State || '',
        postal_code: state.formData.Zip || '',
        country: (state.formData.Country || '').toString().trim()
      }
    };

    // Remove empty-string values from payload recursively
    const cleanObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(cleanObject).filter(v => v !== undefined && v !== null);
      const out = {};
      Object.entries(obj).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        if (typeof v === 'string') {
          const t = v.trim();
          if (t === '') return;
          out[k] = t;
          return;
        }
        if (typeof v === 'object') {
          const cleaned = cleanObject(v);
          if (cleaned && (Array.isArray(cleaned) ? cleaned.length > 0 : Object.keys(cleaned).length > 0)) {
            out[k] = cleaned;
          }
          return;
        }
        out[k] = v;
      });
      return out;
    };

    const cleanedPayload = cleanObject(payload);

    console.log('Cleaned payment payload:', cleanedPayload);
    console.log('Amount type:', typeof cleanedPayload.amount, 'Value:', cleanedPayload.amount);

    if (!cleanedPayload.email) throw new Error('Email is required to create a payment session');
    if (!cleanedPayload.amount || typeof cleanedPayload.amount !== 'number' || cleanedPayload.amount <= 0) throw new Error('Invalid payment amount');
    if (cleanedPayload.amount < 50) throw new Error('Payment amount must be at least $0.50');

    try {
      console.debug('Payment payload:', cleanedPayload);
      const res = await fetch(PAYMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedPayload)
      });

      const text = await res.text().catch(() => null);
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }

      if (!res.ok) {
        console.error('Payment session failed', { status: res.status, statusText: res.statusText, response: json });
        throw new Error(json?.error || json?.message || (json && json.raw) || `Payment endpoint returned ${res.status}`);
      }

      return json;
    } catch (err) {
      console.error('Payment creation error:', err);
      throw err;
    }
  };

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  
  // Helper to check if current step can proceed
  const canProceed = () => {
    const currentValues = collectFormValues();
    const currentFormData = { ...state.formData, ...currentValues };
    
    const currentPhase = phases[state.phase];
    const currentStep = currentPhase.steps[state.step];
    
    // Check if all required fields in current step are filled
    const hasAllRequiredFields = currentStep.fields.every(fKey => {
      const meta = fieldMeta[fKey];
      if (!meta.required) return true;
      const value = currentFormData[fKey];
      return value && value.trim() !== '';
    });
    
    if (!hasAllRequiredFields) return false;
    
    // If this is the last step (submit step), also check for eventId
    if (state.step >= currentPhase.steps.length - 1) {
      const selected = state.selectedEvent || state.campaignInfo || null;
      const selectedId = selected && (selected.id || selected.Id || null);
      if (!state.eventId && !selectedId) return false;
    }
    
    return true;
  };
  
  const nextStep = () => {
    // Collect current form values from DOM
    const currentValues = collectFormValues();
    state.formData = { ...state.formData, ...currentValues };
    
    const currentPhase = phases[state.phase];
    const currentStep = currentPhase.steps[state.step];
    
    // Validate current step
    const missing = currentStep.fields.filter(fKey => {
      const meta = fieldMeta[fKey];
      return meta.required && !state.formData[fKey];
    });

    if (missing.length > 0) {
      const labels = missing.map(k => fieldMeta[k].label).join(', ');
      setState({ error: `Please fill in: ${labels}` });
      return;
    }

    if (state.step < currentPhase.steps.length - 1) {
      setState({ step: state.step + 1, error: null });
    } else {
      submitForm();
    }
  };

  const prevStep = () => {
    if (state.step > 0) {
      setState({ step: state.step - 1, error: null });
    }
  };

  const updateField = (fieldKey, value) => {
    // Update state without triggering re-render to preserve focus and tab navigation
    state.formData[fieldKey] = value;
  };

  // Helper to collect current form values from DOM
  const collectFormValues = () => {
    const values = {};
    const root = document.getElementById(HOST_ID);
    if (!root) return values;
    
    root.querySelectorAll('.ri-input').forEach(input => {
      const id = input.id;
      if (!id || !id.startsWith('ri-input-')) return;
      const fieldKey = id.replace('ri-input-', '');
      values[fieldKey] = input.value || '';
    });
    
    return values;
  };

  // --- Lookup / Address Helpers (load lookup.js like application.js)
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
      State: 'states'
    };
    Object.entries(map).forEach(([field, key]) => {
      const opts = lookup[key];
      if (Array.isArray(opts) && fieldMeta[field]) {
        fieldMeta[field].options = opts;
      }
    });
  };

  // Nominatim address search and suggestions (open-source lookup)
  let addressSearchTimeout = null;
  let addressSuggestionsEl = null;

  const searchAddress = async (q) => {
    if (!q || q.length < 3) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'EventRegistrationForm/1.0',
        'Accept': 'application/json'
      }
    });
    const json = await res.json().catch(() => []);
    return Array.isArray(json) ? json : [];
  };

  const fillAddressFromNominatim = (item) => {
    if (!item) return;
    const addr = item.address || {};
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
    const updates = { ...state.formData };
    updates.Street = street || (addr.road || '');
    updates.City = addr.city || addr.town || addr.village || addr.county || '';
    updates.State = addr.state || '';
    updates.Zip = addr.postcode || '';
    updates.Country = addr.country || '';
    setState({ formData: updates });
    // close suggestions
    if (addressSearchTimeout) clearTimeout(addressSearchTimeout);
    if (addressSuggestionsEl) addressSuggestionsEl.innerHTML = '';
  };

  const renderAddressSuggestions = (items) => {
    if (!addressSuggestionsEl) return;
    addressSuggestionsEl.innerHTML = '';
    if (!items || items.length === 0) return;
    items.forEach(it => {
      const label = it.display_name || [it.address?.road, it.address?.city, it.address?.state].filter(Boolean).join(', ');
      const node = h('div', { className: 'ri-address-suggestion' }, label);
      node.addEventListener('click', () => fillAddressFromNominatim(it));
      addressSuggestionsEl.appendChild(node);
    });
  };

  // Leaflet + Nominatim map helpers for event location
  let leafletPromise = null;
  const loadLeaflet = () => {
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve) => {
      // Inject CSS once
      const existingCss = Array.from(document.styleSheets).some(ss => ss.href && ss.href.includes('leaflet.css'));
      if (!existingCss) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      // Inject JS once
      if (window.L) return resolve(window.L);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => resolve(window.L);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
    return leafletPromise;
  };

  const geocodeLocation = async (q) => {
    if (!q || q.length < 3) return null;
    
    // Helper to extract address from strings like "Title - Address" or "Title: Address"
    const extractAddress = (str) => {
      const variants = [];
      
      // Try original string first
      variants.push(str.trim());
      
      // Try splitting by common separators (dash, colon, pipe, comma followed by space)
      const separators = [' - ', ' – ', ' — ', ': ', ' | ', ', '];
      for (const sep of separators) {
        if (str.includes(sep)) {
          const parts = str.split(sep);
          // Take parts that look like addresses (contain numbers or common address keywords)
          for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i].trim();
            if (/\d/.test(part) && part.length > 5) {
              variants.push(part);
              // Also try joining remaining parts from this point
              if (i < parts.length - 1) {
                variants.push(parts.slice(i).join(' ').trim());
              }
            }
          }
          // Also try everything after first separator
          const afterFirst = parts.slice(1).join(sep).trim();
          if (afterFirst.length > 3) variants.push(afterFirst);
        }
      }
      
      // Try to find part with street number pattern (digits followed by street name)
      const streetNumberMatch = str.match(/(\d+\s+[A-Z][a-z]+(?:\s+(?:St|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway))?.+(?:\d{5}(?:-\d{4})?)?)/i);
      if (streetNumberMatch && streetNumberMatch[1]) {
        variants.push(streetNumberMatch[1].trim());
      }
      
      return [...new Set(variants)]; // Remove duplicates
    };
    
    try {
      const addressVariants = extractAddress(q);
      
      // Try Photon API first (CORS-friendly, Nominatim-based)
      for (const addr of addressVariants) {
        try {
          const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(addr)}&limit=1`;
          const res = await fetch(url);
          
          if (res.ok) {
            const data = await res.json();
            if (data.features && data.features.length > 0) {
              const feature = data.features[0];
              const coords = feature.geometry?.coordinates;
              if (coords && coords.length >= 2) {
                const [lon, lat] = coords;
                if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                  return { 
                    lat, 
                    lon, 
                    label: feature.properties?.name || addr 
                  };
                }
              }
            }
          }
        } catch (e) {
          console.warn('Photon geocode attempt failed', e);
        }
        
        // Delay between attempts to respect rate limits
        if (addressVariants.indexOf(addr) < addressVariants.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      return null;
    } catch (e) {
      console.warn('Geocode failed', e);
      return null;
    }
  };

  let eventMapInstance = null;
  let eventMapMarker = null;
  let eventMapRenderedFor = null;

  const getCurrentEventLocation = () => {
    const src = state.campaignInfo || state.selectedEvent || null;
    if (!src) return null;
    // Prefer an explicit mapLocation (derived from address after ' - ') when available,
    // otherwise fall back to the readable location/venue string used in the card.
    return src.mapLocation || src.location || src.Location__c || src.Location || src.Venue__c || src.City__c || src.City || null;
  };

  const renderEventMap = async () => {
    const container = document.getElementById('ri-event-map');
    const locationText = (getCurrentEventLocation() || '').trim();

    if (!container || !locationText) {
      eventMapRenderedFor = null;
      if (eventMapInstance && eventMapInstance.remove) eventMapInstance.remove();
      eventMapInstance = null;
      eventMapMarker = null;
      return;
    }

    if (eventMapRenderedFor === locationText && eventMapInstance) return;
    eventMapRenderedFor = locationText;
    container.innerHTML = 'Loading map...';

    const coords = await geocodeLocation(locationText);
    if (!coords) { 
      // Fallback: show a link to Google Maps instead of embedded map
      container.innerHTML = '';
      const link = h('a', {
        href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`,
        target: '_blank',
        style: { 
          display: 'inline-block', 
          padding: '10px 16px', 
          backgroundColor: '#4285f4', 
          color: 'white', 
          textDecoration: 'none', 
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: '500'
        }
      }, '📍 View on Map');
      container.appendChild(link);
      return; 
    }
    
    const L = await loadLeaflet();
    if (!L) { container.innerHTML = ''; return; }

    // Reset any prior map
    if (eventMapInstance && eventMapInstance.remove) eventMapInstance.remove();
    eventMapInstance = null;
    eventMapMarker = null;
    container.innerHTML = '';

    eventMapInstance = L.map(container).setView([coords.lat, coords.lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00a9 OpenStreetMap contributors'
    }).addTo(eventMapInstance);
    eventMapMarker = L.marker([coords.lat, coords.lon]).addTo(eventMapInstance);
    eventMapMarker.bindPopup(coords.label || locationText).openPopup();
  };


  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================
  
  const renderField = (fieldKey) => {
    const meta = fieldMeta[fieldKey];
    const value = state.formData[fieldKey] || '';
    const labelText = orgTerms.labels[fieldKey] || meta.label;

    return h('div', { className: 'ri-field' },
      h('label', { className: 'ri-label' },
        labelText,
        meta.required ? h('span', { className: 'ri-required' }, ' *') : null
      ),
      meta.type === 'select' 
        ? (() => {
            const rawOpts = Array.isArray(meta.options) ? meta.options.slice() : [];
            const opts = rawOpts.slice();
            // Ensure current value is present at the front for saved values
            const includeCurrent = value && !opts.some(o => (typeof o === 'string' ? o : (o && (o.value || o.val || o.code || o.id || o.key || o.name))) == value);
            if (includeCurrent) opts.unshift(value);
            // Normalize options to {val, txt}
            const norm = opts.map(o => {
              if (typeof o === 'string' || typeof o === 'number') return { val: String(o), txt: String(o) };
              if (!o) return { val: '', txt: '' };
              const val = o.value || o.val || o.code || o.id || o.key || o.name || '';
              const txt = o.text || o.txt || o.label || o.name || String(val);
              return { val: String(val), txt: String(txt) };
            });
            return h('select', {
              id: `ri-input-${fieldKey}`,
              className: 'ri-input',
              value: value,
              onInput: (e) => updateField(fieldKey, e.target.value),
            },
              h('option', { value: '' }, 'Select...'),
              ...norm.map(opt => h('option', { value: opt.val }, opt.txt))
            );
          })()
        : meta.type === 'textarea'
        ? h('textarea', {
            id: `ri-input-${fieldKey}`,
            className: 'ri-input',
            value: value,
            placeholder: meta.placeholder || '',
            onInput: (e) => updateField(fieldKey, e.target.value),
          })
        : h('input', {
            id: `ri-input-${fieldKey}`,
            type: meta.type,
            className: 'ri-input',
            value: value,
            placeholder: meta.placeholder || '',
            onInput: (e) => updateField(fieldKey, e.target.value),
          })
    );
  };

  const renderProgress = () => {
    const currentPhase = phases[state.phase];
    const progress = ((state.step + 1) / currentPhase.steps.length) * 100;
    
    return h('div', { className: 'ri-progress-container' },
      h('div', { className: 'ri-progress-bar' },
        h('div', { 
          className: 'ri-progress-fill',
          style: { width: `${progress}%` }
        })
      ),
      h('div', { className: 'ri-progress-text' },
        `Step ${state.step + 1} of ${currentPhase.steps.length}`
      )
    );
  };

  const renderStepper = () => {
    const currentPhase = phases[state.phase];
    
    return h('div', { className: 'ri-stepper' },
      ...currentPhase.steps.map((step, index) => 
        h('div', {
          className: `ri-chip ${index === state.step ? 'active' : ''} ${index < state.step ? 'completed' : ''}`
        },
          index < state.step 
            ? h('span', { className: 'ri-checkmark' }, '✓')
            : h('span', { className: 'ri-step-number' }, String(index + 1)),
          h('span', { className: 'ri-step-title' }, step.title)
        )
      )
    );
  };

  const parseLocalDate = (d) => {
    if (!d) return null;
    if (typeof d === 'string') {
      // Treat YYYY-MM-DD as a local date to avoid off-by-one issues
      const m = d.match(/^\d{4}-\d{2}-\d{2}$/);
      if (m) {
        const [y, mo, da] = d.split('-').map(Number);
        return new Date(y, mo - 1, da);
      }
    }
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const formatDate = (d) => {
    if (!d) return null;
    try {
      const dt = parseLocalDate(d);
      if (!dt) return String(d);
      return dt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return String(d); }
  };

  const sameCalendarDate = (a, b) => {
    const da = parseLocalDate(a);
    const db = parseLocalDate(b);
    if (!da || !db) return false;
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  };

  const formatTime = (t) => {
    if (!t) return null;
    try {
      // If already a Date, format directly in local time
      if (t instanceof Date) {
        return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }

      if (typeof t === 'string') {
        const trimmed = t.trim();

        // Time only: HH:mm or HH:mm:ss (assume local clock, no TZ adjustment)
        const timeOnly = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/);
        if (timeOnly) {
          const h = parseInt(timeOnly[1], 10);
          const m = parseInt(timeOnly[2] || '0', 10);
          const s = parseInt(timeOnly[3] || '0', 10);
          const dt = new Date(1970, 0, 1, h, m, s);
          return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }

        // Full datetime (e.g., 2025-09-25T18:00:00.000Z). Parse locally ignoring TZ offset.
        const fullDateTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/);
        if (fullDateTime) {
          const [, y, mo, da, hh, mm, ss] = fullDateTime;
          const dt = new Date(Number(y), Number(mo) - 1, Number(da), Number(hh), Number(mm), Number(ss || 0));
          return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }

        // Fallback: strip milliseconds / Z suffix without shifting
        return trimmed.replace(/Z$/, '').replace(/\.\d+$/, '');
      }

      return String(t);
    } catch {
      return String(t);
    }
  };

  const renderEventHero = () => {
    if (!state.eventId) return null;

    if (state.campaignInfo) {
      const title = state.campaignInfo.name || 'Event';
      const loc = state.campaignInfo.location || null;
      const startRaw = state.campaignInfo.startDate;
      const endRaw = state.campaignInfo.endDate;
      const startDate = formatDate(startRaw);
      const endDate = formatDate(endRaw);
      const timeRange = (() => {
        const s = formatTime(state.campaignInfo.startTime || null);
        const e = formatTime(state.campaignInfo.endTime || null);
        if (s && e) return `${s} – ${e}`;
        if (s) return `${s}`;
        if (e) return `${e}`;
        return null;
      })();
      const datesSame = sameCalendarDate(startRaw, endRaw);

      const datePart = (startDate && endDate && !datesSame) ? `${startDate} to ${endDate}` : (startDate || endDate);

      const elements = [
        h('div', { className: 'ri-event-title' }, title),
        (loc ? h('div', { className: 'ri-event-meta-line' },
          h('span', { className: 'ri-event-badge ri-event-location' }, '📍'),
          h('span', { className: 'ri-event-meta-text' }, loc)
        ) : null),
        (datePart || timeRange ? h('div', { className: 'ri-event-meta-line' },
          h('span', { className: 'ri-event-badge ri-event-calendar' }, '🗓'),
          h('div', { className: 'ri-event-meta-text' },
            datePart ? h('div', { className: 'ri-event-date' }, `${datePart}`) : null,
            timeRange ? h('div', { className: 'ri-event-time' }, `${timeRange}`) : null
          )
        ) : null),
        // Display payment information if amount is set
        (state.paymentAmount > 0 ? h('div', { className: 'ri-event-meta-line ri-event-payment' },
          h('span', { className: 'ri-event-badge ri-event-payment-badge' }, '💳'),
          h('span', { className: 'ri-event-meta-text' }, 
            state.requiresPayment 
              ? `Price: $${state.paymentAmount.toFixed(2)}`
              : `Price: $${state.paymentAmount.toFixed(2)} (payment processing not available for amounts under $0.50)`
          )
        ) : null),
        // Map container (rendered only when a location exists)
        (loc ? h('div', { className: 'ri-event-hero-desc', style: { marginBottom: '10px', color: 'var(--muted)' } }, state.campaignInfo && state.campaignInfo.description ? state.campaignInfo.description : null) : null),
        (loc ? h('div', { 
          id: 'ri-event-map', 
          className: 'ri-event-map',
          style: { height: '260px', marginTop: '12px', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }
        }, h('div', { className: 'ri-map-placeholder' }, 'Loading map...')) : null)
      ];

      const contentEl = h('div', { className: 'ri-event-hero-content' }, ...elements.filter(Boolean));

      // If images exist, show the first image to the left of the content (full page)
      if (state.campaignInfo && state.campaignInfo.images && state.campaignInfo.images.length) {
        console.log('renderEventHero: Rendering with image', state.campaignInfo.images[0]);
        const img = state.campaignInfo.images[0];
        const mediaEl = h('div', { className: 'ri-event-hero-media' },
          h('img', { src: img.url, alt: img.title || title || 'Event image', style: { width: '100%', height: 'auto', borderRadius: '8px' } })
        );

        return h('div', { className: 'ri-event-hero ri-card ri-event-hero-with-media' }, mediaEl, contentEl);
      }

      console.log('renderEventHero: No images, state.campaignInfo =', state.campaignInfo);
      return h('div', { className: 'ri-event-hero ri-card' }, contentEl);
    }

    // If eventId present but no metadata yet
    return h('div', { className: 'ri-campaign-banner ri-info' },
      h('div', { className: 'ri-campaign-icon' }, 'i'),
      h('div', { className: 'ri-campaign-text' }, 'Event ID provided. Loading event details...')
    );
  };

  const renderEventList = () => {
    if (state.eventId || !Array.isArray(state.availableEvents) || state.availableEvents.length === 0) return null;

    const makeCard = (rec) => {
      const title = rec.Name || rec.name || 'Event';
      // Split title into main header and optional subtitle if a ' - ' exists
      const titleParts = (title || '').split(/\s*-\s*/);
      const mainTitle = titleParts[0] ? titleParts[0].trim() : title;
      const titleSubtitle = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : null;

      const startRaw = rec.StartDate || rec.startDate;
      const endRaw = rec.EndDate || rec.endDate;
      const startDate = formatDate(startRaw);
      const endDate = formatDate(endRaw);
      const datesSame = sameCalendarDate(startRaw, endRaw);
      const location = rec.Location__c || rec.Location || rec.Venue__c || rec.City__c || rec.City || null;
      // Split location into a short venue and a more specific address (used for map/address display)
      const locationParts = (location || '').split(/\s*-\s*/);
      const mainLocation = locationParts[0] ? locationParts[0].trim() : location;
      const locationAddress = locationParts.length > 1 ? locationParts.slice(1).join(' - ').trim() : null;

      // Extract start/end times for display
      const startTimeRaw = rec.StartTime__c || rec.startTime || null;
      const endTimeRaw = rec.EndTime__c || rec.endTime || null;
      const startTimeText = formatTime(startTimeRaw);
      const endTimeText = formatTime(endTimeRaw);
      const timeRange = (startTimeText && endTimeText) ? `${startTimeText} – ${endTimeText}` : (startTimeText || endTimeText || null);

      // Extract payment info (same rules as fetchEventMetadata)
      const requiresPaymentField = !!(rec.RequiresPayment__c || rec.requiresPayment);
      let paymentAmount = 0;
      const rawAmount = rec.PaymentAmount__c || rec.paymentAmount;
      if (rawAmount !== null && rawAmount !== undefined && rawAmount !== '') {
        const parsed = parseFloat(rawAmount);
        if (!isNaN(parsed) && parsed > 0) {
          paymentAmount = Math.round(parsed * 100) / 100;
        }
      }
      const requiresPayment = requiresPaymentField && paymentAmount >= 0.50;

      const onChoose = () => {
        const info = {
          id: rec.Id || rec.id || null,
          // keep full original name for backend, but provide displayName/subtitle for UI
          name: title,
          displayName: mainTitle,
          subtitle: titleSubtitle,
          startDate: startRaw || null,
          endDate: endRaw || null,
          description: rec.Description || rec.description || null,
          // expose both a short venue and a full address string suitable for map links
          location: mainLocation,
          mapLocation: locationAddress || location,
          startTime: rec.StartTime__c || rec.startTime || null,
          endTime: rec.EndTime__c || rec.endTime || null,
          images: Array.isArray(rec.images) ? rec.images : null,
        };
        const updates = { ...state.formData };
        // Keep EventName (backend field) as the original full title unless already set
        if (info.name && !updates.EventName) updates.EventName = info.name;
        if (info.startDate && !updates.EventDate) updates.EventDate = info.startDate;
        setState({ eventId: info.id, campaignInfo: info, selectedEvent: info, formData: updates });
      };

      const onCardKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChoose();
        }
      };

      const cardImageUrl = (rec.images && rec.images.length) ? (rec.images[0].url) : null;

      const cardImageEl = cardImageUrl ? h('div', { className: 'ri-event-card-media' },
        h('img', { src: cardImageUrl, alt: rec.Name || rec.name || '', style: { width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' } })
      ) : null;

      return h('div', { className: 'ri-event-card', tabindex: '0', onKeydown: onCardKeyDown, role: 'button', 'aria-label': `Choose ${mainTitle}` },
        cardImageEl,
        h('div', { className: 'ri-event-card-title' }, mainTitle),
        (titleSubtitle ? h('div', { className: 'ri-event-card-subtitle' }, titleSubtitle) : null),
        ((startDate || endDate || timeRange) ? h('div', { className: 'ri-event-card-date' },
          h('span', { className: 'ri-event-icon' }, '🗓'),
          h('div', { className: 'ri-event-card-date-content' },
            (startDate || endDate ? h('div', { className: 'ri-event-date' }, [
              (startDate ? `${startDate}` : null),
              (endDate && !datesSame ? ` to ${endDate}` : null)
            ].filter(Boolean).join('')) : null),
            (timeRange ? h('div', { className: 'ri-event-time' }, `${timeRange}`) : null)
          )
        ) : null),
        (mainLocation ? h('div', { className: 'ri-event-card-location' },
          h('span', { className: 'ri-event-icon' }, '📍'),
          h('div', { className: 'ri-event-card-location-content' }, mainLocation)
        ) : null),
        (rec.Description || rec.description ? h('div', { className: 'ri-event-card-desc' }, (rec.Description || rec.description)) : null),
        (paymentAmount > 0 ? h('div', { className: 'ri-event-card-optional ri-event-card-price' },
          '💳 ', requiresPayment ? `Price: $${paymentAmount.toFixed(2)}` : `Price: $${paymentAmount.toFixed(2)} (payment processing not available for amounts under $0.50)`
        ) : null),
        h('div', { className: 'ri-event-card-actions' },
          h('button', { className: 'ri-btn ri-btn-primary', onClick: onChoose }, 'Register for this event')
        )
      );
    };

    return h('div', { className: 'ri-event-list ri-card' },
      h('div', { className: 'ri-event-list-grid' },
        ...state.availableEvents.map(makeCard)
      )
    );
  };

  const clearSelection = () => {
    // Clear local selection and campaign info so the user returns to the event overview
    setState({ eventId: null, campaignInfo: null, selectedEvent: null, step: 0 });
    // scroll back to top of the event list for clarity
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* ignore */ }
  };

  const renderForm = () => {
    const currentPhase = phases[state.phase];
    const currentStep = currentPhase.steps[state.step];
    const stepCount = currentPhase.steps.length;

    return h('div', { className: 'ri-form-container' },
      h('div', { className: 'ri-header' },
        // Back button: show only when there was NO initial eventId provided and the user has selected an event
        (!initialEventId && state.selectedEvent)
          ? h('button', { className: 'ri-back', onClick: clearSelection, 'aria-label': 'Back to events' }, '← Back')
          : null,
        (currentStep.description ? h('div', { className: 'ri-subtitle' }, currentStep.description) : null)
      ),
      // Initial loading overlay
      state.initialLoading ? h('div', { className: 'ri-loading-overlay', role: 'status', 'aria-hidden': 'false' },
        h('div', { className: 'ri-spinner', 'aria-hidden': 'true' }),
        h('div', { className: 'ri-loading-text' }, 'Loading...'),
        h('div', { className: 'ri-loading-subtext' }, 'Please wait while we fetch event details')
      ) : null,
      // If an event has not been selected, show available events
      renderEventList(),
      renderEventHero(),
      stepCount > 1 ? renderProgress() : null,
      stepCount > 1 ? renderStepper() : null,
      (state.eventId || state.selectedEvent)
        ? h('div', { className: 'ri-step-content' },
            h('h2', { className: 'ri-step-heading' }, currentStep.title),
            // Custom responsive layout for Contact Information step
            ...(
              currentStep.title === 'Contact Information'
              ? [ h('div', { className: 'ri-contact-grid' },
                  // Row 1 - First / Last
                  h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                    h('div', { style: { flex: '1 1 200px' } }, renderField('FirstName')),
                    h('div', { style: { flex: '1 1 200px' } }, renderField('LastName'))
                  ),
                  // Row 2 - Email / Phone
                  h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                    h('div', { style: { flex: '1 1 300px' } }, renderField('Email')),
                    h('div', { style: { flex: '1 1 200px' } }, renderField('Phone'))
                  ),
                  // Row 3 - Street (full width)
                  h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                    h('div', { style: { flex: '1 1 100%' } }, renderField('Street'), h('div', { className: 'ri-address-suggestions' }))
                  ),
                  // Row 4 - City / State / Zip / Country
                  h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                    h('div', { style: { flex: '1 1 160px' } }, renderField('City')),
                    h('div', { style: { flex: '1 1 160px' } }, renderField('State')),
                    h('div', { style: { flex: '1 1 120px' } }, renderField('Zip')),
                    h('div', { style: { flex: '1 1 160px' } }, renderField('Country'))
                  )
                ) ]
              : currentStep.fields.map(f => renderField(f))
            )
          )
        : null,
      state.error 
        ? h('div', { className: 'ri-error' }, state.error)
        : null,
      (state.eventId || state.selectedEvent)
        ? h('div', { className: 'ri-actions' },
            state.step > 0 
              ? h('button', {
                  className: 'ri-btn ri-btn-secondary',
                  onClick: prevStep,
                }, 'Previous')
              : null,
            h('button', {
              className: 'ri-btn ri-btn-primary',
              onClick: nextStep,
              disabled: state.loading || !canProceed(),
            }, state.loading ? 'Submitting...' : state.step < currentPhase.steps.length - 1 ? 'Next' : 'Submit')
          )
        : null
    );
  };

  const renderSuccess = () => {
    const eventName = state.campaignInfo && state.campaignInfo.name ? state.campaignInfo.name : null;

    const elements = [
      h('div', { className: 'ri-success-title' }, eventName ? `You have successfully registered for ${eventName}!` : 'You have successfully registered!'),
      h('div', { className: 'ri-success-sub' }, 'Your confirmation code is:'),
      h('div', { className: 'ri-code-display' }, state.formCode || 'N/A')
    ];

    // Add payment information if applicable
    if (state.requiresPayment && state.paymentAmount > 0) {
      elements.push(
        h('div', { className: 'ri-payment-section' },
          h('div', { className: 'ri-payment-section-title' }, '💳 Payment Information'),
          h('div', { className: 'ri-payment-amount' }, 
            `Amount Due: $${state.paymentAmount.toFixed(2)}`
          ),
          state.paymentError 
            ? h('div', { className: 'ri-payment-error' }, state.paymentError)
            : state.paymentCompleted
            ? h('div', { className: 'ri-payment-success' }, '✓ Payment window opened. Please complete your payment.')
            : null
        )
      );
    }

    // Add calendar options when campaignInfo is present
    if (state.campaignInfo) {
      const ev = state.campaignInfo;
      const googleDates = (() => {
        const start = (ev.startDate && ev.startTime) ? new Date(`${ev.startDate} ${ev.startTime}`) : (ev.startDate ? new Date(ev.startDate) : null);
        const end = (ev.endDate && ev.endTime) ? new Date(`${ev.endDate} ${ev.endTime}`) : (ev.endDate ? new Date(ev.endDate) : null);
        const fmt = (d) => {
          if (!d || isNaN(d.getTime())) return '';
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
        };
        const s = fmt(start);
        const e = fmt(end) || s;
        return s && e ? `${s}/${e}` : '';
      })();

      const googleParams = new URLSearchParams({ action: 'TEMPLATE', text: ev.name || '', details: ev.description || '', location: ev.location || '', dates: googleDates || undefined });
      const googleUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;

      // Build Outlook web URL (compose deeplink)
      const fmtIso = (d) => {
        if (!d || isNaN(d.getTime())) return '';
        return d.toISOString();
      };
      const startDt = (ev.startDate && ev.startTime) ? new Date(`${ev.startDate} ${ev.startTime}`) : (ev.startDate ? new Date(ev.startDate) : null);
      const endDt = (ev.endDate && ev.endTime) ? new Date(`${ev.endDate} ${ev.endTime}`) : (ev.endDate ? new Date(ev.endDate) : null);
      const outlookParams = new URLSearchParams();
      if (startDt) outlookParams.set('startdt', fmtIso(startDt));
      if (endDt) outlookParams.set('enddt', fmtIso(endDt));
      outlookParams.set('subject', ev.name || '');
      if (ev.description) outlookParams.set('body', ev.description);
      if (ev.location) outlookParams.set('location', ev.location);
      const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`;

      elements.push(
        h('div', { className: 'ri-success-calendar', style: { display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '18px' } },
          h('a', { className: 'ri-btn ri-btn-secondary', href: googleUrl, target: '_blank', rel: 'noopener' }, 'Add to Google Calendar'),
          h('a', { className: 'ri-btn ri-btn-secondary', href: outlookUrl, target: '_blank', rel: 'noopener' }, 'Add to Outlook.com'),
          h('button', { className: 'ri-btn ri-btn-secondary', onClick: () => {
            // Download .ics (works for Apple Calendar, Outlook desktop, etc.)
            try {
              const start = startDt;
              const end = endDt;
              const uid = `${Date.now()}@event`;
              const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
              const fmt = (d) => {
                if (!d || isNaN(d.getTime())) return '';
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
              };
              const lines = [
                'BEGIN:VCALENDAR',
                'VERSION:2.0',
                `PRODID:-//${orgTerms.orgName}//Event//EN`,
                'CALSCALE:GREGORIAN',
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
              ];
              if (start) lines.push(`DTSTART:${fmt(start)}`);
              if (end) lines.push(`DTEND:${fmt(end)}`);
              lines.push(`SUMMARY:${(ev.name || '').replace(/\n/g,'\\n')}`);
              if (ev.description) lines.push(`DESCRIPTION:${(ev.description || '').replace(/\n/g,'\\n')}`);
              if (ev.location) lines.push(`LOCATION:${(ev.location || '').replace(/\n/g,'\\n')}`);
              lines.push('END:VEVENT','END:VCALENDAR');
              const ics = lines.join('\r\n');
              const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${(ev.name || 'event').replace(/[^a-z0-9_-]/gi,'_')}.ics`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            } catch (e) { console.error('Failed to download ics', e); }
          } }, 'Add to Apple / Download .ics')
        )
      );
    }

    return h('div', { className: 'ri-success-container' }, ...elements.filter(Boolean));
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  
  const render = () => {
    const root = document.getElementById(HOST_ID);
    if (!root) return;

    root.innerHTML = '';
    
    if (state.status === 'success') {
      root.appendChild(renderSuccess());
    } else {
      root.appendChild(renderForm());
    }
  
    // Render event map (async; no-op when location missing)
    renderEventMap();

    try {
      addressSuggestionsEl = root.querySelector('.ri-address-suggestions');
      const streetInput = document.getElementById('ri-input-Street');
      if (streetInput && !streetInput._riHandlerAttached) {
        streetInput._riHandlerAttached = true;
        streetInput.addEventListener('input', (e) => {
          const q = (e.target.value || '').toString().trim();
          if (addressSearchTimeout) clearTimeout(addressSearchTimeout);
          addressSearchTimeout = setTimeout(async () => {
            if (!q || q.length < 3) { if (addressSuggestionsEl) addressSuggestionsEl.innerHTML = ''; return; }
            const items = await searchAddress(q);
            renderAddressSuggestions(items);
          }, 300);
        });
      }
    } catch (e) { /* ignore */ }
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  // Fetch event metadata when eventId is present
  const fetchEventMetadata = async () => {
    if (!state.eventId) return;
    try {
      const formConfigParam = encodeURIComponent(JSON.stringify(FORM_CONFIG));
      const url = `${ENDPOINT}?eventid=${encodeURIComponent(state.eventId)}&formConfig=${formConfigParam}`;
      const res = await fetch(url);
      if (!res.ok) {
        // Do not surface as error; proceed gracefully
        return;
      }
      const data = await res.json();
      const c = data && data.campaign ? data.campaign : null;
      console.log('fetchEventMetadata: campaign data =', c);
      console.log('fetchEventMetadata: images =', c && c.images);
      if (c) {
        const info = {
          id: c.Id || c.id || null,
          name: c.Name || c.name || null,
          startDate: c.StartDate || c.startDate || null,
          endDate: c.EndDate || c.endDate || null,
          description: c.Description || c.description || null,
          location: c.Location__c || c.Location || c.Venue__c || c.City__c || c.City || null,
          startTime: c.StartTime__c || c.startTime || null,
          endTime: c.EndTime__c || c.endTime || null,
          images: Array.isArray(c.images) ? c.images : null,
        };
        console.log('fetchEventMetadata: info object =', info);
        // Extract payment information from campaign
        const requiresPaymentField = !!(c.RequiresPayment__c || c.requiresPayment);
        // Parse currency field - ensure it's a valid number and round to 2 decimal places
        let paymentAmount = 0;
        const rawAmount = c.PaymentAmount__c || c.paymentAmount;
        console.debug('Raw payment amount from Salesforce:', rawAmount);
        if (rawAmount !== null && rawAmount !== undefined && rawAmount !== '') {
          const parsed = parseFloat(rawAmount);
          if (!isNaN(parsed) && parsed > 0) {
            // Round to 2 decimal places to handle floating point precision
            paymentAmount = Math.round(parsed * 100) / 100;
          }
        }
        console.debug('Parsed payment amount:', paymentAmount);
        
        // Only require payment if checkbox is checked AND amount meets Stripe minimum of $0.50
        const requiresPayment = requiresPaymentField && paymentAmount >= 0.50;
        
        // Pre-fill event name/date when available
        const updates = { ...state.formData };
        if (info.name && !updates.EventName) updates.EventName = info.name;
        if (info.startDate && !updates.EventDate) updates.EventDate = info.startDate;
        setState({ campaignInfo: info, formData: updates, requiresPayment, paymentAmount });
      }
    } catch (e) {
      // Silent failure; form continues as normal
      console.warn('Event metadata fetch failed', e);
    }
  };

  // Fetch active events when no eventId provided
  const fetchActiveEvents = async () => {
    if (state.eventId) return;
    try {
      const formConfigParam = encodeURIComponent(JSON.stringify(FORM_CONFIG));
      const url = `${ENDPOINT}?listActiveEvents=true&formConfig=${formConfigParam}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const list = data && Array.isArray(data.campaigns) ? data.campaigns : [];
      if (list.length > 0) {
        // Sort events by start date (oldest first). Use parseLocalDate to handle multiple formats.
        const getStartTime = (rec) => {
          const d = parseLocalDate(rec.StartDate || rec.startDate);
          return d ? d.getTime() : Infinity;
        };
        const sorted = list.slice().sort((a, b) => {
          const ta = getStartTime(a);
          const tb = getStartTime(b);
          if (ta !== tb) return ta - tb;
          const an = (a.Name || a.name || '').toString();
          const bn = (b.Name || b.name || '').toString();
          return an.localeCompare(bn);
        });
        setState({ availableEvents: sorted });
      }
    } catch (e) {
      console.warn('Active events fetch failed', e);
    }
  };

  // Dynamically insert any configured custom fields
  const applyCustomFields = () => {
    const cfg = (FORM_CONFIG && FORM_CONFIG.customFields) ? FORM_CONFIG.customFields : null;
    if (!Array.isArray(cfg) || cfg.length === 0) return;

    // Extend field metadata and SF mapping
    const addedFieldKeys = [];
    cfg.forEach(def => {
      if (!def || !def.key || !def.sfField) return;
      // Add metadata
      if (!fieldMeta[def.key]) {
        fieldMeta[def.key] = {
          label: def.label || def.key,
          type: def.type || 'text',
          required: !!def.required,
          options: def.options || undefined,
        };
        addedFieldKeys.push(def.key);
      }
      // Map to Salesforce field
      if (!fieldToSf[def.key]) {
        fieldToSf[def.key] = def.sfField;
      }
    });

    if (addedFieldKeys.length === 0) return;

    // Insert a new step after Event Details
    const stepIndex = phases.initial.steps.findIndex(s => s.title === 'Event Details');
    const insertAt = stepIndex >= 0 ? stepIndex + 1 : phases.initial.steps.length;
    phases.initial.steps.splice(insertAt, 0, {
      title: 'Event Custom Fields',
      description: 'Additional information for this event',
      fields: addedFieldKeys,
    });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      applyCustomFields();
      // Load lookup options (countries/states) and apply
      loadLookup().then(lookup => {
        applyLookupOptions(lookup);
        render();
        // Attach address suggestion handlers after render
        setTimeout(() => {
          const root = document.getElementById(HOST_ID);
          if (!root) return;
          addressSuggestionsEl = root.querySelector('.ri-address-suggestions');
          const streetInput = document.getElementById('ri-input-Street');
          if (streetInput) {
            streetInput.addEventListener('input', (e) => {
              const q = (e.target.value || '').toString().trim();
              if (addressSearchTimeout) clearTimeout(addressSearchTimeout);
              addressSearchTimeout = setTimeout(async () => {
                if (!q || q.length < 3) { if (addressSuggestionsEl) addressSuggestionsEl.innerHTML = ''; return; }
                const items = await searchAddress(q);
                renderAddressSuggestions(items);
              }, 300);
            });
          }
        }, 0);

        // Fetch campaign metadata after initial render so banner can update.
        // Keep the initial loading indicator visible until both calls finish.
        setState({ initialLoading: true });
        Promise.allSettled([fetchEventMetadata(), fetchActiveEvents()]).then(() => {
          setState({ initialLoading: false });
        }).catch(() => {
          setState({ initialLoading: false });
        });
      }).catch(() => {
        // Even if lookup fails, proceed
        render();
        setState({ initialLoading: true });
        Promise.allSettled([fetchEventMetadata(), fetchActiveEvents()]).then(() => {
          setState({ initialLoading: false });
        }).catch(() => {
          setState({ initialLoading: false });
        });
      });
    });
    
    // For testing
    window.__riTest = window.__riTest || {};
    window.__riTest.event = { state, setState, submitForm };
  }

})();
