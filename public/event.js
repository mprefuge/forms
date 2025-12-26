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
  const HOST_ID = "event-app";

  const orgTerms = {
    orgName: "Refuge International",
    labels: {
      Zip: "Postal Code",
      State: "State/Province",
      Country: "Country/Region",
    },
    phaseNames: {
      initial: "Event Registration",
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

  // ============================================================================
  // FORM CONFIGURATION
  // ============================================================================
  const FORM_CONFIG = {
    id: 'event',
    name: 'Event Registration',
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
      eventQueryFields: ['Id','Name','StartDate','EndDate','Description', 'Location__c','StartTime__c','EndTime__c']
    }
  };

  // ============================================================================
  // FORM PHASES
  // ============================================================================
  const phases = {
    initial: {
      name: "Event Registration",
      description: "Your contact details",
      estimatedTime: 2,
      steps: [
        {
          title: "Contact Information",
          description: "Please provide your details",
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
    State: { label: "State/Province", type: "text", required: true },
    Zip: { label: "Postal Code", type: "text", required: true },
    Country: { label: "Country/Region", type: "text", required: true },
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
    eventId: eventId,  // Store eventId from URL
    campaignInfo: null, // Store campaign info if successfully fetched
    selectedEvent: null, // Store event chosen from list when no eventId in URL
    availableEvents: null // When no eventId, list of active events
  };

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') {
        el.className = v;
      } else if (k === 'disabled') {
        if (v) el.setAttribute('disabled', '');
      } else if (k.startsWith('on')) {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else {
        el.setAttribute(k, v);
      }
    });
    kids.flat().forEach(kid => {
      if (typeof kid === 'string') el.appendChild(document.createTextNode(kid));
      else if (kid) el.appendChild(kid);
    });
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
        status: 'success', 
        formCode: result.formCode,
        campaignInfo: result.campaignInfo,  // Backend returns campaign info if associated
        loading: false 
      });

    } catch (error) {
      console.error('Submission error:', error);
      setState({ 
        error: error.message || 'Failed to submit. Please try again.', 
        loading: false 
      });
    }
  };

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  
  const nextStep = () => {
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
    setState({ 
      formData: { ...state.formData, [fieldKey]: value },
      error: null 
    });
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
        ? h('select', {
            className: 'ri-input',
            value: value,
            onChange: (e) => updateField(fieldKey, e.target.value),
          },
          h('option', { value: '' }, 'Select...'),
          ...(meta.options || []).map(opt => 
            h('option', { value: opt }, opt)
          )
        )
        : meta.type === 'textarea'
        ? h('textarea', {
            className: 'ri-input',
            value: value,
            placeholder: meta.placeholder || '',
            onChange: (e) => updateField(fieldKey, e.target.value),
          })
        : h('input', {
            type: meta.type,
            className: 'ri-input',
            value: value,
            placeholder: meta.placeholder || '',
            onChange: (e) => updateField(fieldKey, e.target.value),
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
      return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

      return h('div', { className: 'ri-event-hero ri-card' },
        h('div', { className: 'ri-event-title' }, title),
        (loc ? h('div', { className: 'ri-event-meta-line' },
          h('span', { className: 'ri-event-badge ri-event-location' }, '📍'),
          h('span', { className: 'ri-event-meta-text' }, loc)
        ) : null),
        (datePart || timeRange ? h('div', { className: 'ri-event-meta-line' },
          h('span', { className: 'ri-event-badge ri-event-calendar' }, '🗓'),
          h('span', { className: 'ri-event-meta-text' },
            [
              (datePart ? `${datePart}` : null),
              (timeRange ? ` • ${timeRange}` : null)
            ].filter(Boolean).join('')
          )
        ) : null)
      );
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
      const startRaw = rec.StartDate || rec.startDate;
      const endRaw = rec.EndDate || rec.endDate;
      const startDate = formatDate(startRaw);
      const endDate = formatDate(endRaw);
      const datesSame = sameCalendarDate(startRaw, endRaw);
      const location = rec.Location__c || rec.Location || rec.Venue__c || rec.City__c || rec.City || null;
      const onChoose = () => {
        const info = {
          id: rec.Id || rec.id || null,
          name: title,
          startDate: startRaw || null,
          endDate: endRaw || null,
          description: rec.Description || rec.description || null,
          location,
          startTime: rec.StartTime__c || rec.startTime || null,
          endTime: rec.EndTime__c || rec.endTime || null,
        };
        const updates = { ...state.formData };
        if (info.name && !updates.EventName) updates.EventName = info.name;
        if (info.startDate && !updates.EventDate) updates.EventDate = info.startDate;
        setState({ eventId: info.id, campaignInfo: info, selectedEvent: info, formData: updates });
      };

      return h('div', { className: 'ri-event-card' },
        h('div', { className: 'ri-event-card-title' }, title),
        (location ? h('div', { className: 'ri-event-card-meta' }, '📍 ', location) : null),
        (startDate || endDate ? h('div', { className: 'ri-event-card-meta' }, '🗓 ', [
          (startDate ? `${startDate}` : null),
          (endDate && !datesSame ? ` to ${endDate}` : null)
        ].filter(Boolean).join('')) : null),
        h('div', { className: 'ri-event-card-actions' },
          h('button', { className: 'ri-btn ri-btn-primary', onClick: onChoose }, 'Register for this event')
        )
      );
    };

    return h('div', { className: 'ri-event-list ri-card' },
      h('div', { className: 'ri-event-list-header' },
        h('div', { className: 'ri-event-list-title' }, 'Choose an Event')
      ),
      h('div', { className: 'ri-event-list-grid' },
        ...state.availableEvents.map(makeCard)
      )
    );
  };

  const renderForm = () => {
    const currentPhase = phases[state.phase];
    const currentStep = currentPhase.steps[state.step];
    const stepCount = currentPhase.steps.length;

    return h('div', { className: 'ri-form-container' },
      h('div', { className: 'ri-header' },
        h('div', { className: 'ri-title' }, FORM_CONFIG.name),
        h('div', { className: 'ri-subtitle' }, currentStep.description || '')
      ),
      // If an event has not been selected, show available events
      renderEventList(),
      renderEventHero(),
      stepCount > 1 ? renderProgress() : null,
      stepCount > 1 ? renderStepper() : null,
      h('div', { className: 'ri-step-content' },
        h('h2', { className: 'ri-step-heading' }, currentStep.title),
        ...currentStep.fields.map(renderField)
      ),
      state.error 
        ? h('div', { className: 'ri-error' }, state.error)
        : null,
      h('div', { className: 'ri-actions' },
        state.step > 0 
          ? h('button', {
              className: 'ri-btn ri-btn-secondary',
              onClick: prevStep,
            }, 'Previous')
          : null,
        h('button', {
          className: 'ri-btn ri-btn-primary',
          onClick: nextStep,
          disabled: state.loading,
        }, state.loading ? 'Submitting...' : state.step < currentPhase.steps.length - 1 ? 'Next' : 'Submit')
      )
    );
  };

  const renderSuccess = () => {
    return h('div', { className: 'ri-success-container' },
      h('div', { className: 'ri-success-icon' }, '✓'),
      h('div', { className: 'ri-success-title' }, 'Registration Complete!'),
      h('div', { className: 'ri-success-message' },
        'Thank you for registering. Your confirmation code is:'
      ),
      h('div', { className: 'ri-code-display' }, state.formCode || 'N/A'),
      state.campaignInfo 
        ? h('div', { className: 'ri-campaign-success' },
            h('div', { className: 'ri-campaign-success-icon' }, '🎉'),
            h('div', { className: 'ri-campaign-success-text' },
              `Successfully registered for: ${state.campaignInfo.name}`
            )
          )
        : null,
      h('div', { className: 'ri-success-note' },
        'Please save this code. You can use it to retrieve your registration information.'
      )
    );
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
        };
        // Pre-fill event name/date when available
        const updates = { ...state.formData };
        if (info.name && !updates.EventName) updates.EventName = info.name;
        if (info.startDate && !updates.EventDate) updates.EventDate = info.startDate;
        setState({ campaignInfo: info, formData: updates });
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
        setState({ availableEvents: list });
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
      render();
      // Fetch campaign metadata after initial render so banner can update
      fetchEventMetadata();
      // If no event selected, fetch active events
      fetchActiveEvents();
    });
    
    // For testing
    window.__riTest = window.__riTest || {};
    window.__riTest.event = { state, setState, submitForm };
  }

})();
